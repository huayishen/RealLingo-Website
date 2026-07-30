/* Shared onboarding-quiz engine: state, render helpers, navigation,
   review page, submit. Flow-specific pages define ROLE_KEYS, ROLE_DISPLAY,
   SECTION_LABEL, ALL_SECTION_STEPS, and SITE_ROOT (relative path back to
   the site root) BEFORE loading this file's sibling <script> tags don't
   matter for that — only that those globals exist by the time a user
   actually interacts with the page (after DOMContentLoaded). This file
   must never declare any of those four names itself. */

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ════════════════════════════════════════════════════════════
   SCREEN SWITCHER
════════════════════════════════════════════════════════════ */
const ALL_SCREENS = ['s-intro','s-form'];
function showScreen(id) {
  ALL_SCREENS.forEach(sid =>
    document.getElementById(sid)?.classList.toggle('off', sid !== id)
  );
}

/* ════════════════════════════════════════════════════════════
   FORM STATE
════════════════════════════════════════════════════════════ */
const formData = {};
let selectedRoles = new Set();
let _cachedSections = null;
let sectIdx = 0;
let stepIdx = 0;
// Edit mode (?edit=1): logged-in user editing an existing profile. Loads data
// from Supabase instead of starting fresh, and skips the Create Account step.
let EDIT_MODE = false;
try { EDIT_MODE = new URLSearchParams(location.search).get('edit') === '1'; } catch (e) {}
// Set when the user taps "Skip for now" during signup — they jump straight to
// Create Account and the profile is saved as onboarding_complete = false so the
// dashboard can invite them to finish later.
let SKIPPED_ONBOARDING = false;
// Profile Completion Mode: an ALREADY-AUTHENTICATED user is running the quiz to
// finish/edit their profile. Detected at init from the session (see
// onboardingInit). Behaves like EDIT_MODE — no Create Account step, no email/
// password/verify; the answers upsert onto their existing profile. editing()
// is the single predicate for "this is not a fresh registration".
let COMPLETION_MODE = false;
function editing() { return EDIT_MODE || COMPLETION_MODE; }

// Add-a-role mode (?addrole=1): a logged-in user adding roles from their
// dashboard. Skips the General section (name/username/languages/location are
// already set) — shows just the role picker — and only asks the questions for
// the NEWLY-selected roles (existing roles are preserved but not re-asked).
let ADD_ROLE_MODE = false;
try { ADD_ROLE_MODE = new URLSearchParams(location.search).get('addrole') === '1'; } catch (e) {}
let _existingRoles = null;   // snapshot of roles the user already had (set in onboardingInit)
function addRoleActive() { return ADD_ROLE_MODE && _existingRoles !== null; }

function getActiveSections() {
  if (!_cachedSections) {
    _cachedSections = ['general'];
    ROLE_KEYS.forEach(r => {
      if (!selectedRoles.has(r)) return;
      // In add-role mode only the freshly-picked roles get their own section.
      if (addRoleActive() && _existingRoles.has(r)) return;
      _cachedSections.push(r);
    });
    // Contact (email/phone) is no longer a quiz step — it's folded into the
    // 'createAccount' step after review, so email is asked exactly once.
    // In edit mode the user already has an account, so we stop at review.
    _cachedSections.push('review');
    if (!editing()) _cachedSections.push('createAccount');
  }
  return _cachedSections;
}
function invalidateSections() { _cachedSections = null; }

// Display label for a section key. The engine-owned sections ('createAccount',
// and 'review' as a fallback) aren't in the per-flow SECTION_LABEL map.
function sectionLabel(key) {
  if (typeof SECTION_LABEL !== 'undefined' && SECTION_LABEL[key]) return SECTION_LABEL[key];
  if (key === 'createAccount') return 'Create Account';
  if (key === 'review') return 'Review';
  return key;
}

function getSectionSteps(key) {
  // In add-role mode the General section collapses to just the role picker.
  if (addRoleActive() && key === 'general') {
    var pickers = (ALL_SECTION_STEPS.general || []).filter(function (s) { return s.isRolePicker; });
    if (pickers.length) return pickers;
  }
  return (ALL_SECTION_STEPS[key] || []).filter(step => !step.skip || !step.skip());
}
function currentSectionKey() { return getActiveSections()[sectIdx]; }
function currentSteps() { return getSectionSteps(currentSectionKey()); }

/* Reads ?sel=a,b,c from the URL — used by each flow page to pre-seed
   selectedRoles (or formData.hiringFor for the Hire flow) when arriving
   from the branch-selector, and to decide whether to skip the "I am..."
   / "I'm hiring..." question. Returns null if absent/empty. */
function getPresetSel() {
  const v = new URLSearchParams(location.search).get('sel');
  if (!v) return null;
  const list = v.split(',').map(s => s.trim()).filter(Boolean);
  return list.length ? list : null;
}

/* ════════════════════════════════════════════════════════════
   HTML HELPERS
════════════════════════════════════════════════════════════ */
function currencyHtml(id, saved) {
  const s = saved || 'SAR';
  return `<select class="fs" id="${id}">${
    CURRENCIES.map(g =>
      `<optgroup label="${g.g}">${
        g.opts.map(([v,l]) => `<option value="${v}"${s===v?' selected':''}>${v} – ${l}</option>`).join('')
      }</optgroup>`
    ).join('')
  }</select>`;
}

function sliderHtml(tid, min, max, smin, smax) {
  return `
    <div class="rslider">
      <div class="rslider-inputs">
        <div class="rslider-input-field">
          <label class="rslider-input-lbl" for="${tid}-min-input">Minimum</label>
          <input type="number" inputmode="numeric" class="rslider-input" id="${tid}-min-input" min="${min}" max="${max}" placeholder="0">
        </div>
        <div class="rslider-input-field">
          <label class="rslider-input-lbl" for="${tid}-max-input">Maximum</label>
          <input type="number" inputmode="numeric" class="rslider-input" id="${tid}-max-input" min="${min}" max="${max}" placeholder="0">
        </div>
      </div>
      <div class="rslider-track-wrap">
        <div class="rslider-track" id="${tid}">
          <div class="rslider-fill" id="${tid}-fill"></div>
          <div class="rslider-handle" id="${tid}-hmin"><div class="rslider-lbl" id="${tid}-lmin"></div></div>
          <div class="rslider-handle" id="${tid}-hmax"><div class="rslider-lbl" id="${tid}-lmax"></div></div>
        </div>
        <div class="slider-ends"><span>${(min).toLocaleString()}</span><span>${(max).toLocaleString()}+</span></div>
      </div>
    </div>
    <div class="rs-value" id="${tid}-value"></div>`;
}

