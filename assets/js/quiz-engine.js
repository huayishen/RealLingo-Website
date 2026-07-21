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

function getActiveSections() {
  if (!_cachedSections) {
    _cachedSections = ['general'];
    ROLE_KEYS.forEach(r => { if (selectedRoles.has(r)) _cachedSections.push(r); });
    _cachedSections.push('final','review');
  }
  return _cachedSections;
}
function invalidateSections() { _cachedSections = null; }

function getSectionSteps(key) {
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
      <div class="rslider-track" id="${tid}">
        <div class="rslider-fill" id="${tid}-fill"></div>
        <div class="rslider-handle" id="${tid}-hmin"><div class="rslider-lbl" id="${tid}-lmin"></div></div>
        <div class="rslider-handle" id="${tid}-hmax"><div class="rslider-lbl" id="${tid}-lmax"></div></div>
      </div>
      <div class="slider-ends"><span>${(min).toLocaleString()}</span><span>${(max).toLocaleString()}+</span></div>
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
  const snap = v => Math.round(v/snapStep)*snapStep;
  const pct  = v => ((v-min)/(max-min))*100;
  const fmt  = v => v>=max ? v.toLocaleString()+'+' : v.toLocaleString();
  const curr = () => currId ? (document.getElementById(currId)?.value||'') : '';
  function render() {
    const p1=pct(vMin), p2=pct(vMax);
    hMin.style.left=p1+'%'; hMax.style.left=p2+'%';
    fill.style.left=p1+'%'; fill.style.width=(p2-p1)+'%';
    lMin.textContent=fmt(vMin); lMax.textContent=fmt(vMax);
    if (valEl) valEl.innerHTML=`<strong>${fmt(vMin)} – ${fmt(vMax)}</strong> ${curr()}`;
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
  hMin.addEventListener('pointerdown',e=>{hMin.setPointerCapture(e.pointerId);hMin.classList.add('dragging');e.preventDefault();});
  hMin.addEventListener('pointermove',e=>{if(!hMin.hasPointerCapture(e.pointerId))return;vMin=Math.max(min,Math.min(fromX(e.clientX),vMax-snapStep));render();});
  hMin.addEventListener('pointerup',()=>hMin.classList.remove('dragging'));
  hMax.addEventListener('pointerdown',e=>{hMax.setPointerCapture(e.pointerId);hMax.classList.add('dragging');e.preventDefault();});
  hMax.addEventListener('pointermove',e=>{if(!hMax.hasPointerCapture(e.pointerId))return;vMax=Math.min(max,Math.max(fromX(e.clientX),vMin+snapStep));render();});
  hMax.addEventListener('pointerup',()=>hMax.classList.remove('dragging'));
  track.addEventListener('click',e=>{
    if(e.target.classList.contains('rslider-handle'))return;
    const v=fromX(e.clientX);
    if(Math.abs(v-vMin)<=Math.abs(v-vMax)){vMin=Math.max(min,Math.min(v,vMax-snapStep));}
    else{vMax=Math.min(max,Math.max(v,vMin+snapStep));}
    render();
  });
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
  return `<select class="fs" id="${id}">
    <option value="">Select country...</option>
    ${COUNTRIES.map(c=>`<option value="${c}"${saved===c?' selected':''}>${c}</option>`).join('')}
  </select>`;
}

function multiCountryHtml(id, saved) {
  const savedArr = saved || [];
  return `<select class="fs" id="${id}" multiple style="height:180px;padding:.5rem .75rem;background-image:none">${
    COUNTRIES.map(c=>`<option value="${c}"${savedArr.includes(c)?' selected':''}>${c}</option>`).join('')
  }</select>
  <p style="margin-top:.5rem;font-size:.72rem;color:rgba(255,255,255,.3)">Hold Ctrl / Cmd to select multiple countries</p>`;
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
      ${langDef.variants.filter(v=>v.key in selVars).map(v=>`
        <div class="lang-level-row" id="vrow-${lk}-${v.key}">
          <span class="lang-level-label">${v.label}</span>
          <div class="lang-level-opts">
            ${LANG_LEVELS.map(lv=>`<button type="button" class="lvl-btn${selVars[v.key]===lv.k?' sel':''}" onclick="setLangLevel('${lk}','${v.key}','${lv.k}')">${lv.l}</button>`).join('')}
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}

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
    langDef.variants.filter(v=>v.key in ld).map(v=>`
      <div class="lang-level-row" id="vrow-${lk}-${v.key}">
        <span class="lang-level-label">${v.label}</span>
        <div class="lang-level-opts">
          ${LANG_LEVELS.map(lv=>`<button type="button" class="lvl-btn${ld[v.key]===lv.k?' sel':''}" onclick="setLangLevel('${lk}','${v.key}','${lv.k}')">${lv.l}</button>`).join('')}
        </div>
      </div>`).join('');
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
      <span class="lang-pair-sep">→</span>
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

/* ════════════════════════════════════════════════════════════
   FORM ENGINE — SHOW / NAVIGATE
════════════════════════════════════════════════════════════ */
function showForm() {
  showScreen('s-form');
  invalidateSections();
  sectIdx=0; stepIdx=0;
  renderFormPage('none');
}

function renderFormPage(direction) {
  const inner=document.getElementById('fstepInner');
  const isReview = currentSectionKey()==='review';

  renderSidebar();
  updateProgressBar();
  updateNavButtons();
  document.getElementById('fstepArea').scrollTop=0;

  if (direction==='none') {
    if(isReview) inner.innerHTML=buildReviewHtml();
    else { inner.innerHTML=buildStepHtml(); postRenderStep(); }
    return;
  }
  const outClass=direction==='fwd'?'s-out-l':'s-out-r';
  const inClass=direction==='fwd'?'s-in-r':'s-in-l';
  inner.classList.add(outClass);
  setTimeout(()=>{
    inner.classList.remove(outClass);
    if(isReview) inner.innerHTML=buildReviewHtml();
    else { inner.innerHTML=buildStepHtml(); postRenderStep(); }
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
  const steps=isReview?null:currentSteps();
  const totalSteps=steps?steps.length:0;

  let overallDone=0, overallTotal=0;
  sections.forEach((sk,si)=>{
    if(sk==='review'){overallTotal+=1;if(si<sectIdx)overallDone+=1;}
    else{const st=getSectionSteps(sk)||[];overallTotal+=st.length;if(si<sectIdx)overallDone+=st.length;else if(si===sectIdx)overallDone+=stepIdx;}
  });

  document.getElementById('fpStep').textContent = isReview
    ? 'Review & Submit'
    : `${sLabel} — Step ${stepIdx+1} of ${totalSteps}`;
  document.getElementById('fpTitle').textContent = isReview ? '' : esc(currentSteps()[stepIdx]?.tag||'');
  document.getElementById('fpFill').style.width = `${(overallDone/Math.max(1,overallTotal))*100}%`;
}

function updateNavButtons() {
  const back=document.getElementById('fBtnBack');
  const next=document.getElementById('fBtnNext');
  const isFirst=(sectIdx===0&&stepIdx===0);
  const isReview=currentSectionKey()==='review';
  back.disabled=isFirst;
  next.textContent=isReview?'Submit →':'Next →';
  next.style.display=isReview?'none':'';
}

function renderSidebar() {
  const nav=document.getElementById('sectNav');
  if(!nav)return;
  const sections=getActiveSections();
  nav.innerHTML=`<div class="sn-hd">Progress</div>`+sections.map((key,i)=>{
    const isDone=i<sectIdx;
    const isCur=i===sectIdx;
    const cls=isDone?'done':isCur?'cur':'pending';
    const dot=isDone?'✓':isCur?'→':'';
    return `<div class="sn-item ${cls}"><div class="sn-dot ${cls}">${dot}</div><span class="sn-label">${esc(SECTION_LABEL[key]||key)}</span></div>`;
  }).join('');
}

function nextStep() {
  const sKey=currentSectionKey();
  if(sKey==='review'){submitForm();return;}
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
   REVIEW PAGE
════════════════════════════════════════════════════════════ */
function buildReviewHtml() {
  const sections=getActiveSections().filter(s=>s!=='review');
  let html=`<div class="fstep-tag">Review</div><h2 class="fstep-q" style="margin-bottom:2rem">Almost there!</h2>`;
  sections.forEach((sKey,i)=>{
    const rows=getReviewRows(sKey);
    if(!rows.length)return;
    html+=`<div class="review-section">
      <div class="review-section-hd">
        <span class="review-section-title">${esc(SECTION_LABEL[sKey]||sKey)}</span>
        <button class="review-edit" onclick="jumpToSection(${i})">Edit</button>
      </div>
      ${rows.map(r=>`<div class="review-row"><span class="review-label">${esc(r.l)}</span><span class="review-value">${esc(r.v)}</span></div>`).join('')}
    </div>`;
  });
  html+=`<button class="review-submit" onclick="submitForm()">Sign Up →</button>`;
  return html;
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
      break;
    case 'tutor':
      add('Teaches', lbls(formData.tutorLanguages));
      add('Student level(s)', lbls(formData.tutorStudentLevels));
      add('Teaching mode', lbl(formData.tutorMode));
      add('Charge type(s)', lbls(formData.tutorChargeTypes));
      if(formData.tutorRateMin!=null) add('Rate range', `${formData.tutorRateMin?.toLocaleString()} – ${formData.tutorRateMax?.toLocaleString()} ${formData.tutorCurrency||''}`);
      break;
    case 'translator':
      add('Language pairs', (formData.langPairs||[]).map(p=>`${p.from} → ${p.to}`).filter(s=>s.trim()!=='→').join('; '));
      add('Specializations', lbls(formData.transSpecializations));
      add('Availability', lbls(formData.transAvailability));
      add('Services', lbls(formData.transProvides));
      if(formData.transRateMin!=null) add('Rate range', `${formData.transRateMin?.toLocaleString()} – ${formData.transRateMax?.toLocaleString()} ${formData.transCurrency||''}`);
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
      add('Learning for', [...(formData.learnerPurpose||[]).map(lbl),formData.learnerPurposeOther].filter(Boolean).join(', '));
      add('Looking for', [...(formData.learnerLooking||[]).map(lbl),formData.learnerLookingOther].filter(Boolean).join(', '));
      add('Budget type(s)', [...(formData.learnerBudgetTypes||[]).map(lbl),formData.learnerPeriodSpec].filter(Boolean).join(', '));
      if(formData.learnerBudMin!=null) add('Budget range', `${formData.learnerBudMin?.toLocaleString()} – ${formData.learnerBudMax?.toLocaleString()} ${formData.learnerCurrency||''}`);
      break;
    case 'hireTutor': case 'hireTranslator': case 'hireInfluencer':
    case 'hireTourGuide': case 'hireLanguageEvent': case 'hireLanguageTalent': {
      const p = sKey;
      add('Language(s) needed', lbls(formData[p+'Languages']));
      add('Budget type(s)', [...(formData[p+'BudgetTypes']||[]).map(lbl),formData[p+'PeriodSpec']].filter(Boolean).join(', '));
      if(formData[p+'BudMin']!=null) add('Budget range', `${formData[p+'BudMin']?.toLocaleString()} – ${formData[p+'BudMax']?.toLocaleString()} ${formData[p+'Currency']||''}`);
      break;
    }
    case 'tourGuide':
      add('Work countries', (formData.tourCountries||[]).join(', '));
      add('Charge type(s)', lbls(formData.tourChargeTypes));
      if(formData.tourRateMin!=null) add('Rate range', `${formData.tourRateMin?.toLocaleString()} – ${formData.tourRateMax?.toLocaleString()} ${formData.tourCurrency||''}`);
      break;
    case 'traveler':
      add('Traveling to', (formData.travelCountries||[]).join(', '));
      add('Trip dates', [formData.tripStart,formData.tripEnd].filter(Boolean).join(' → '));
      add('Budget type(s)', lbls(formData.travelBudgetTypes));
      if(formData.travelBudMin!=null) add('Budget range', `${formData.travelBudMin?.toLocaleString()} – ${formData.travelBudMax?.toLocaleString()} ${formData.travelCurrency||''}`);
      break;
    case 'languageEvent':
      add('Based in', formData.eventCountry);
      add('Community language(s)', lbls(formData.eventLanguages));
      break;
    case 'eventMember':
      add('Availability', lbls(formData.memberAvailability));
      add('Interests', lbls(formData.memberInterests));
      add('Partner community member', formData.partnerMember==='yes' ? [...(formData.partnerCommunities||[]).map(lbl),formData.partnerCommunityOther].filter(Boolean).join(', ') : lbl(formData.partnerMember));
      add('Language(s) interested in', [...(formData.memberLangInterest||[]).map(lbl),formData.memberLangInterestOther].filter(Boolean).join(', '));
      break;
    case 'final':
      add('Email', formData.email);
      add('Phone', formData.phone);
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
      return `${vd?.label||vk}${ll?': '+ll.l:''}`;
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
   SUBMIT
════════════════════════════════════════════════════════════ */
let _welcomeTimer=null;

function submitForm() {
  console.log('Submitted:', {flow: (typeof QUIZ_FLOW!=='undefined'?QUIZ_FLOW:'unknown'), roles:Array.from(selectedRoles), form:formData});
  document.getElementById('s-welcome')?.classList.add('show');
  _welcomeTimer=setTimeout(()=>{ window.location.href=SITE_ROOT; },3600);
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