function initSlider(tid, min, max, snapStep, minKey, maxKey, currId) {
  const track = document.getElementById(tid);
  if (!track) return;
  let vMin = Math.max(min, formData[minKey] ?? min);
  let vMax = Math.min(max, formData[maxKey] ?? Math.round((min+max)/2));
  if (vMin >= vMax) { vMin = min; vMax = Math.round((min+max)/2); }
  const fill = document.getElementById(`${tid}-fill`);
  const hMin = document.getElementById(`${tid}-hmin`);
  const hMax = document.getElementById(`${tid}-hmax`);
  const lMin = document.getElementById(`${tid}-lmin`);
  const lMax = document.getElementById(`${tid}-lmax`);
  const valEl = document.getElementById(`${tid}-value`);
  const minInput = document.getElementById(`${tid}-min-input`);
  const maxInput = document.getElementById(`${tid}-max-input`);
  const snap = v => Math.round(v/snapStep)*snapStep;
  const pct  = v => ((v-min)/(max-min))*100;
  const fmt  = v => v>=max ? v.toLocaleString()+'+' : v.toLocaleString();
  const curr = () => currId ? (document.getElementById(currId)?.value||'') : '';
  // "skip" leaves whichever input the visitor is actively typing in alone —
  // otherwise re-writing its value mid-keystroke (e.g. clamping "150" back
  // to "100" as soon as a "1" is typed) would fight the visitor's typing.
  function render(skip) {
    const p1=pct(vMin), p2=pct(vMax);
    hMin.style.left=p1+'%'; hMax.style.left=p2+'%';
    fill.style.left=p1+'%'; fill.style.width=(p2-p1)+'%';
    lMin.textContent=fmt(vMin); lMax.textContent=fmt(vMax);
    if (minInput && skip!=='min') minInput.value = vMin;
    if (maxInput && skip!=='max') maxInput.value = vMax;
    if (valEl) valEl.innerHTML=`<span class="rs-value-lbl">Selected Range</span><strong>${fmt(vMin)} – ${fmt(vMax)}</strong> ${curr()}`;
    formData[minKey]=vMin; formData[maxKey]=vMax;
    requestAnimationFrame(()=>{
      const r1=lMin.getBoundingClientRect(), r2=lMax.getBoundingClientRect();
      const ov=r1.right+10-r2.left;
      if(ov>0){const p=ov/2+2;lMin.style.transform=`translateX(calc(-50% - ${p}px))`;lMax.style.transform=`translateX(calc(-50% + ${p}px))`;}
      else{lMin.style.transform='translateX(-50%)';lMax.style.transform='translateX(-50%)';}
    });
  }
  function fromX(cx) {
    const r=track.getBoundingClientRect();
    return snap(min+Math.max(0,Math.min(1,(cx-r.left)/r.width))*(max-min));
  }
  // The track gets a "dragging-active" class while a handle is actively
  // being dragged, so CSS can suppress the fill/handle position transition
  // during the drag itself (it would otherwise lag behind the pointer) while
  // keeping it for typed values and track clicks, where an animated jump
  // to the new position reads as more polished than an instant snap.
  hMin.addEventListener('pointerdown',e=>{hMin.setPointerCapture(e.pointerId);hMin.classList.add('dragging');track.classList.add('dragging-active');e.preventDefault();});
  hMin.addEventListener('pointermove',e=>{if(!hMin.hasPointerCapture(e.pointerId))return;vMin=Math.max(min,Math.min(fromX(e.clientX),vMax-snapStep));render();});
  hMin.addEventListener('pointerup',()=>{hMin.classList.remove('dragging');track.classList.remove('dragging-active');});
  hMax.addEventListener('pointerdown',e=>{hMax.setPointerCapture(e.pointerId);hMax.classList.add('dragging');track.classList.add('dragging-active');e.preventDefault();});
  hMax.addEventListener('pointermove',e=>{if(!hMax.hasPointerCapture(e.pointerId))return;vMax=Math.min(max,Math.max(fromX(e.clientX),vMin+snapStep));render();});
  hMax.addEventListener('pointerup',()=>{hMax.classList.remove('dragging');track.classList.remove('dragging-active');});
  track.addEventListener('click',e=>{
    if(e.target.classList.contains('rslider-handle'))return;
    const v=fromX(e.clientX);
    if(Math.abs(v-vMin)<=Math.abs(v-vMax)){vMin=Math.max(min,Math.min(v,vMax-snapStep));}
    else{vMax=Math.min(max,Math.max(v,vMin+snapStep));}
    render();
  });
  // Typing moves the slider live; on blur/Enter the value snaps to a valid
  // step and clamps into range, so the field always ends up in sync.
  if (minInput) {
    minInput.addEventListener('input', () => {
      const v = parseFloat(minInput.value);
      if (!isNaN(v)) { vMin = Math.max(min, Math.min(v, vMax-snapStep)); render('min'); }
    });
    minInput.addEventListener('change', () => { vMin = snap(vMin); render(); });
  }
  if (maxInput) {
    maxInput.addEventListener('input', () => {
      const v = parseFloat(maxInput.value);
      if (!isNaN(v)) { vMax = Math.min(max, Math.max(v, vMin+snapStep)); render('max'); }
    });
    maxInput.addEventListener('change', () => { vMax = snap(vMax); render(); });
  }
  if (currId) document.getElementById(currId)?.addEventListener('change',()=>{formData[currId]=curr();render();});
  render();
}

function radioGroupHtml(id, opts, saved) {
  return `<div class="radio-grp" id="${id}">${
    opts.map(o=>`<button type="button" class="r-opt${saved===o.v?' sel':''}" data-val="${o.v}" onclick="pickR(this,'${id}')">${o.t}</button>`).join('')
  }</div>`;
}

function checkboxGroupHtml(id, opts, saved, cls) {
  const classes = cls || '';
  return `<div class="chk-grp${classes?' '+classes:''}" id="${id}">${
    opts.map(o=>`<button type="button" class="c-opt${(saved||[]).includes(o.v)?' sel':''}" data-val="${o.v}" onclick="toggleChk(this)">${o.t}</button>`).join('')
  }</div>`;
}

function countrySelectHtml(id, saved) {
  return `<select class="fs" id="${id}" onchange="if(typeof onCountryChange==='function')onCountryChange(this.value)">
    <option value="">Select country...</option>
    ${COUNTRIES.map(c=>`<option value="${c}"${saved===c?' selected':''}>${c}</option>`).join('')}
  </select>`;
}

// City field: free-text input backed by a <datalist> of the country's major
// cities (suggestions only — any city can still be typed).
function cityOptions(country) {
  const list = (typeof CITIES !== 'undefined' && CITIES[country]) ? CITIES[country] : [];
  return list.map(c=>`<option value="${esc(c)}"></option>`).join('');
}
function cityFieldHtml(id, country, saved) {
  return `<input type="text" class="fi" id="${id}" list="${id}-list" placeholder="Start typing your city…" value="${esc(saved||'')}" autocomplete="off">
    <datalist id="${id}-list">${cityOptions(country)}</datalist>`;
}
// When the country changes, refresh the city suggestions to match.
function onCountryChange(country) {
  const dl = document.getElementById('inp-city-list');
  if (dl) dl.innerHTML = cityOptions(country);
  const badge = document.getElementById('phoneCodeBadge');   // keep existing phone-code sync working
  if (badge && typeof COUNTRY_DIAL_CODES!=='undefined') badge.textContent = COUNTRY_DIAL_CODES[country] || '+—';
}

function multiCountryHtml(id, saved) {
  const savedArr = saved || [];
  return `<select class="fs" id="${id}" multiple style="height:180px;padding:.5rem .75rem;background-image:none">${
    COUNTRIES.map(c=>`<option value="${c}"${savedArr.includes(c)?' selected':''}>${c}</option>`).join('')
  }</select>
  <p style="margin-top:.5rem;font-size:.72rem;color:rgba(255,255,255,.3)">Hold Ctrl / Cmd to select multiple countries</p>`;
}

/* ════════════════════════════════════════════════════════════
   CUSTOM CALENDAR DATE PICKER — replaces native <input type="date">
   (whose browser-chrome popup can't be restyled) with a text field that
   opens a RealLingo-styled calendar: month/year navigation, a Today
   shortcut, min-date and range-aware day disabling, and range shading
   between a Start and End field.
════════════════════════════════════════════════════════════ */
const CAL_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CAL_WEEKDAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function calToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function calFormatDisplay(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-').map(Number);
  if (!y||!m||!d) return '';
  return `${CAL_MONTH_NAMES[m-1].slice(0,3)} ${d}, ${y}`;
}

// The text input + hidden ISO value + calendar-icon trigger button.
// The ISO date lives in data-iso (read by validate()/save()); .value is
// only ever the human-readable display string — nothing here is meant
// to be typed, only picked, so the input stays readonly.
function calInputHtml(id, isoValue, placeholder) {
  return `
    <div class="cal-field">
      <input type="text" class="fi cal-input" id="${id}" readonly placeholder="${esc(placeholder||'Select date')}" value="${esc(calFormatDisplay(isoValue))}" data-iso="${esc(isoValue||'')}">
      <button type="button" class="cal-icon-btn" tabindex="-1" aria-label="Open calendar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      </button>
    </div>`;
}

// Only one calendar panel is ever open at a time; opening a new one
// closes whichever was already open.
let _calActiveClose = null;

function initCalendarPicker(inputId, opts) {
  opts = opts || {};
  const input = document.getElementById(inputId);
  if (!input) return;
  const field = input.closest('.cal-field');
  if (!field) return;

  let panel = null;
  let viewYear, viewMonth; // 0-indexed month currently shown in the grid

  const currentValue = () => input.dataset.iso || '';
  const minDate = () => typeof opts.minDate === 'function' ? opts.minDate() : (opts.minDate || '');
  const rangeStart = () => typeof opts.rangeStart === 'function' ? (opts.rangeStart() || '') : '';

  function openCal() {
    if (_calActiveClose && _calActiveClose !== closeCal) _calActiveClose();
    const seed = currentValue() || minDate() || calToday();
    const [y,m] = seed.split('-').map(Number);
    viewYear = y; viewMonth = m-1;
    render();
    field.classList.add('cal-open');
    _calActiveClose = closeCal;
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKeydown, true);
  }
  function closeCal() {
    field.classList.remove('cal-open');
    if (_calActiveClose === closeCal) _calActiveClose = null;
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKeydown, true);
  }
  function onDocClick(e) { if (!field.contains(e.target)) closeCal(); }
  function onKeydown(e) {
    if (e.key === 'Escape') { closeCal(); input.focus(); return; }
    const focusable = Array.from(panel?.querySelectorAll('.cal-day:not(.cal-day--pad):not(.cal-day--disabled)') || []);
    const curIdx = focusable.indexOf(document.activeElement);
    if (curIdx === -1) return;
    const deltas = { ArrowRight:1, ArrowLeft:-1, ArrowDown:7, ArrowUp:-7 };
    if (e.key in deltas) {
      e.preventDefault();
      const next = focusable[curIdx + deltas[e.key]];
      if (next) next.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.activeElement.click();
    }
  }

  function selectDate(iso) {
    input.dataset.iso = iso;
    input.value = calFormatDisplay(iso);
    clearErr();
    closeCal();
    if (opts.onSelect) opts.onSelect(iso);
  }

  function render() {
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'cal-panel';
      field.appendChild(panel);
    }
    const min = minDate();
    const rs = rangeStart();
    const sel = currentValue();
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    const thisYear = new Date().getFullYear();
    const yearOpts = []; for (let y=thisYear; y<=thisYear+4; y++) yearOpts.push(y);

    let cells = '';
    for (let i=0;i<startWeekday;i++) cells += `<span class="cal-day cal-day--pad">${daysInPrevMonth-startWeekday+1+i}</span>`;
    for (let d=1; d<=daysInMonth; d++) {
      const iso = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = iso===calToday(), isSel = iso===sel;
      const disabled = !!((min && iso<min) || (rs && iso<rs));
      const lo = rs && sel ? (rs<sel?rs:sel) : null, hi = rs && sel ? (rs<sel?sel:rs) : null;
      const inRange = lo && iso>lo && iso<hi;
      const cls = ['cal-day'];
      if (isToday) cls.push('cal-day--today');
      if (isSel) cls.push('cal-day--sel');
      if (disabled) cls.push('cal-day--disabled');
      if (inRange) cls.push('cal-day--inrange');
      cells += `<button type="button" class="${cls.join(' ')}" ${disabled?'disabled':''} data-iso="${iso}" tabindex="${isSel||(!sel&&isToday)?'0':'-1'}">${d}</button>`;
    }
    const trailing = (7 - ((startWeekday+daysInMonth) % 7)) % 7;
    for (let i=1;i<=trailing;i++) cells += `<span class="cal-day cal-day--pad">${i}</span>`;

    panel.innerHTML = `
      <div class="cal-hd">
        <button type="button" class="cal-nav" data-nav="-1" aria-label="Previous month">‹</button>
        <div class="cal-hd-mid">
          <span class="cal-month-lbl">${CAL_MONTH_NAMES[viewMonth]}</span>
          <select class="cal-year-sel" aria-label="Year">${yearOpts.map(y=>`<option value="${y}"${y===viewYear?' selected':''}>${y}</option>`).join('')}</select>
        </div>
        <button type="button" class="cal-nav" data-nav="1" aria-label="Next month">›</button>
      </div>
      <div class="cal-weekdays">${CAL_WEEKDAYS.map(w=>`<span>${w}</span>`).join('')}</div>
      <div class="cal-days">${cells}</div>
      <button type="button" class="cal-today-btn">Today</button>`;

    panel.querySelectorAll('.cal-nav').forEach(btn => btn.addEventListener('click', () => {
      viewMonth += parseInt(btn.dataset.nav, 10);
      if (viewMonth<0) { viewMonth=11; viewYear--; } else if (viewMonth>11) { viewMonth=0; viewYear++; }
      render();
    }));
    panel.querySelector('.cal-year-sel').addEventListener('change', e => { viewYear=parseInt(e.target.value,10); render(); });
    panel.querySelectorAll('.cal-day:not(.cal-day--pad):not(.cal-day--disabled)').forEach(btn => {
      btn.addEventListener('click', () => selectDate(btn.dataset.iso));
    });
    panel.querySelector('.cal-today-btn').addEventListener('click', () => {
      const t = calToday();
      if ((min && t<min) || (rs && t<rs)) return;
      selectDate(t);
    });
  }

  input.addEventListener('click', openCal);
  input.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); openCal(); } });
  field.querySelector('.cal-icon-btn')?.addEventListener('click', openCal);
}

/* ════════════════════════════════════════════════════════════
   LANGUAGE LEVEL BUILDER
════════════════════════════════════════════════════════════ */
function buildLangLevelHtml() {
  if (!formData.languages) formData.languages = {};
  const selKeys = Object.keys(formData.languages);
  return `
    <p class="fl-sm" style="margin-bottom:.75rem">Select language(s)</p>
    <div class="chk-grp" id="langPickerGrp">
      ${LANGUAGES.map(l=>`<button type="button" class="c-opt${selKeys.includes(l.key)?' sel':''}" data-lang="${l.key}" onclick="toggleLang('${l.key}')">${l.label}</button>`).join('')}
    </div>
    <div id="langDetails">
      ${LANGUAGES.filter(l=>selKeys.includes(l.key)).map(l=>renderLangSection(l)).join('')}
    </div>`;
}

function renderLangSection(langDef) {
  const lk = langDef.key;
  const ld = formData.languages?.[lk] ?? (langDef.variants.length===0 ? '' : {});
  if (langDef.variants.length===0) {
    const level = typeof ld==='string' ? ld : '';
    return `<div class="lang-section" id="langSect-${lk}">
      <div class="lang-section-hd">${langDef.label}</div>
      <div class="lang-level-opts">
        ${LANG_LEVELS.map(lv=>`<button type="button" class="lvl-btn${level===lv.k?' sel':''}" onclick="setLangLevel('${lk}',null,'${lv.k}')">${lv.l}</button>`).join('')}
      </div>
    </div>`;
  }
  const selVars = typeof ld==='object' ? ld : {};
  return `<div class="lang-section" id="langSect-${lk}">
    <div class="lang-section-hd">${langDef.label}</div>
    <p class="fl-sm" style="margin-bottom:.625rem">Select variant(s)</p>
    <div class="chk-grp" id="varGrp-${lk}">
      ${langDef.variants.map(v=>`<button type="button" class="c-opt${v.key in selVars?' sel':''}" data-variant="${v.key}" onclick="toggleVariant('${lk}','${v.key}')">${v.label}</button>`).join('')}
    </div>
    <div id="varLevels-${lk}">
      ${langDef.variants.filter(v=>v.key in selVars).map(v=>langVarRow(lk,v,selVars)).join('')}
    </div>
  </div>`;
}

// A variant's level row. For an "Other variant(s)" option (key starts "other_")
// we also render a fill-in-the-blank so the user can name the specific variety.
function isOtherVariant(vk){ return /^other_/.test(vk); }
function langVarRow(lk, v, selVars){
  const otherVal = (formData.langOther && formData.langOther[lk]) || '';
  return `<div class="lang-level-row" id="vrow-${lk}-${v.key}">
    <span class="lang-level-label">${v.label}</span>
    <div class="lang-level-opts">
      ${LANG_LEVELS.map(lv=>`<button type="button" class="lvl-btn${selVars[v.key]===lv.k?' sel':''}" onclick="setLangLevel('${lk}','${v.key}','${lv.k}')">${lv.l}</button>`).join('')}
    </div>
    ${isOtherVariant(v.key) ? `<input type="text" class="fi lang-other-input" style="margin-top:.55rem" placeholder="Which variant? e.g. Sudanese Arabic, Shanghainese…" value="${esc(otherVal)}" oninput="setLangOther('${lk}', this.value)">` : ''}
  </div>`;
}
function setLangOther(lk, val){ if(!formData.langOther) formData.langOther = {}; formData.langOther[lk] = val; }

function toggleLang(lk) {
  if (!formData.languages) formData.languages = {};
  if (lk in formData.languages) {
    delete formData.languages[lk];
  } else {
    const def = LANGUAGES.find(l=>l.key===lk);
    formData.languages[lk] = def.variants.length===0 ? '' : {};
  }
  document.querySelector(`#langPickerGrp [data-lang="${lk}"]`)?.classList.toggle('sel', lk in formData.languages);
  document.getElementById('langDetails').innerHTML =
    LANGUAGES.filter(l=>l.key in formData.languages).map(l=>renderLangSection(l)).join('');
}

function toggleVariant(lk, vk) {
  if (!formData.languages) formData.languages = {};
  if (typeof formData.languages[lk] !== 'object') formData.languages[lk] = {};
  const ld = formData.languages[lk];
  if (vk in ld) { delete ld[vk]; } else { ld[vk] = ''; }
  document.querySelector(`#varGrp-${lk} [data-variant="${vk}"]`)?.classList.toggle('sel', vk in ld);
  const langDef = LANGUAGES.find(l=>l.key===lk);
  document.getElementById(`varLevels-${lk}`).innerHTML =
    langDef.variants.filter(v=>v.key in ld).map(v=>langVarRow(lk,v,ld)).join('');
}

function setLangLevel(lk, vk, level) {
  if (!formData.languages) formData.languages = {};
  if (vk===null) {
    formData.languages[lk] = level;
  } else {
    if (typeof formData.languages[lk] !== 'object') formData.languages[lk] = {};
    formData.languages[lk][vk] = level;
  }
  const langDef = LANGUAGES.find(l=>l.key===lk);
  const sect = document.getElementById(`langSect-${lk}`);
  if (sect && langDef) {
    const tmp = document.createElement('div');
    tmp.innerHTML = renderLangSection(langDef);
    sect.replaceWith(tmp.firstElementChild);
  }
}

/* ════════════════════════════════════════════════════════════
   ROLE / CHECKBOX INTERACTIONS
════════════════════════════════════════════════════════════ */
function toggleRole(btn) {
  const k = btn.dataset.val;
  if (selectedRoles.has(k)) { selectedRoles.delete(k); btn.classList.remove('sel'); }
  else { selectedRoles.add(k); btn.classList.add('sel'); }
  invalidateSections();
  clearErr();
}

function pickR(btn, groupId) {
  document.querySelectorAll(`#${groupId} .r-opt`).forEach(o=>{
    o.classList.remove('sel');
    const rid = o.dataset.reveal;
    if (rid) document.getElementById(rid)?.classList.remove('show');
  });
  btn.classList.add('sel');
  const rid = btn.dataset.reveal;
  if (rid) document.getElementById(rid)?.classList.add('show');
  clearErr();
}

function toggleChk(btn) { btn.classList.toggle('sel'); clearErr(); }

function toggleChkReveal(btn, condId) {
  toggleChk(btn);
  document.getElementById(condId)?.classList.toggle('show', btn.classList.contains('sel'));
}

function toggleChkOther(btn, condId) {
  toggleChk(btn);
  document.getElementById(condId)?.classList.toggle('show', btn.classList.contains('sel'));
}

function toggleQual(btn) {
  const key = btn.dataset.val;
  if (!formData.qualifications) formData.qualifications = {};
  const q = formData.qualifications;
  if (key==='noQualification') {
    q.noQualification = !q.noQualification;
    if (q.noQualification) { q.hasCertificate=false; q.hasEducation=false; }
    document.querySelectorAll('#qualGrp .c-opt').forEach(b=>b.classList.remove('sel'));
    if (q.noQualification) btn.classList.add('sel');
  } else {
    if (q[key]) { q[key]=false; btn.classList.remove('sel'); }
    else { q.noQualification=false; document.querySelector('#qualGrp [data-val="noQualification"]')?.classList.remove('sel'); q[key]=true; btn.classList.add('sel'); }
  }
  document.getElementById('certQualRev')?.classList.toggle('show',!!q.hasCertificate);
  document.getElementById('eduQualRev')?.classList.toggle('show',!!q.hasEducation);
  clearErr();
}

/* Influencer platforms */
function togglePlatform(btn) {
  const k = btn.dataset.val;
  if (!formData.platforms) formData.platforms = {};
  if (k in formData.platforms) { delete formData.platforms[k]; btn.classList.remove('sel'); }
  else { formData.platforms[k]=formData.platforms[k]||''; btn.classList.add('sel'); }
  renderPlatformHandles();
  clearErr();
}

function renderPlatformHandles() {
  const c = document.getElementById('platformHandles');
  if (!c) return;
  const selPl = PLATFORMS.filter(p=>p.key in (formData.platforms||{}));
  if (!selPl.length) { c.className='cond'; c.innerHTML=''; return; }
  c.className='cond show';
  c.style.maxHeight='500px';
  c.innerHTML = selPl.map(p=>`
    <div style="margin-bottom:.75rem">
      <label class="fl-sm">Your ${esc(p.label)} handle</label>
      <input type="text" class="fi" id="plh-${p.key}" placeholder="${esc(p.ph)}"
        value="${esc((formData.platforms||{})[p.key]||'')}"
        oninput="if(!formData.platforms)formData.platforms={};formData.platforms['${p.key}']=this.value">
    </div>`).join('');
}

/* Language pairs (translator) */
function addLangPair() {
  if (!formData.langPairs) formData.langPairs=[];
  if (formData.langPairs.length>=2) return;
  formData.langPairs.push({from:'',to:''});
  renderLangPairs();
}

function removeLangPair(i) {
  if (!formData.langPairs) return;
  formData.langPairs.splice(i,1);
  renderLangPairs();
}

function renderLangPairs() {
  const c = document.getElementById('langPairsWrap');
  if (!c) return;
  if (!formData.langPairs||formData.langPairs.length===0) formData.langPairs=[{from:'',to:''}];
  const pairLangOpts = PAIR_LANGUAGES.map(l=>`<option value="${l}">${l}</option>`).join('');
  c.innerHTML = formData.langPairs.map((pair,i)=>`
    <div class="lang-pair-row">
      <select class="fs" id="pair-from-${i}" style="flex:1" onchange="savePairLang(${i},'from',this.value)">
        <option value="">From...</option>${PAIR_LANGUAGES.map(l=>`<option value="${l}"${pair.from===l?' selected':''}>${l}</option>`).join('')}
      </select>
      <span class="lang-pair-sep">↔</span>
      <select class="fs" id="pair-to-${i}" style="flex:1" onchange="savePairLang(${i},'to',this.value)">
        <option value="">To...</option>${PAIR_LANGUAGES.map(l=>`<option value="${l}"${pair.to===l?' selected':''}>${l}</option>`).join('')}
      </select>
      ${formData.langPairs.length>1?`<button class="remove-pair-btn" onclick="removeLangPair(${i})">×</button>`:''}
    </div>`).join('') +
    (formData.langPairs.length<2?`<button class="add-pair-btn" onclick="addLangPair()">+ Add another pair</button>`:'');
}

function savePairLang(i, dir, val) {
  if (!formData.langPairs) formData.langPairs=[];
  if (!formData.langPairs[i]) formData.langPairs[i]={from:'',to:''};
  formData.langPairs[i][dir]=val;
}

/* Hiring company reveal (Hire flow's "I'm hiring as..." question) */
function pickHiringType(btn) {
  pickR(btn, 'hiringTypeGrp');
  document.getElementById('companyRev')?.classList.toggle('show', btn.dataset.val==='company');
}

/* Final step's phone field: picking a country auto-fills its dial code
   badge next to the number input. */
function updatePhoneCode(country) {
  const badge = document.getElementById('phoneCodeBadge');
  if (badge) badge.textContent = COUNTRY_DIAL_CODES[country] || '+—';
  clearErr();
}

/* ════════════════════════════════════════════════════════════
   FORM ENGINE — SHOW / NAVIGATE
════════════════════════════════════════════════════════════ */
function showForm() {
  injectUsernameStep();
  restoreQuizState();
  showScreen('s-form');
  invalidateSections();
  sectIdx=0; stepIdx=0;
  renderFormPage('none');
}

function renderFormPage(direction) {
  const inner=document.getElementById('fstepInner');
  const sKey=currentSectionKey();
  const isReview = sKey==='review';
  const isAccount = sKey==='createAccount';
  // The review page is a dashboard (3-column role cards), not a single
  // narrow question, so it gets a wider container than every other step.
  inner.classList.toggle('fstep-inner--review', isReview);

  renderSidebar();
  updateProgressBar();
  updateNavButtons();
  document.getElementById('fstepArea').scrollTop=0;
  persistQuizState();

  const paint=()=>{
    if(isReview) { inner.innerHTML=buildReviewHtml(); postRenderReview(); }
    else if(isAccount) { inner.innerHTML=buildAccountHtml(); postRenderAccount(); }
    else { inner.innerHTML=buildStepHtml(); postRenderStep(); }
  };

  if (direction==='none') { paint(); return; }
  const outClass=direction==='fwd'?'s-out-l':'s-out-r';
  const inClass=direction==='fwd'?'s-in-r':'s-in-l';
  inner.classList.add(outClass);
  setTimeout(()=>{
    inner.classList.remove(outClass);
    paint();
    inner.classList.add(inClass);
    setTimeout(()=>inner.classList.remove(inClass),260);
  },240);
}

function buildStepHtml() {
  const step=currentSteps()[stepIdx];
  return `
    <div class="fstep-tag">${esc(step.tag)}</div>
    <h2 class="fstep-q">${esc(step.q)}</h2>
    ${step.hint?`<p class="fstep-hint">${esc(step.hint)}</p>`:''}
    <div class="fstep-inputs">${step.html()}</div>
    <div class="ferr" id="fErr"></div>`;
}

function postRenderStep() {
  const step=currentSteps()[stepIdx];
  step.postRender?.();
}

function updateProgressBar() {
  const sections=getActiveSections();
  const sKey=currentSectionKey();
  const sLabel=SECTION_LABEL[sKey]||sKey;
  const isReview=sKey==='review';
  const isAccount=sKey==='createAccount';
  const isTerminal=isReview||isAccount;   // sections with no per-step questions
  const steps=isTerminal?null:currentSteps();
  const totalSteps=steps?steps.length:0;

  let overallDone=0, overallTotal=0;
  sections.forEach((sk,si)=>{
    if(sk==='review'||sk==='createAccount'){overallTotal+=1;if(si<sectIdx)overallDone+=1;}
    else{const st=getSectionSteps(sk)||[];overallTotal+=st.length;if(si<sectIdx)overallDone+=st.length;else if(si===sectIdx)overallDone+=stepIdx;}
  });

  document.getElementById('fpStep').textContent = isReview
    ? 'Review Your Profile'
    : isAccount ? 'Create Account'
    : `${sLabel} — Step ${stepIdx+1} of ${totalSteps}`;
  document.getElementById('fpTitle').textContent = isTerminal ? '' : esc(currentSteps()[stepIdx]?.tag||'');
  document.getElementById('fpFill').style.width = `${(overallDone/Math.max(1,overallTotal))*100}%`;
}

function updateNavButtons() {
  const back=document.getElementById('fBtnBack');
  const next=document.getElementById('fBtnNext');
  const isFirst=(sectIdx===0&&stepIdx===0);
  const sKey=currentSectionKey();
  const isTerminal=sKey==='review'||sKey==='createAccount';  // own CTA button
  back.disabled=isFirst;
  next.textContent='Next →';
  next.style.display=isTerminal?'none':'';
  updateSkipLink(isTerminal);
}

// "Skip for now" — a subtle link under the nav during signup (not edit mode).
// Lets a visitor jump straight to Create Account after their name, filling out
// the rest of their profile later from the dashboard. Injected once, then just
// shown/hidden, so it works across all four flow pages without editing each.
function updateSkipLink(isTerminal) {
  const nav = document.querySelector('.form-nav');
  if (!nav) return;
  let row = document.getElementById('fSkipRow');
  const show = !editing() && !isTerminal;   // no "skip" when completing an existing profile
  if (!show) { if (row) row.style.display = 'none'; return; }
  if (!row) {
    row = document.createElement('div');
    row.id = 'fSkipRow';
    row.style.cssText = 'text-align:center;margin-top:.85rem;';
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'fBtnSkip';
    b.textContent = "I'll finish my profile later — skip for now →";
    b.style.cssText = 'background:none;border:none;color:#8a8878;font-family:inherit;font-size:.85rem;text-decoration:underline;cursor:pointer;padding:.3rem .5rem;';
    b.addEventListener('click', skipToAccount);
    row.appendChild(b);
    nav.insertAdjacentElement('afterend', row);
  }
  row.style.display = '';
}

function suggestUsername(name) {
  const base = String(name || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 12) || 'user';
  return base + Math.floor(1000 + Math.random() * 9000);   // e.g. sarah4821 — changeable later in Settings
}

// Skip the remaining profile questions and go straight to Create Account.
function skipToAccount() {
  currentSteps()[stepIdx]?.save?.();          // keep whatever's on the current step
  if (!formData.name || !formData.name.trim()) { showErr('Please enter your name first'); return; }
  if (!formData.username) formData.username = suggestUsername(formData.name);   // auto-pick if not chosen yet
  const sections = getActiveSections();
  const ai = sections.indexOf('createAccount');
  if (ai < 0) return;                          // no createAccount in edit mode
  SKIPPED_ONBOARDING = true;
  clearErr();
  sectIdx = ai; stepIdx = 0;
  renderFormPage('fwd');
}

function renderSidebar() {
  const nav=document.getElementById('sectNav');
  if(!nav)return;
  const sections=getActiveSections();
  // Every section is clickable — done, current, or still upcoming — so a
  // visitor can jump straight to any question rather than only stepping
  // through sequentially, same as the Review page's own "Edit" links.
  nav.innerHTML=`<div class="sn-hd">Progress</div>`+sections.map((key,i)=>{
    const isDone=i<sectIdx;
    const isCur=i===sectIdx;
    const cls=isDone?'done':isCur?'cur':'pending';
    const dot=isDone?'✓':isCur?'→':'';
    return `<button type="button" class="sn-item ${cls}" onclick="jumpToSection(${i})"><div class="sn-dot ${cls}">${dot}</div><span class="sn-label">${esc(sectionLabel(key))}</span></button>`;
  }).join('');
}

function nextStep() {
  const sKey=currentSectionKey();
  // Review → save (edit mode) or advance to the Create Account step.
  if(sKey==='review'){ if(editing()){ saveEdits(); return; } sectIdx++; stepIdx=0; renderFormPage('fwd'); return; }
  // Create Account has its own submit button (submitAccount); Next is hidden.
  if(sKey==='createAccount'){ return; }
  const steps=currentSteps();
  const step=steps[stepIdx];
  step.save();
  const err=step.validate();
  if(err){showErr(err);return;}
  clearErr();
  if(stepIdx<steps.length-1){
    stepIdx++;
    renderFormPage('fwd');
  } else {
    sectIdx++;
    stepIdx=0;
    renderFormPage('fwd');
  }
}

function prevStep() {
  const steps=currentSteps();
  if(steps&&stepIdx>0){
    steps[stepIdx]?.save?.();
    clearErr();
    stepIdx--;
    renderFormPage('back');
  } else if(sectIdx>0){
    clearErr();
    sectIdx--;
    const prevSteps=getSectionSteps(currentSectionKey());
    stepIdx=prevSteps?prevSteps.length-1:0;
    renderFormPage('back');
  }
}

function jumpToSection(targetSectIdx) {
  // Persist whatever's on the current step (e.g. a typed name/note that
  // hasn't been blurred yet) before navigating away from it — otherwise
  // jumping via the sidebar mid-edit would silently drop it. A no-op when
  // called from the Review page, which has no step of its own to save.
  currentSteps()[stepIdx]?.save?.();
  sectIdx=targetSectIdx;
  stepIdx=0;
  renderFormPage('none');
}

function showErr(msg) {
  const el=document.getElementById('fErr');
  if(!el)return;
  el.textContent=msg;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}
function clearErr() { const el=document.getElementById('fErr'); if(el)el.textContent=''; }

/* ════════════════════════════════════════════════════════════
   LABEL HELPERS FOR REVIEW
════════════════════════════════════════════════════════════ */
function lbl(v) {
  const M = {
    'arabic':'Arabic','chinese':'Chinese','korean':'Korean','french':'French','spanish':'Spanish',
    'beginner':'Beginner','intermediate':'Intermediate','advanced':'Advanced',
    'online':'Online','offline':'Offline / In-person','both':'Both',
    'hourly':'Hourly','daily':'Daily','freetrial':'Free Trial','period':'Per Period of Time','project':'Project-based',
    'freelance':'Freelance','fulltime':'Full-time','parttime':'Part-time',
    'translation':'Translation','interpretation':'Interpretation','localization':'Localization','transcription':'Transcription / Subtitling / Proofreading',
    'legal':'Legal','medical':'Medical','business':'Business','marketing':'Marketing','technical':'Technical',
    'finance':'Finance','education':'Education','gaming':'Gaming','general':'General',
    'sponsored':'Sponsored videos','mention':'Brand mentioning','analytics':'Share account analytics',
    'none':'None','0-1yr':'0–1 years','1-3yr':'1–3 years','3plus':'3+ years',
    'work':'Work / Business','academia':'Academia','travel':'Travel','immigration':'Immigration','personal':'Personal Interest',
    'event':'Language Community Event','study':'Study Group','buddy':'Language Buddy','resources':'Educational Resources',
    'translator':'Translator / interpreter','tourguide':'Tour guide','eventmgr':'Event manager','employee':'Employee',
    'culture':'Culture','networking':'Networking','entertainment':'Entertainment',
  };
  return M[v] || (v ? String(v).charAt(0).toUpperCase()+String(v).slice(1) : '');
}
function lbls(arr) { return (arr||[]).map(lbl).filter(Boolean).join(', '); }
function serviceRoleLbl(k) { return (SERVICE_ROLES.find(s=>s.key===k)||{}).label || lbl(k); }
function serviceRoleLbls(arr) { return (arr||[]).map(serviceRoleLbl).filter(Boolean).join(', '); }

/* ════════════════════════════════════════════════════════════
   REVIEW PAGE — a profile dashboard: one "General Information" card
   (name/language/location/contact, with a profile photo) up top, then
   every selected role as its own card in a responsive grid below.
════════════════════════════════════════════════════════════ */
const ROLE_CARD_ICON = {
  learner: '🎓', traveler: '✈️', eventMember: '🎉',
  hireTranslator: '💬', hireInfluencer: '📣', hireLanguageEvent: '🌐', hireLanguageTalent: '🌟',
  tutor: '📚', translator: '💬', influencer: '📣', tourGuide: '🧭', languageEvent: '🌐', languageTalent: '🌟',
};

function defaultAvatarSrc() { return (typeof SITE_ROOT!=='undefined'?SITE_ROOT:'') + 'assets/img/default-avatar.png'; }

function buildReviewHtml() {
  const sections = getActiveSections().filter(s => s!=='review');
  const roleSections = sections.filter(s => s!=='general' && s!=='final' && s!=='createAccount');

  let html = `<div class="fstep-tag">Review</div><h2 class="fstep-q" style="margin-bottom:2rem">Review Your Profile</h2>`;
  html += buildGeneralReviewCard(sections);

  if (roleSections.length) {
    html += `<div class="rev-section-hd"><h3>Your Selected Roles</h3></div>`;
    html += `<div class="rev-role-grid">`;
    html += roleSections.map(sKey => buildRoleReviewCard(sKey, sections.indexOf(sKey))).join('');
    html += `</div>`;
  }

  html += `<div class="ferr" id="fErr" style="text-align:center;margin-top:1rem"></div>`;
  html += editing()
    ? `<button class="review-submit" onclick="saveEdits()">Save my profile →</button>`
    : `<button class="review-submit" onclick="nextStep()">Continue to Create Account →</button>`;
  return html;
}

function buildGeneralReviewCard(sections) {
  const generalIdx = sections.indexOf('general');
  const finalIdx = sections.indexOf('final');
  const rows = [
    ...(generalIdx>=0 ? getReviewRows('general') : []),
    ...(finalIdx>=0 ? getReviewRows('final') : []),
  ];
  const editIdx = generalIdx>=0 ? generalIdx : finalIdx;
  const hasCustom = !!formData.avatarDataUrl;
  const avatarSrc = hasCustom ? formData.avatarDataUrl : defaultAvatarSrc();

  return `
    <div class="rev-general-card">
      <div class="rev-avatar-wrap">
        <img class="rev-avatar" id="revAvatarImg" src="${avatarSrc}" alt="Profile photo"${hasCustom?'':' data-default="1"'}>
        <input type="file" id="revAvatarInput" accept="image/*" hidden>
        <div class="rev-avatar-actions">
          <button type="button" class="rev-avatar-btn" onclick="document.getElementById('revAvatarInput').click()">${hasCustom?'Replace':'Upload'} photo</button>
          ${hasCustom ? `<button type="button" class="rev-avatar-btn rev-avatar-remove" onclick="removeAvatar()">Remove</button>` : ''}
        </div>
      </div>
      <div class="rev-general-info">
        <div class="rev-card-hd">
          <span class="rev-card-title">General Information</span>
          ${editIdx>=0 ? `<button class="review-edit" onclick="jumpToSection(${editIdx})">Edit</button>` : ''}
        </div>
        <div class="rev-chip-grid">
          ${rows.map(r=>`<div class="rev-chip"><span class="rev-chip-lbl">${esc(r.l)}</span><span class="rev-chip-val">${esc(r.v)}</span></div>`).join('')}
        </div>
      </div>
    </div>`;
}

function buildRoleReviewCard(sKey, idx) {
  const rows = getReviewRows(sKey);
  const icon = ROLE_CARD_ICON[sKey] || '⭐';
  return `
    <div class="rev-role-card">
      <div class="rev-role-card-hd">
        <span class="rev-role-icon">${icon}</span>
        <span class="rev-role-title">${esc(SECTION_LABEL[sKey]||sKey)}</span>
      </div>
      <div class="rev-role-rows">
        ${rows.map(r=>`<div class="rev-role-row"><span class="rev-role-row-lbl">${esc(r.l)}</span><span class="rev-role-row-val">${esc(r.v)}</span></div>`).join('')}
      </div>
      <button class="review-edit rev-role-edit" onclick="jumpToSection(${idx})">Edit</button>
    </div>`;
}

// Wires the avatar file input once the review page's HTML is in the DOM
// (there's no per-step postRender hook for the review "page", since it
// isn't one of currentSteps() — renderFormPage() calls this directly).
function postRenderReview() {
  const input = document.getElementById('revAvatarInput');
  if (!input) return;
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      formData.avatarDataUrl = e.target.result;
      renderFormPage('none');
    };
    reader.readAsDataURL(file);
  });
}
function removeAvatar() {
  formData.avatarDataUrl = '';
  renderFormPage('none');
}

function getReviewRows(sKey) {
  const rows=[];
  const add=(l,v)=>{ if(v&&String(v).trim()) rows.push({l,v:String(v)}); };
  switch(sKey) {
    case 'general':
      add('Name', formData.name);
      add('Role(s)', Array.from(selectedRoles).map(r=>ROLE_DISPLAY[r]).filter(Boolean).join(', '));
      add('Language(s)', formatLangsReview(formData.languages));
      add('Location', [formData.city,formData.country].filter(Boolean).join(', '));
      add('Qualifications', formatQualReview(formData.qualifications));
      add('Hiring as', formData.hiringAs==='company'?`Company — ${formData.companyName||''}${formData.companyIndustry?' ('+formData.companyIndustry+')':''}`:lbl(formData.hiringAs));
      add('Other role', formData.otherRole);
      break;
    case 'tutor':
      add('Teaches', lbls(formData.tutorLanguages));
      add('Student level(s)', lbls(formData.tutorStudentLevels));
      add('Teaching mode', lbl(formData.tutorMode));
      add('Charge type(s)', lbls(formData.tutorChargeTypes));
      if(formData.tutorRateMin!=null) add('Rate range', `${formData.tutorRateMin?.toLocaleString()} – ${formData.tutorRateMax?.toLocaleString()} ${formData.tutorCurrency||''}`);
      add('Note', formData.tutorNote);
      break;
    case 'translator':
      add('Language pairs', (formData.langPairs||[]).map(p=>`${p.from} ↔ ${p.to}`).filter(s=>s.trim()!=='↔').join('; '));
      add('Specializations', [...(formData.transSpecializations||[]).map(lbl),formData.transSpecializationsOther].filter(Boolean).join(', '));
      add('Availability', lbls(formData.transAvailability));
      add('Services', lbls(formData.transProvides));
      if(formData.transRateMin!=null) add('Rate range', `${formData.transRateMin?.toLocaleString()} – ${formData.transRateMax?.toLocaleString()} ${formData.transCurrency||''}`);
      add('Note', formData.transNote);
      break;
    case 'languageTalent':
      add('Industries', (formData.talentIndustries||[]).join(', '));
      if(formData.talentSalMin!=null) add('Expected salary', `${formData.talentSalMin?.toLocaleString()} – ${formData.talentSalMax?.toLocaleString()} ${formData.talentCurrency||''} / month`);
      break;
    case 'influencer':
      add('Platforms', Object.entries(formData.platforms||{}).map(([k,v])=>{const p=PLATFORMS.find(x=>x.key===k);return `${p?.label||k}${v?' ('+v+')':''}`;}).join(', '));
      add('Open to', lbls(formData.inflOpenTo));
      add('Paid collab experience', lbl(formData.inflExperience));
      break;
    case 'learner':
      add('Learning', lbls(formData.learnerLanguages));
      add('Learning for', [...(formData.learnerPurpose||[]).map(lbl),formData.learnerPurposeOther].filter(Boolean).join(', '));
      add('Looking for', [...(formData.learnerLooking||[]).map(lbl),formData.learnerLookingOther].filter(Boolean).join(', '));
      add('Budget type(s)', [...(formData.learnerBudgetTypes||[]).map(lbl),formData.learnerPeriodSpec].filter(Boolean).join(', '));
      if(formData.learnerBudMin!=null) add('Budget range', `${formData.learnerBudMin?.toLocaleString()} – ${formData.learnerBudMax?.toLocaleString()} ${formData.learnerCurrency||''}`);
      add('Note', formData.learnerNote);
      break;
    case 'hireTutor': case 'hireTranslator': case 'hireInfluencer':
    case 'hireTourGuide': case 'hireLanguageEvent': case 'hireLanguageTalent': {
      const p = sKey;
      add('Language(s) needed', lbls(formData[p+'Languages']));
      add('Budget type(s)', [...(formData[p+'BudgetTypes']||[]).map(lbl),formData[p+'PeriodSpec']].filter(Boolean).join(', '));
      if(formData[p+'BudMin']!=null) add('Budget range', `${formData[p+'BudMin']?.toLocaleString()} – ${formData[p+'BudMax']?.toLocaleString()} ${formData[p+'Currency']||''}`);
      add('Note', formData[p+'Note']);
      break;
    }
    case 'tourGuide':
      add('Work countries', (formData.tourCountries||[]).join(', '));
      add('Charge type(s)', lbls(formData.tourChargeTypes));
      if(formData.tourRateMin!=null) add('Rate range', `${formData.tourRateMin?.toLocaleString()} – ${formData.tourRateMax?.toLocaleString()} ${formData.tourCurrency||''}`);
      add('Note', formData.tourNote);
      break;
    case 'traveler':
      add('Traveling to', (formData.travelCountries||[]).join(', '));
      add('Trip dates', [formData.tripStart,formData.tripEnd].filter(Boolean).join(' → '));
      add('Budget type(s)', lbls(formData.travelBudgetTypes));
      if(formData.travelBudMin!=null) add('Budget range', `${formData.travelBudMin?.toLocaleString()} – ${formData.travelBudMax?.toLocaleString()} ${formData.travelCurrency||''}`);
      add('Note', formData.travelNote);
      break;
    case 'languageEvent':
      add('Based in', formData.eventCountry);
      add('Community language(s)', lbls(formData.eventLanguages));
      break;
    case 'eventMember':
      add('Availability', lbls(formData.memberAvailability));
      add('Interests', [...(formData.memberInterests||[]).map(lbl),formData.memberInterestsOther].filter(Boolean).join(', '));
      add('Partner community member', formData.partnerMember==='yes' ? [...(formData.partnerCommunities||[]).map(lbl),formData.partnerCommunityOther].filter(Boolean).join(', ') : lbl(formData.partnerMember));
      add('Language(s) interested in', [...(formData.memberLangInterest||[]).map(lbl),formData.memberLangInterestOther].filter(Boolean).join(', '));
      break;
    case 'final':
      add('Email', formData.email);
      add('Phone', formData.phone ? `${formData.phoneCode||''} ${formData.phone}`.trim() : '');
      break;
  }
  return rows;
}

function formatLangsReview(langs) {
  if(!langs||!Object.keys(langs).length)return '';
  return Object.entries(langs).map(([lk,lv])=>{
    const def=LANGUAGES.find(l=>l.key===lk);
    if(!def)return '';
    if(typeof lv==='string'){
      const ll=LANG_LEVELS.find(l=>l.k===lv);
      return `${def.label}${ll?' ('+ll.l+')':''}`;
    }
    const parts=Object.entries(lv).map(([vk,vl])=>{
      const vd=def.variants.find(v=>v.key===vk);
      const ll=LANG_LEVELS.find(l=>l.k===vl);
      // show the typed name for an "Other variant" (e.g. "Sudanese Arabic") instead of the generic label
      const otherTxt = isOtherVariant(vk) && formData.langOther && formData.langOther[lk] ? String(formData.langOther[lk]).trim() : '';
      const label = otherTxt || vd?.label || vk;
      return `${label}${ll?': '+ll.l:''}`;
    });
    return `${def.label} — ${parts.join(', ')}`;
  }).filter(Boolean).join('; ');
}

function formatQualReview(q) {
  if(!q)return '';
  const parts=[];
  if(q.noQualification)return 'No professional qualification';
  if(q.hasCertificate)parts.push(`Certificate: ${q.certName||''}${q.certScore?' ('+q.certScore+')':''}`);
  if(q.hasEducation)parts.push(`Education: ${q.university||''}${q.department?', '+q.department:''}${q.enrolled?' (enrolled)':''}`);
  return parts.join('; ');
}

/* ════════════════════════════════════════════════════════════
   USERNAME STEP (injected into the General section) + live check
════════════════════════════════════════════════════════════ */
function injectUsernameStep() {
  const g = (typeof ALL_SECTION_STEPS!=='undefined') && ALL_SECTION_STEPS.general;
  if (!g || g.__unameInjected) return;
  const step = {
    tag:'General', q:'Choose a username', hint:"How you'll appear on RealLingo — you can change it later",
    html() {
      return `<input type="text" class="fi" id="inp-username" placeholder="e.g. yasmin_92" value="${esc(formData.username||'')}" autocomplete="off" spellcheck="false" maxlength="20">
        <div class="uname-status" id="unameStatus"></div>`;
    },
    validate() {
      const v=(document.getElementById('inp-username')?.value||'').trim();
      if(!v) return 'Please choose a username';
      if(!/^[a-zA-Z0-9_]{3,20}$/.test(v)) return 'Username must be 3–20 characters: letters, numbers, or underscores';
      if(formData._usernameTaken) return 'That username is already taken — please pick another';
      return null;
    },
    save() { formData.username=(document.getElementById('inp-username')?.value||'').trim(); },
    postRender() { initUsernameCheck(); }
  };
  g.splice(1, 0, step);   // right after the name step: name → username → …
  g.__unameInjected = true;
}

function initUsernameCheck() {
  const inp=document.getElementById('inp-username');
  const status=document.getElementById('unameStatus');
  if(!inp||!status) return;
  let t=null;
  const run=()=>{
    const v=(inp.value||'').trim();
    formData._usernameTaken=false;
    if(!v){ status.textContent=''; status.className='uname-status'; return; }
    if(!/^[a-zA-Z0-9_]{3,20}$/.test(v)){ status.textContent='3–20 letters, numbers, or underscores'; status.className='uname-status bad'; return; }
    status.textContent='Checking…'; status.className='uname-status';
    if(typeof RA==='undefined') return;
    RA.usernameAvailable(v).then(ok=>{
      if((inp.value||'').trim()!==v) return;   // input changed since; ignore
      if(ok){ status.textContent='✓ Available'; status.className='uname-status ok'; formData._usernameTaken=false; }
      else  { status.textContent='✕ Already taken'; status.className='uname-status bad'; formData._usernameTaken=true; }
    }).catch(()=>{ status.textContent=''; status.className='uname-status'; });
  };
  inp.addEventListener('input', ()=>{ clearTimeout(t); t=setTimeout(run, 400); });
  if(inp.value) run();
}

/* ════════════════════════════════════════════════════════════
   AUTOSAVE — survive reloads mid-quiz (localStorage per flow)
════════════════════════════════════════════════════════════ */
function quizStateKey(){ return 'ra_quiz_'+(typeof QUIZ_FLOW!=='undefined'?QUIZ_FLOW:'x'); }
function persistQuizState(){
  if (editing()) return;   // completing/editing loads from Supabase, not the signup draft
  try { localStorage.setItem(quizStateKey(), JSON.stringify({ formData, roles:Array.from(selectedRoles) })); } catch(e){}
}
function restoreQuizState(){
  if (editing()) return;
  try {
    const raw=localStorage.getItem(quizStateKey()); if(!raw) return;
    const snap=JSON.parse(raw);
    if(snap && snap.formData) Object.assign(formData, snap.formData);
    if(snap && Array.isArray(snap.roles)) snap.roles.forEach(r=>selectedRoles.add(r));
    invalidateSections();
  } catch(e){}
}
function clearQuizState(){ try { localStorage.removeItem(quizStateKey()); } catch(e){} }

/* ════════════════════════════════════════════════════════════
   CREATE ACCOUNT — final step (email + password + contact).
   Email lives here only, so it's never asked twice.
════════════════════════════════════════════════════════════ */
function accountRedirectUrl(){
  return new URL((typeof SITE_ROOT!=='undefined'?SITE_ROOT:'./')+'auth/callback/', location.href).href;
}

function buildAccountHtml() {
  const savedCountry = formData.phoneCountry || formData.country || '';
  const code = (typeof COUNTRY_DIAL_CODES!=='undefined' && COUNTRY_DIAL_CODES[savedCountry]) || '';
  const optNote = `<span style="text-transform:none;font-weight:400;letter-spacing:0;color:rgba(255,255,255,.3)">(optional)</span>`;
  return `
    <div class="fstep-tag">Almost done!</div>
    <h2 class="fstep-q">Create your account</h2>
    <p class="fstep-hint">You'll verify this email before continuing — it's the only place we ask for it.</p>
    <div class="fstep-inputs acct-form">
      <div style="margin-bottom:1rem">
        <label class="fl-sm">Email address</label>
        <input type="email" class="fi" id="acc-email" placeholder="you@example.com" value="${esc(formData.email||'')}" autocomplete="email">
      </div>
      <div class="fg-2">
        <div>
          <label class="fl-sm">Password</label>
          <div class="pw-row">
            <input type="password" class="fi" id="acc-pass" placeholder="At least 8 characters" autocomplete="new-password">
            <button type="button" class="pw-toggle" data-target="acc-pass">Show</button>
          </div>
        </div>
        <div>
          <label class="fl-sm">Confirm password</label>
          <div class="pw-row">
            <input type="password" class="fi" id="acc-pass2" placeholder="Re-enter password" autocomplete="new-password">
            <button type="button" class="pw-toggle" data-target="acc-pass2">Show</button>
          </div>
        </div>
      </div>
      <div class="fg-2" style="margin-top:1rem">
        <div>
          <label class="fl-sm">Country</label>
          <select class="fs" id="acc-phoneCountry" onchange="updatePhoneCode(this.value)">
            <option value="">Select country...</option>
            ${(typeof COUNTRIES!=='undefined'?COUNTRIES:[]).map(c=>`<option value="${c}"${savedCountry===c?' selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="fl-sm">Phone number ${optNote}</label>
          <div class="phone-input-row">
            <span class="phone-code-badge" id="phoneCodeBadge">${code||'+—'}</span>
            <input type="tel" class="fi phone-num-input" id="acc-phone" placeholder="234 567 8900" value="${esc(formData.phone||'')}" autocomplete="tel">
          </div>
        </div>
      </div>
      <div class="ferr" id="fErr"></div>
      <button class="review-submit acct-submit" id="accSubmitBtn" onclick="submitAccount()">Create Account →</button>
      <p class="acct-alt">Already have an account? <a href="${(typeof SITE_ROOT!=='undefined'?SITE_ROOT:'')}login/">Log in</a></p>
    </div>`;
}

function postRenderAccount() {
  document.querySelectorAll('.pw-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const inp=document.getElementById(btn.dataset.target);
      if(!inp) return;
      const reveal = inp.type==='password';
      inp.type = reveal ? 'text' : 'password';
      btn.textContent = reveal ? 'Hide' : 'Show';
    });
  });
}

async function submitAccount() {
  const email=(document.getElementById('acc-email')?.value||'').trim();
  const pass=document.getElementById('acc-pass')?.value||'';
  const pass2=document.getElementById('acc-pass2')?.value||'';
  const phoneCountry=document.getElementById('acc-phoneCountry')?.value||'';
  const phone=(document.getElementById('acc-phone')?.value||'').trim();

  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErr('Please enter a valid email address');
  if(pass.length<8) return showErr('Password must be at least 8 characters');
  if(pass!==pass2) return showErr('Passwords do not match');
  if(phone && !phoneCountry) return showErr("Please select your phone number's country");
  clearErr();

  // Single source of truth for contact — no duplicate email question earlier.
  formData.email=email;
  formData.phoneCountry=phoneCountry;
  formData.phoneCode=(typeof COUNTRY_DIAL_CODES!=='undefined'?COUNTRY_DIAL_CODES[phoneCountry]:'')||'';
  formData.phone=phone;

  if(typeof RA==='undefined'){ return showErr('Sign-up is unavailable right now. Please reload and try again.'); }

  const btn=document.getElementById('accSubmitBtn');
  if(btn){ btn.disabled=true; btn.textContent='Creating account…'; }

  // Snapshot fully-resolved review rows so the dashboard renders identically
  // (getReviewRows resolves shared-charge/labels; the callback won't have it).
  const roles=Array.from(selectedRoles);
  const roleRows={};
  roles.forEach(r=>{ try{ roleRows[r]=getReviewRows(r); }catch(e){ roleRows[r]=[]; } });
  const pending={
    flow:(typeof QUIZ_FLOW!=='undefined'?QUIZ_FLOW:'unknown'),
    username: formData.username||null,
    email,
    roles,
    roleRows,
    onboardingComplete: !SKIPPED_ONBOARDING,   // false when they tapped "Skip for now"
    formData: JSON.parse(JSON.stringify(formData))
  };

  try {
    RA.stashPending(pending);
    const res = await RA.signUp(email, pass, accountRedirectUrl());
    clearQuizState();
    if(res && res.session){
      // Email confirmation disabled → we already have a session; flush now.
      try { await RA.flushPending(); } catch(e){ console.error(e); }
      window.location.href = SITE_ROOT+'dashboard/';
    } else {
      // Confirmation required (custom SMTP sends the email) → explain + wait.
      window.location.href = SITE_ROOT+'signup/verify/';
    }
  } catch(err) {
    console.error('signUp failed', err);
    if(btn){ btn.disabled=false; btn.textContent='Create Account →'; }
    showErr(friendlyAuthError(err));
  }
}

/* Turn a raw Supabase/network auth error into a human message (raw errors can
   be empty objects "{}", "Failed to fetch", or server timeouts). */
function friendlyAuthError(err) {
  let m = (err && err.message) || '';
  if (m === '{}' || m === '[object Object]') m = '';
  if (/registered|already/i.test(m)) return 'An account with this email already exists — try logging in instead.';
  if (/rate limit/i.test(m)) return "We've sent a lot of emails recently. Please wait a minute and try again.";
  if (/failed to fetch|networkerror|load failed|network request failed|deadline|timeout|timed out|504|502|unavailable/i.test(m))
    return "The sign-up service is busy right now (sending the verification email is slow). Please try again in a moment.";
  if (/invalid.*email|email.*invalid/i.test(m)) return 'Please enter a valid email address.';
  return m || "We couldn't create your account just now. Please try again in a moment.";
}

/* ════════════════════════════════════════════════════════════
   EDIT MODE — load an existing profile, save updates (?edit=1)
════════════════════════════════════════════════════════════ */
let _origFlow = null;

// Decide the mode as soon as the page is interactive:
//  • logged-in visitor           → Profile Completion Mode: prefill existing
//    data, no Create Account / email / verify; Finish upserts onto their profile.
//  • ?edit=1 but NOT logged in    → send to login.
//  • otherwise (anonymous)        → leave the normal registration flow (the page's
//    own intro / start-quiz) untouched.
async function onboardingInit() {
  let user = null;
  if (typeof RA !== 'undefined') { try { user = await RA.getUser(); } catch (e) {} }
  if (!user) {
    if (EDIT_MODE) window.location.href = SITE_ROOT + 'login/';
    return;   // fresh registration — the page's own intro/showForm handles it
  }
  // Authenticated → complete/edit the existing profile (never re-register).
  COMPLETION_MODE = true;
  _origFlow = null;
  try {
    const data = await RA.loadProfile();
    if (data && data.profile) {           // prefill everything they've done so far
      _origFlow = data.profile.onboarding_flow || null;
      const mapped = RA.profileToFormData(data);
      Object.keys(formData).forEach(k => delete formData[k]);
      Object.assign(formData, mapped.formData);
      selectedRoles = new Set(mapped.roles);
    }
    // else: no profile row yet — start blank; Finish still upserts onto THIS account.
  } catch (e) { console.error('loadProfile (completion)', e); }
  if (ADD_ROLE_MODE) _existingRoles = new Set(selectedRoles);   // remember what they already had
  invalidateSections();
  showForm();
}

async function saveEdits() {
  if (typeof RA === 'undefined') return showErr('Editing is unavailable right now. Please reload.');
  const roles = Array.from(selectedRoles);
  if (!roles.length) return showErr('Please keep at least one role selected.');
  const roleRows = {};
  roles.forEach(r => { try { roleRows[r] = getReviewRows(r); } catch(e){ roleRows[r] = []; } });
  const pending = {
    flow: _origFlow || (typeof QUIZ_FLOW!=='undefined'?QUIZ_FLOW:'all'),
    username: formData.username || null,
    email: formData.email || null,
    roles, roleRows,
    formData: JSON.parse(JSON.stringify(formData))
  };
  const btn = document.querySelector('.review-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await RA.saveProfile(pending);
    window.location.href = SITE_ROOT + 'dashboard/';
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; }
    showErr(err && err.code === 'username_taken' ? 'That username is already taken — pick another in the General section.' : ((err && err.message) || 'Could not save your changes.'));
  }
}

// Runs after the flow page's inline config script (queued via setTimeout 0).
setTimeout(() => { onboardingInit().catch(e => console.error('onboardingInit', e)); }, 0);

/* ════════════════════════════════════════════════════════════
   SUBMIT (legacy anonymous path — no longer used by signup flows)
════════════════════════════════════════════════════════════ */
let _welcomeTimer=null;

async function submitForm() {
  const flow = (typeof QUIZ_FLOW!=='undefined'?QUIZ_FLOW:'unknown');
  const roles = Array.from(selectedRoles);
  const phone = formData.phone ? `${formData.phoneCode||''} ${formData.phone}`.trim() : null;
  const payload = {
    flow,
    name:    formData.name    || null,
    email:   formData.email   || null,
    phone,
    country: formData.country || null,
    roles,
    data:    { ...formData, roles }
  };
  console.log('Submitting:', payload);

  // Show the welcome overlay immediately for instant feedback, then persist
  // to Supabase before redirecting so an in-flight insert isn't cancelled.
  document.getElementById('s-welcome')?.classList.add('show');
  try {
    if (typeof window.submitToSupabase === 'function') {
      await window.submitToSupabase(payload);
      console.log('Saved to Supabase.');
    } else {
      console.warn('Supabase client not loaded — submission was not persisted.');
    }
  } catch (err) {
    console.error('Supabase submit failed:', err);
  }
  _welcomeTimer=setTimeout(()=>{ window.location.href=SITE_ROOT; },1500);
}

function skipWelcome() {
  clearTimeout(_welcomeTimer);
  window.location.href=SITE_ROOT;
}

function goLanding() { window.location.href=SITE_ROOT; }

/* ════════════════════════════════════════════════════════════
   INTRO — SLOGAN ANIMATION (no-ops on pages without #s-intro)
════════════════════════════════════════════════════════════ */
const SLOGANS = [
  ['Beyond Words','Into Worlds'],
  ['Authentic Experiences','Powered by People'],
  ['Unlock Your','Linguistic Journey'],
  ['Explore Your','Real-Life Stories'],
  ['Discover Your','Unique Adventure'],
  ['Uncover Your','Perfect Match'],
];
let _sloganIdx=0;
(function(){
  const h1=document.getElementById('introH1');
  const l1=document.getElementById('introLine1');
  const l2=document.getElementById('introLine2');
  if (!h1 || !l1 || !l2) return;
  setInterval(()=>{
    _sloganIdx=(_sloganIdx+1)%SLOGANS.length;
    h1.classList.add('slogan-out');
    setTimeout(()=>{
      l1.textContent=SLOGANS[_sloganIdx][0];
      l2.textContent=SLOGANS[_sloganIdx][1];
      h1.classList.remove('slogan-out');
    },300);
  },4000);
})();

/* Guard against bfcache restoring stale in-progress state on Back/Forward */
window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });
