/* ══════════════════════════════════════════════════════════
   RealLingo — Global account drawer.
   Exposes window.openAccountDrawer(). Requires supabase-client.js +
   auth.js to be loaded first (nav.js lazy-loads them on demand).
══════════════════════════════════════════════════════════ */
(function () {
  if (window.openAccountDrawer) return;

  function ROOT() { return window.SITE_ROOT || './'; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function cap(s) { return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s; }
  function memberSince(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); } catch (e) { return '—'; } }
  function formatLanguages(rows) {
    if (!rows || !rows.length) return '—';
    var by = {}; rows.forEach(function (r) { (by[r.language] = by[r.language] || []).push(r); });
    return Object.keys(by).map(function (lang) {
      var items = by[lang];
      if (items.length === 1 && !items[0].variant) return cap(lang) + ' (' + cap(items[0].level) + ')';
      return cap(lang) + ' — ' + items.map(function (i) { return i.variant ? cap(i.variant) + ': ' + cap(i.level) : cap(i.level); }).join(', ');
    }).join('; ');
  }
  function completion(p, languages, roles) {
    var c = [!!(p && p.full_name), !!(p && p.username), !!(p && p.email), !!(p && p.country), !!(p && p.city), !!(p && p.phone), (languages && languages.length > 0), (roles && roles.length > 0), !!(p && p.avatar_url)];
    return Math.round(c.filter(Boolean).length / c.length * 100);
  }
  function countryOptions(sel) {
    var list = (typeof COUNTRIES !== 'undefined') ? COUNTRIES : [];
    return '<option value="">Select country…</option>' + list.map(function (c) { return '<option value="' + esc(c) + '"' + (sel === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
  }

  var ROLE_META = {
    learner: { label: 'Language Learner', icon: '🎓' }, traveler: { label: 'Traveler', icon: '✈️' }, eventMember: { label: 'Event Member', icon: '🎉' },
    tutor: { label: 'Tutor', icon: '📚' }, translator: { label: 'Translator / Interpreter', icon: '💬' }, influencer: { label: 'Influencer', icon: '📣' },
    tourGuide: { label: 'Tour Guide', icon: '🧭' }, languageEvent: { label: 'Event Organizer', icon: '🌐' }, languageTalent: { label: 'Language Talent', icon: '🌟' },
    hireTranslator: { label: 'Hiring: Translator', icon: '💬' }, hireInfluencer: { label: 'Hiring: Influencer', icon: '📣' },
    hireLanguageEvent: { label: 'Hiring: Event Organizer', icon: '🌐' }, hireLanguageTalent: { label: 'Hiring: Language Talent', icon: '🌟' }
  };
  var NAV = [
    { key: 'dashboard', label: 'Dashboard', icon: '👤' },
    { key: 'roles', label: 'My Roles', icon: '⭐' },
    { key: 'saved', label: 'My Events', icon: '❤️' },           // saved events from the directory
    { key: 'calendar', label: 'Calendar', icon: '📅' },
    { key: 'cart', label: 'My Shopping Cart', icon: '🛒' },      // saved marketplace products
    { key: 'marketplace', label: 'My Listings', icon: '🛍️' },   // seller's own product listings
    { key: 'applications', label: 'My Apps', icon: '📄' },        // scholarship / partner / event applications
    { key: 'settings', label: 'Settings', icon: '⚙️' }
  ];
  var MYPRODUCTS = [], PENDING = [], IS_ADMIN = false;
  var MYEVENTS = [], PENDING_EVENTS = [], IS_EVENT_ADMIN = false, IS_ORGANIZER = false;
  var CAL = { view: 'month', ref: null, detail: null };  // calendar state

  var built = false, DATA = null, SAVED = [], AVATAR = null, CURRENT = 'dashboard';
  var overlay, drawer, hdEl, navEl, contentEl, fileInput;
  var calTarget = null;   // where the calendar renders — the drawer's content, or the global slide-down panel

  var pageMode = false;
  function build(mountEl) {
    if (built) return; built = true;
    pageMode = !!mountEl;
    if (!pageMode) { overlay = document.createElement('div'); overlay.className = 'acct-overlay'; }
    drawer = document.createElement('aside'); drawer.className = 'acct-drawer' + (pageMode ? ' acct-drawer--page' : '');
    drawer.setAttribute('role', pageMode ? 'region' : 'dialog'); if (!pageMode) drawer.setAttribute('aria-modal', 'true');
    drawer.innerHTML =
      '<div class="acct-hd" id="acctHd"></div>' +
      '<div class="acct-main"><nav class="acct-nav" id="acctNav"></nav><div class="acct-content" id="acctContent"></div></div>';
    fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif'; fileInput.style.display = 'none';
    var host = mountEl || document.body;
    if (overlay) document.body.appendChild(overlay);
    host.appendChild(drawer); host.appendChild(fileInput);
    hdEl = drawer.querySelector('#acctHd'); navEl = drawer.querySelector('#acctNav'); contentEl = drawer.querySelector('#acctContent');

    if (overlay) overlay.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (overlay && e.key === 'Escape' && drawer.classList.contains('open')) close(); });
    fileInput.addEventListener('change', onAvatarFile);
  }

  function show() { if (overlay) { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; } drawer.classList.add('open'); }
  function close() { if (overlay) { overlay.classList.remove('open'); document.body.style.overflow = ''; } drawer.classList.remove('open'); }

  async function ensureData() {
    DATA = await RA.loadProfile();
    try { SAVED = await RA.loadSaved(); } catch (e) { SAVED = []; }
    try { MYPRODUCTS = await RA.myProducts(); } catch (e) { MYPRODUCTS = []; }
    try { IS_ADMIN = await RA.isAdmin(); } catch (e) { IS_ADMIN = false; }
    if (IS_ADMIN) { try { PENDING = await RA.pendingProducts(); } catch (e) { PENDING = []; } }
    IS_ORGANIZER = ((DATA && DATA.roles) || []).some(function (r) { return r.role_key === 'languageEvent'; });
    try { MYEVENTS = await RA.myEvents(); } catch (e) { MYEVENTS = []; }
    if (MYEVENTS.length) IS_ORGANIZER = true;   // anyone who has submitted an event also sees the panel
    try { IS_EVENT_ADMIN = await RA.isEventAdmin(); } catch (e) { IS_EVENT_ADMIN = false; }
    if (IS_EVENT_ADMIN) { try { PENDING_EVENTS = await RA.pendingEvents(); } catch (e) { PENDING_EVENTS = []; } }
    var p = DATA && DATA.profile;
    AVATAR = (p && p.avatar_url) ? await RA.avatarPublicUrl(p.avatar_url) : (ROOT() + 'assets/img/default-avatar.png');
  }

  function firstName(p) { return ((p && p.full_name || '').trim().split(/\s+/)[0]) || (p && p.username) || 'there'; }

  // Username may change at most twice per 30 days (name has no limit). Tracked
  // client-side per user; enforced in the UI before calling updateUsername.
  var UNAME_LIMIT = 2, UNAME_WINDOW_MS = 30 * 24 * 3600 * 1000;
  function unameKey(uid) { return 'ra_uname_changes_' + uid; }
  function recentUnameChanges(uid) {
    var cutoff = Date.now() - UNAME_WINDOW_MS, arr = [];
    try { arr = JSON.parse(localStorage.getItem(unameKey(uid)) || '[]'); } catch (e) { arr = []; }
    return (Array.isArray(arr) ? arr : []).filter(function (t) { return typeof t === 'number' && t >= cutoff; });
  }
  function recordUnameChange(uid) {
    var arr = recentUnameChanges(uid); arr.push(Date.now());
    try { localStorage.setItem(unameKey(uid), JSON.stringify(arr)); } catch (e) {}
  }
  function unameDaysUntilAllowed(uid) {
    var recent = recentUnameChanges(uid);
    if (recent.length < UNAME_LIMIT) return 0;
    var oldest = Math.min.apply(null, recent);
    return Math.max(1, Math.ceil((oldest + UNAME_WINDOW_MS - Date.now()) / (24 * 3600 * 1000)));
  }

  function renderHeader() {
    var p = DATA.profile || {};
    hdEl.innerHTML =
      '<img class="acct-hd-ava" src="' + esc(AVATAR) + '"' + (p.avatar_url ? '' : ' data-default="1"') + ' alt="Avatar">' +
      '<div class="acct-hd-id"><div class="acct-hd-name">' + esc(p.full_name || 'Your account') + '</div>' +
      '<div class="acct-hd-uname">@' + esc(p.username || '') + '</div>' +
      '<div class="acct-hd-email">' + esc(p.email || '') + '</div></div>' +
      '<button class="acct-close" id="acctClose" aria-label="Close">&times;</button>';
    hdEl.querySelector('#acctClose').addEventListener('click', close);
    hdEl.querySelector('.acct-hd-ava').addEventListener('click', function () { CURRENT = 'settings'; renderNav(); paint('settings'); });
  }

  function renderNav() {
    var items = NAV.slice();
    function insertAfter(key, item) { var i = -1; for (var j = 0; j < items.length; j++) { if (items[j].key === key) { i = j; break; } } items.splice(i >= 0 ? i + 1 : items.length, 0, item); }
    if (IS_ORGANIZER) insertAfter('applications', { key: 'myevents', label: 'Hosted Events', icon: '📅' });
    if (IS_ADMIN) insertAfter('marketplace', { key: 'adminreview', label: 'Admin Review', icon: '🛡️' });          // pr@ (marketplace)
    if (IS_EVENT_ADMIN) insertAfter('adminreview', { key: 'eventreview', label: 'Event Review', icon: '🗓️' });    // my@ (events)
    navEl.innerHTML = items.map(function (it) {
      var count = it.key === 'adminreview' ? PENDING.length : (it.key === 'eventreview' ? PENDING_EVENTS.length : 0);
      var badge = count ? ' <span class="acct-nav-badge">' + count + '</span>' : '';
      return '<button class="acct-nav-item' + (it.key === CURRENT ? ' active' : '') + '" data-nav="' + it.key + '"><span class="acct-nav-lbl">' + it.label + badge + '</span></button>';
    }).join('') + '<button class="acct-nav-item acct-nav-logout" data-nav="__logout"><span class="acct-nav-lbl">Log Out</span></button>';
    navEl.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () { b.dataset.nav === '__logout' ? doLogout() : go(b.dataset.nav); });
    });
  }

  function go(section) {
    if (section === CURRENT) return;
    CURRENT = section;
    navEl.querySelectorAll('.acct-nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.nav === section); });
    contentEl.classList.add('switching');
    setTimeout(function () { paint(section); contentEl.classList.remove('switching'); }, 160);
  }

  function paint(section) {
    if (section === 'dashboard') return renderDashboard();
    if (section === 'roles') return renderRoles();
    if (section === 'applications') return renderApplications();
    if (section === 'saved') return renderSaved();
    if (section === 'cart') return renderCart();
    if (section === 'calendar') return renderCalendar(contentEl);
    if (section === 'marketplace') return renderMarketplace();
    if (section === 'adminreview') return renderAdminReview();
    if (section === 'myevents') return renderMyEvents();
    if (section === 'eventreview') return renderEventReview();
    if (section === 'settings') return renderSettings();
  }

  function renderDashboard() {
    var p = DATA.profile, pct = completion(p, DATA.languages, DATA.roles);
    var html = '<h1 class="acct-h1">Welcome back, ' + esc(firstName(p)) + '!</h1><p class="acct-sub">Your RealLingo control center.</p>';
    // Profile started but not finished (they tapped "Skip for now" at signup) —
    // invite them to complete it. Goes to the quiz in edit mode, which loads
    // their account and skips the email/password/verify step entirely.
    if (p.onboarding_complete === false) {
      html += '<a class="acct-complete-cta" href="' + ROOT() + 'signup/user/">' +
        '<div class="acct-complete-txt"><strong>Complete your profile</strong>' +
        '<span>Answer a few quick questions so we can match you with the right people and opportunities.</span></div>' +
        '<span class="acct-complete-arrow">→</span></a>';
    }
    html += '<div class="acct-card"><div class="acct-progress-top"><span>Profile completion</span><span>' + pct + '%</span></div>' +
      '<div class="acct-progress-track"><div class="acct-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="acct-stats">' +
        '<div class="acct-stat"><div class="acct-stat-num">' + DATA.roles.length + '</div><div class="acct-stat-lbl">Roles</div></div>' +
        '<div class="acct-stat"><div class="acct-stat-num">' + DATA.applications.length + '</div><div class="acct-stat-lbl">Applications</div></div>' +
        '<div class="acct-stat"><div class="acct-stat-num">' + SAVED.length + '</div><div class="acct-stat-lbl">Saved</div></div>' +
      '</div></div>';
    html += '<h2 class="acct-h2">Roles</h2>';
    html += DATA.roles.length
      ? '<div class="acct-chips">' + DATA.roles.map(function (rr) { var m = ROLE_META[rr.role_key] || {}; return '<span class="acct-chip">' + (m.icon || '⭐') + ' ' + esc(m.label || rr.role_key) + '</span>'; }).join('') + '</div>'
      : '<div class="acct-empty">No roles yet. <a class="acct-role-cta" href="' + ROOT() + 'signup/user/?edit=1">Add roles →</a></div>';
    html += '<h2 class="acct-h2">Languages</h2><div class="acct-card">' + esc(formatLanguages(DATA.languages)) + '</div>';
    function kv(l, v) { return '<div class="acct-kv"><div class="acct-kv-lbl">' + esc(l) + '</div><div class="acct-kv-val">' + esc(v || '—') + '</div></div>'; }
    html += '<h2 class="acct-h2">Contact</h2><div class="acct-card"><div class="acct-2col">' +
      kv('Email', p.email) + kv('Member since', memberSince(p.created_at)) +
      kv('Country', p.country) + kv('City', p.city) +
      '</div></div>';
    contentEl.innerHTML = html;
  }

  function renderRoles() {
    var p = DATA.profile;
    if (!DATA.roles.length) { contentEl.innerHTML = '<h1 class="acct-h1">My Roles</h1><div class="acct-empty">No roles selected yet. <a class="acct-role-cta" href="' + ROOT() + 'signup/user/?edit=1">Add roles →</a></div>'; return; }
    var html = '<h1 class="acct-h1">My Roles</h1><p class="acct-sub">Tap a role to see its details.</p>';
    DATA.roles.forEach(function (rr) {
      var r = rr.role_key, m = ROLE_META[r] || {}, detail = DATA.roleDetails[r], rows = (detail && detail.details && detail.details.display_rows) || [];
      var preview = rows.slice(0, 2).map(function (x) { return x.v; }).join(' · ') || 'No details yet';
      html += '<div class="acct-card acct-clickable acct-role-card" data-role="' + r + '">' +
        '<div class="acct-role-hd"><span class="acct-role-ico">' + (m.icon || '⭐') + '</span><span class="acct-role-title">' + esc(m.label || r) + '</span></div>' +
        '<div class="acct-role-preview">' + esc(preview) + '</div>' +
        '<div class="acct-role-detail" style="display:none">' +
          rows.map(function (x) { return '<div class="acct-row"><span class="acct-row-lbl">' + esc(x.l) + '</span><span class="acct-row-val">' + esc(x.v) + '</span></div>'; }).join('') +
          '<div style="margin-top:.8rem"><a class="acct-btn acct-btn-solid" href="' + ROOT() + 'signup/user/?edit=1">Edit in full editor →</a></div>' +
        '</div>' +
        '<div class="acct-role-cta acct-role-toggle">View details →</div>' +
      '</div>';
    });
    // Add-a-role affordance — opens the full editor (with the role picker) and
    // preserves the roles they already have.
    html += '<a href="' + ROOT() + 'signup/user/?edit=1" style="display:block;text-align:center;margin-top:1rem;padding:.85rem;border:1.5px dashed var(--aborder);border-radius:12px;color:var(--adark);font-weight:700;font-size:.9rem;text-decoration:none">Edit my profile</a>';
    contentEl.innerHTML = html;
    contentEl.querySelectorAll('.acct-role-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('a')) return; // let the edit link work
        var det = card.querySelector('.acct-role-detail'), cta = card.querySelector('.acct-role-toggle');
        var open = det.style.display !== 'none';
        det.style.display = open ? 'none' : 'block';
        cta.textContent = open ? 'View details →' : 'Hide details ↑';
      });
    });
  }

  function renderApplications() {
    var html = '<h1 class="acct-h1">My Apps</h1><p class="acct-sub">Your scholarship, partner, and event applications.</p>';
    if (!DATA.applications.length) { html += '<div class="acct-empty">No applications yet. Scholarship, partner, and event applications will appear here.</div>'; }
    else html += DATA.applications.map(function (a) {
      return '<div class="acct-card"><div style="font-weight:700;text-transform:capitalize">' + esc(a.type) + ' application</div>' +
        '<div style="color:var(--asoft);font-size:.8rem;margin-top:.2rem">' + memberSince(a.created_at) + '</div>' +
        '<span class="acct-chip" style="margin-top:.6rem">' + esc(a.status || 'submitted') + '</span></div>';
    }).join('');
    contentEl.innerHTML = html;
  }

  function renderSaved() {
    var items = SAVED.filter(function (s) { return s.item_type === 'event'; });
    var html = '<h1 class="acct-h1">My Events</h1><p class="acct-sub">Events you\'ve saved from the directory.</p>';
    if (!items.length) { html += '<div class="acct-empty">No saved events yet. Tap the ♥ on an event in the <a class="acct-role-cta" href="' + ROOT() + 'eventpartners/">Event Directory</a> to save it here.</div>'; contentEl.innerHTML = html; return; }
    html += items.map(function (s) {
      var d = s.data || {};
      var loc = [(d.cities || []).filter(Boolean).join(', '), d.country].filter(Boolean).join(', ');
      var when = d.dateLabel || d.startDate || '';
      if (d.startTime) when += (when ? ' · ' : '') + fmtTime(d.startTime) + (d.endTime ? '–' + fmtTime(d.endTime) : '');
      var comm = (d.communities || []).filter(Boolean).join(' + ');
      var tags = '';
      if (d.format) tags += '<span class="acct-ev-tag">' + esc(d.format) + '</span>';
      if (d.entranceFee) tags += '<span class="acct-ev-tag">' + esc(d.entranceFee) + '</span>';
      tags += (d.languages || []).map(function (l) { return '<span class="acct-ev-tag acct-ev-tag--lang">' + esc(l) + '</span>'; }).join('');
      return '<div class="acct-card acct-ev-card">' +
        (s.url ? '<a href="' + esc(s.url) + '" class="acct-ev-link">' : '<div>') +
          '<div class="acct-ev-title">' + esc(s.title || d.series || s.item_ref) + '</div>' +
          (comm ? '<div class="acct-ev-comm">' + esc(comm) + '</div>' : '') +
          '<div class="acct-ev-meta">' +
            (loc ? '<span>📍 ' + esc(loc) + '</span>' : '') +
            (when ? '<span>🗓 ' + esc(when) + '</span>' : '') +
          '</div>' +
          (tags ? '<div class="acct-ev-tags">' + tags + '</div>' : '') +
        (s.url ? '</a>' : '</div>') +
        '<div class="acct-btn-row">' + evActionBtns(d) + '<button class="acct-btn acct-btn-danger" data-ev-remove="' + esc(s.item_ref) + '">Remove</button></div>' +
      '</div>';
    }).join('');
    contentEl.innerHTML = html;
    contentEl.querySelectorAll('[data-ev-remove]').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        try {
          await RA.unsaveItem('event', b.dataset.evRemove);
          SAVED = SAVED.filter(function (s) { return !(s.item_type === 'event' && s.item_ref === b.dataset.evRemove); });
          renderSaved();
        } catch (e) { b.disabled = false; alert('Could not remove: ' + (e.message || e)); }
      });
    });
  }

  // ─────────── My Shopping Cart (saved marketplace products) ───────────
  function renderCart() {
    var items = SAVED.filter(function (s) { return s.item_type === 'product'; });
    var html = '<h1 class="acct-h1">My Shopping Cart</h1><p class="acct-sub">Products you\'ve saved from the Marketplace. Contact the seller to buy.</p>';
    if (!items.length) {
      html += '<div class="acct-empty">Your cart is empty. Browse the <a class="acct-role-cta" href="' + ROOT() + 'resources/marketplace/">Marketplace</a> and add products here.</div>';
      contentEl.innerHTML = html; return;
    }
    html += items.map(function (s) {
      var d = s.data || {};
      var img = null; try { img = d.image_url ? RA.productImageUrl(d.image_url) : null; } catch (e) {}
      var priceHtml = (d.price == null || d.price === '') ? '<span class="mp-lp-now">—</span>' : mpPriceHtml({ price: d.price, original_price: d.original_price, currency: d.currency });
      return '<div class="acct-card mp-listing">' +
        '<div class="mp-listing-row">' +
          '<div class="mp-listing-thumb"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '>' + (img ? '' : '🛍️') + '</div>' +
          '<div class="mp-listing-main"><div class="mp-listing-title">' + esc(s.title || 'Product') + '</div>' +
            '<div class="mp-listing-price">' + priceHtml + '</div></div>' +
        '</div>' +
        '<div class="acct-btn-row">' +
          '<a class="acct-btn" href="' + esc(s.url || (ROOT() + 'resources/marketplace/')) + '">View in Marketplace</a>' +
          '<button class="acct-btn acct-btn-danger" data-cart-remove="' + esc(s.item_ref) + '">Remove</button>' +
        '</div></div>';
    }).join('');
    contentEl.innerHTML = html;
    contentEl.querySelectorAll('[data-cart-remove]').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        try {
          await RA.unsaveItem('product', b.dataset.cartRemove);
          SAVED = SAVED.filter(function (s) { return !(s.item_type === 'product' && s.item_ref === b.dataset.cartRemove); });
          renderCart(); renderNav();
        } catch (e) { b.disabled = false; alert('Could not remove: ' + (e.message || e)); }
      });
    });
  }

  // ─────────── Calendar ───────────
  var WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MO = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function pad2(n){ return (n<10?'0':'')+n; }
  function fmtDate(d){ return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
  function fmtLong(d){ return WD[d.getDay()]+', '+MO[d.getMonth()]+' '+d.getDate(); }
  function startOfDay(d){ var x=new Date(d); x.setHours(0,0,0,0); return x; }
  function startOfWeek(d){ var x=startOfDay(d); x.setDate(x.getDate()-x.getDay()); return x; }
  function fmtTime(t){ if(!t) return ''; var p=t.split(':'); var h=parseInt(p[0],10); var ap=h<12?'AM':'PM'; var hh=h%12; if(hh===0)hh=12; return hh+(p[1]&&p[1]!=='00'?':'+p[1]:'')+' '+ap; }
  function evTimeLabel(ev){ if(!ev.startTime) return 'Time TBD'; return fmtTime(ev.startTime)+(ev.endTime?' – '+fmtTime(ev.endTime):''); }
  // Event action buttons (Sign Up / More Info / Directions) — shown only when the
  // saved event snapshot carries the link. Guards against non-http hrefs.
  function acctSafeUrl(u){ return (typeof u==='string' && /^https?:\/\//i.test(u.trim())) ? u.trim() : ''; }
  function evActionBtns(d){
    d = d || {};
    var reg=acctSafeUrl(d.registerLink), ext=acctSafeUrl(d.externalLink), addr=acctSafeUrl(d.addressLink);
    var b='';
    if(reg)  b+='<a class="acct-btn acct-btn-solid" href="'+esc(reg)+'" target="_blank" rel="noopener">Sign Up ↗</a>';
    if(ext)  b+='<a class="acct-btn" href="'+esc(ext)+'" target="_blank" rel="noopener">More Info ↗</a>';
    if(addr) b+='<a class="acct-btn" href="'+esc(addr)+'" target="_blank" rel="noopener">📍 Directions</a>';
    return b;
  }

  function calEvents() {
    var out = [];
    (SAVED || []).forEach(function (s) {
      if (s.item_type !== 'event') return;
      var d = s.data || {};
      if (!d.startDate) return;
      var p = d.startDate.split('-');
      var dt = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10));
      out.push({
        ref: s.item_ref, saved: s, raw: d, date: dt, dateStr: d.startDate,
        title: s.title || d.series || 'Event', series: d.series || '',
        startTime: d.startTime, endTime: d.endTime,
        city: (d.cities && d.cities[0]) || '', country: d.country || '',
        language: (d.languages && d.languages[0]) || ''
      });
    });
    return out;
  }
  // Extensible category system: saved (black) / registered (yellow) / past (grey).
  function eventCategory(ev) {
    if (ev.saved && ev.saved.item_type === 'registration') return 'registered';
    if (ev.date < startOfDay(new Date())) return 'past';
    return 'saved';
  }

  function renderCalendar(target) {
    if (target) calTarget = target;
    if (!calTarget) calTarget = contentEl;
    if (!CAL.ref) CAL.ref = new Date();
    if (CAL.detail) return renderEventDetail(CAL.detail);
    var events = calEvents();
    if (!events.length) {
      calTarget.innerHTML =
        '<h1 class="acct-h1">Calendar</h1>' +
        '<div class="cal-empty"><div class="cal-empty-ill">📅</div><div class="cal-empty-title">Your calendar is empty</div>' +
        '<p class="cal-empty-sub">Save or register for events to see them here.</p>' +
        '<a class="acct-btn acct-btn-solid" href="' + ROOT() + 'eventpartners/">Explore Events</a></div>';
      return;
    }
    var periodLabel = CAL.view === 'agenda' ? 'All events'
      : CAL.view === 'day' ? fmtLong(CAL.ref) + ', ' + CAL.ref.getFullYear()
      : CAL.view === 'week' ? weekLabel(CAL.ref)
      : MO[CAL.ref.getMonth()] + ' ' + CAL.ref.getFullYear();
    var views = ['month','week','day','agenda'];
    var html = '<div class="cal">' +
      '<div class="cal-hd">' +
        '<div class="cal-topline">' +
          '<div class="cal-navrow">' +
            (CAL.view==='agenda' ? '' : '<button class="cal-arrow" data-cal="prev" aria-label="Previous">‹</button>') +
            '<span class="cal-period">' + esc(periodLabel) + '</span>' +
            (CAL.view==='agenda' ? '' : '<button class="cal-arrow" data-cal="next" aria-label="Next">›</button>') +
          '</div>' +
          '<button class="cal-today" data-cal="today">Today</button>' +
        '</div>' +
        '<div class="cal-views">' + views.map(function(v){ return '<button class="cal-view-btn'+(v===CAL.view?' active':'')+'" data-view="'+v+'">'+cap(v)+'</button>'; }).join('') + '</div>' +
      '</div>' +
      '<div class="cal-body">' + calBody(events) + '</div>' +
    '</div>';
    calTarget.innerHTML = html;
    wireCalendar();
  }
  function weekLabel(ref){ var s=startOfWeek(ref); var e=new Date(s); e.setDate(e.getDate()+6); return MO[s.getMonth()].slice(0,3)+' '+s.getDate()+' – '+MO[e.getMonth()].slice(0,3)+' '+e.getDate()+', '+e.getFullYear(); }

  function calBody(events){
    if (CAL.view === 'month') return monthView(events);
    if (CAL.view === 'week') return weekView(events);
    if (CAL.view === 'day') return dayView(events);
    return agendaView(events);
  }
  function eventsByDay(events){ var m={}; events.forEach(function(ev){ (m[ev.dateStr]=m[ev.dateStr]||[]).push(ev); }); return m; }
  function evChip(ev){ return '<button class="cal-ev cal-ev-'+eventCategory(ev)+'" data-ev="'+esc(ev.ref)+'">'+esc(ev.title)+'</button>'; }

  function monthView(events){
    var y=CAL.ref.getFullYear(), m=CAL.ref.getMonth();
    var startDay=new Date(y,m,1).getDay();
    var dim=new Date(y,m+1,0).getDate();
    var today=startOfDay(new Date());
    var byDay=eventsByDay(events);
    var head='<div class="cal-grid cal-head-row">'+WD.map(function(d){return '<div class="cal-wd">'+d.charAt(0)+'</div>';}).join('')+'</div>';
    var total=Math.ceil((startDay+dim)/7)*7;
    var cells='';
    for(var i=0;i<total;i++){
      var n=i-startDay+1;
      if(n<1||n>dim){ cells+='<div class="cal-cell cal-cell-off"></div>'; continue; }
      var cd=new Date(y,m,n); var ds=fmtDate(cd);
      var evs=byDay[ds]||[];
      cells+='<div class="cal-cell'+(cd.getTime()===today.getTime()?' cal-cell-today':'')+'" data-day="'+ds+'">'+
        '<div class="cal-daynum">'+n+'</div>'+
        '<div class="cal-cell-evs">'+evs.slice(0,3).map(evChip).join('')+(evs.length>3?'<div class="cal-more">+'+(evs.length-3)+'</div>':'')+'</div>'+
      '</div>';
    }
    return head+'<div class="cal-grid cal-days-grid">'+cells+'</div>';
  }
  function weekView(events){
    var s=startOfWeek(CAL.ref); var today=startOfDay(new Date()); var byDay=eventsByDay(events);
    var cols='';
    for(var i=0;i<7;i++){ var cd=new Date(s); cd.setDate(s.getDate()+i); var ds=fmtDate(cd); var evs=(byDay[ds]||[]).sort(function(a,b){return (a.startTime||'').localeCompare(b.startTime||'');});
      cols+='<div class="cal-wk-col'+(cd.getTime()===today.getTime()?' cal-wk-today':'')+'">'+
        '<div class="cal-wk-hd"><span class="cal-wk-wd">'+WD[cd.getDay()]+'</span><span class="cal-wk-num">'+cd.getDate()+'</span></div>'+
        '<div class="cal-wk-evs">'+(evs.length?evs.map(function(ev){return '<button class="cal-wev cal-ev-'+eventCategory(ev)+'" data-ev="'+esc(ev.ref)+'"><span class="cal-wev-t">'+esc(fmtTime(ev.startTime)||'')+'</span>'+esc(ev.title)+'</button>';}).join(''):'')+'</div>'+
      '</div>';
    }
    return '<div class="cal-week">'+cols+'</div>';
  }
  function dayView(events){
    var ds=fmtDate(CAL.ref); var evs=calEvents().filter(function(ev){return ev.dateStr===ds;}).sort(function(a,b){return (a.startTime||'').localeCompare(b.startTime||'');});
    if(!evs.length) return '<div class="acct-empty">No events on this day.</div>';
    return '<div class="cal-agenda">'+evs.map(agendaItem).join('')+'</div>';
  }
  function agendaView(events){
    var sorted=events.slice().sort(function(a,b){return a.date-b.date || (a.startTime||'').localeCompare(b.startTime||'');});
    var groups={}; sorted.forEach(function(ev){ (groups[ev.dateStr]=groups[ev.dateStr]||[]).push(ev); });
    return '<div class="cal-agenda">'+Object.keys(groups).map(function(ds){
      var d=groups[ds][0].date;
      return '<div class="cal-agenda-day"><div class="cal-agenda-date">'+esc(fmtLong(d))+'</div>'+groups[ds].map(agendaItem).join('')+'</div>';
    }).join('')+'</div>';
  }
  function agendaItem(ev){
    var cat=eventCategory(ev);
    return '<button class="cal-ag-item" data-ev="'+esc(ev.ref)+'">'+
      '<span class="cal-ag-dot cal-dot-'+cat+'"></span>'+
      '<span class="cal-ag-main"><span class="cal-ag-title">'+esc(ev.title)+'</span>'+
      '<span class="cal-ag-meta">'+esc(evTimeLabel(ev))+(ev.city?' · '+esc(ev.city):'')+(ev.language?' · '+esc(ev.language):'')+'</span></span>'+
      '<span class="cal-ag-chevron">›</span>'+
    '</button>';
  }

  function renderEventDetail(ref){
    var ev = calEvents().filter(function(e){return e.ref===ref;})[0];
    if(!ev){ CAL.detail=null; return renderCalendar(); }
    var d=ev.raw; var cat=eventCategory(ev);
    function row(l,v){ return v ? '<div class="acct-row"><span class="acct-row-lbl">'+esc(l)+'</span><span class="acct-row-val">'+esc(v)+'</span></div>' : ''; }
    var catLabel = cat==='past'?'Past':cat==='registered'?'Registered':'Saved';
    var html = '<button class="cal-back" data-cal="back">‹ Back to calendar</button>'+
      '<div class="cal-detail-head"><span class="cal-dot-lg cal-dot-'+cat+'"></span><span class="cal-detail-cat">'+catLabel+'</span></div>'+
      '<h1 class="acct-h1" style="margin-top:.4rem">'+esc(ev.title)+'</h1>'+
      (d.overview?'<p class="acct-sub">'+esc(d.overview)+'</p>':'')+
      '<div class="acct-card" style="margin-top:.5rem">'+
        row('Date', fmtLong(ev.date)+', '+ev.date.getFullYear())+
        row('Time', evTimeLabel(ev))+
        (d.venue ? '<div class="acct-row"><span class="acct-row-lbl">Venue</span><span class="acct-row-val">'+(acctSafeUrl(d.addressLink)?'<a href="'+esc(acctSafeUrl(d.addressLink))+'" target="_blank" rel="noopener" class="acct-ev-addr">'+esc(d.venue)+' ↗</a>':esc(d.venue))+'</span></div>' : '')+
        row('City', (d.cities||[]).join(' / '))+
        row('Country', d.country)+
        row('Primary language', (d.languages||[]).join(', '))+
        row('Supporting', (d.supportingLanguages||[]).join(', '))+
        row('Program series', d.series)+
        row('Community', (d.communities||[]).join(' + '))+
        row('Format', d.format)+
        row('Moderator', d.moderator)+
        row('RSVP required', d.rsvp)+
        row('Networking', d.networking)+
        row('Entrance fee', d.entranceFee)+
      '</div>'+
      (evActionBtns(d) ? '<div class="cal-detail-actions">'+evActionBtns(d)+'</div>' : '')+
      '<div class="cal-detail-actions">'+
        '<a class="acct-btn acct-btn-solid" href="'+esc((ev.saved && ev.saved.url) || (ROOT()+'eventpartners/'))+'">View Event</a>'+
        '<button class="acct-btn acct-btn-danger" data-cal="remove" data-ref="'+esc(ev.ref)+'">Remove from Saved</button>'+
      '</div>'+
      '<div class="cal-detail-actions"><button class="acct-btn" disabled>Add reminder (soon)</button><button class="acct-btn" disabled>Share (soon)</button></div>';
    calTarget.innerHTML = html;
    calTarget.querySelector('[data-cal="back"]').addEventListener('click', function(){ CAL.detail=null; renderCalendar(); });
    var rm=calTarget.querySelector('[data-cal="remove"]');
    if(rm) rm.addEventListener('click', async function(){
      rm.disabled=true;
      try { await RA.unsaveItem('event', ev.ref); SAVED = SAVED.filter(function(s){return !(s.item_type==='event'&&s.item_ref===ev.ref);}); CAL.detail=null; renderCalendar(); }
      catch(e){ rm.disabled=false; alert('Could not remove: '+(e.message||e)); }
    });
  }

  function wireCalendar(){
    calTarget.querySelectorAll('[data-cal]').forEach(function(b){
      b.addEventListener('click', function(){
        var a=b.dataset.cal;
        if(a==='today'){ CAL.ref=new Date(); }
        else if(a==='prev'||a==='next'){
          var dir=a==='prev'?-1:1; var r=new Date(CAL.ref);
          if(CAL.view==='month') r.setMonth(r.getMonth()+dir);
          else if(CAL.view==='week') r.setDate(r.getDate()+7*dir);
          else if(CAL.view==='day') r.setDate(r.getDate()+dir);
          CAL.ref=r;
        } else return;
        renderCalendar();
      });
    });
    calTarget.querySelectorAll('.cal-view-btn').forEach(function(b){
      b.addEventListener('click', function(){ CAL.view=b.dataset.view; renderCalendar(); });
    });
    calTarget.querySelectorAll('[data-ev]').forEach(function(b){
      b.addEventListener('click', function(e){ e.stopPropagation(); CAL.detail=b.dataset.ev; renderEventDetail(b.dataset.ev); });
    });
    // clicking a month day cell (not on an event) → jump to that day
    calTarget.querySelectorAll('.cal-cell[data-day]').forEach(function(c){
      c.addEventListener('click', function(){ var p=c.dataset.day.split('-'); CAL.ref=new Date(+p[0],+p[1]-1,+p[2]); CAL.view='day'; renderCalendar(); });
    });
  }

  function mpMoney(p, c) { return (p == null || p === '') ? '—' : (c || 'USD') + ' ' + Number(p).toLocaleString(); }
  // Sale-price markup, consistent with the marketplace page: struck-through
  // reference price + auto-computed "% OFF" pill when there's a genuine
  // original price; plain price otherwise.
  function mpPriceHtml(p) {
    var cur = p.currency || 'USD', now = p.price, orig = p.original_price;
    if (now == null || now === '') return '<span class="mp-lp-now">—</span>';
    var hasDisc = orig != null && orig !== '' && Number(orig) > Number(now);
    var pct = hasDisc ? Math.round((Number(orig) - Number(now)) / Number(orig) * 100) : 0;
    return '<span class="mp-lp">' +
      (hasDisc ? '<span class="mp-lp-orig">' + esc(mpMoney(orig, cur)) + '</span>' : '') +
      '<span class="mp-lp-now">' + esc(mpMoney(now, cur)) + '</span>' +
      (hasDisc ? '<span class="mp-lp-badge">' + pct + '% OFF</span>' : '') + '</span>';
  }
  function mpStatusBadge(s) {
    var map = { pending: ['Pending review', 'pend'], approved: ['Live', 'ok'], rejected: ['Rejected', 'rej'], sold: ['Sold', 'sold'] };
    var m = map[s] || [s, '']; return '<span class="mp-badge mp-badge-' + m[1] + '">' + m[0] + '</span>';
  }
  function mpListingCard(p, actionsHtml) {
    var img = p.image_url ? RA.productImageUrl(p.image_url) : null;
    return '<div class="acct-card mp-listing">' +
      '<div class="mp-listing-row">' +
        '<div class="mp-listing-thumb"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '>' + (img ? '' : '🛍️') + '</div>' +
        '<div class="mp-listing-main"><div class="mp-listing-title">' + esc(p.title) + '</div>' +
          '<div class="mp-listing-price">' + mpPriceHtml(p) + '</div>' + mpStatusBadge(p.status) +
        '</div></div>' + (actionsHtml || '') + '</div>';
  }
  function renderMarketplace() {
    var items = MYPRODUCTS || [];
    var active = items.filter(function (p) { return p.status === 'approved'; }).length;
    var pend = items.filter(function (p) { return p.status === 'pending'; }).length;
    var sold = items.filter(function (p) { return p.status === 'sold'; }).length;
    var html = '<h1 class="acct-h1">My Listings</h1><p class="acct-sub">The products you\'ve listed on the Marketplace.</p>';
    html += '<div class="acct-card"><div class="acct-stats">' +
      '<div class="acct-stat"><div class="acct-stat-num">' + active + '</div><div class="acct-stat-lbl">Live</div></div>' +
      '<div class="acct-stat"><div class="acct-stat-num">' + pend + '</div><div class="acct-stat-lbl">Pending</div></div>' +
      '<div class="acct-stat"><div class="acct-stat-num">' + sold + '</div><div class="acct-stat-lbl">Sold</div></div>' +
      '</div></div>';
    html += '<a class="acct-btn acct-btn-solid" style="margin:1rem 0;display:inline-block" href="' + ROOT() + 'resources/marketplace/">＋ List a new item</a>';
    if (!items.length) { html += '<div class="acct-empty">No listings yet. List something on the Marketplace and it will show here.</div>'; contentEl.innerHTML = html; return; }
    html += '<h2 class="acct-h2">Your listings</h2>';
    items.forEach(function (p) {
      var acts = '<div class="mp-listing-actions">' +
        (p.status === 'rejected' && p.reject_reason ? '<div class="mp-listing-reason">Rejected: ' + esc(p.reject_reason) + '</div>' : '') +
        (p.status === 'approved' ? '<button class="acct-btn mp-act" data-act="sold" data-pid="' + p.id + '">Mark sold</button>' : '') +
        '<button class="acct-btn acct-btn-danger mp-act" data-act="delete" data-pid="' + p.id + '">Delete</button>' + '</div>';
      html += mpListingCard(p, acts);
    });
    contentEl.innerHTML = html;
    contentEl.querySelectorAll('.mp-act').forEach(function (b) {
      b.addEventListener('click', async function () {
        var id = b.dataset.pid, act = b.dataset.act;
        if (act === 'delete' && !confirm('Delete this listing?')) return;
        b.disabled = true;
        try {
          if (act === 'sold') await RA.markProductSold(id); else if (act === 'delete') await RA.deleteProduct(id);
          MYPRODUCTS = await RA.myProducts(); renderMarketplace();
        } catch (e) { b.disabled = false; alert('Could not update: ' + (e.message || e)); }
      });
    });
  }
  function renderAdminReview() {
    var html = '<h1 class="acct-h1">Admin Review 🛡️</h1><p class="acct-sub">Approve or reject marketplace listings before they go public.</p>';
    if (!PENDING.length) { html += '<div class="acct-empty">🎉 Nothing pending review right now.</div>'; contentEl.innerHTML = html; return; }
    html += '<h2 class="acct-h2">Pending (' + PENDING.length + ')</h2>';
    PENDING.forEach(function (p) {
      var img = p.image_url ? RA.productImageUrl(p.image_url) : null;
      html += '<div class="acct-card mp-listing">' +
        '<div class="mp-listing-row">' +
          '<div class="mp-listing-thumb"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '>' + (img ? '' : '🛍️') + '</div>' +
          '<div class="mp-listing-main"><div class="mp-listing-title">' + esc(p.title) + '</div>' +
            '<div class="mp-listing-price">' + mpPriceHtml(p) + '</div>' +
            (p.description ? '<div class="mp-listing-reason">' + esc(p.description) + '</div>' : '') +
            '<div class="mp-listing-reason">📇 ' + esc(p.contact || '—') + ' · ' + esc(p.category || '—') + ' · ' + esc(p.location || '—') + '</div>' +
          '</div></div>' +
        '<div class="mp-listing-actions">' +
          '<button class="acct-btn acct-btn-solid mp-adm" data-act="approve" data-pid="' + p.id + '">Approve</button>' +
          '<button class="acct-btn acct-btn-danger mp-adm" data-act="reject" data-pid="' + p.id + '">Reject</button>' +
        '</div></div>';
    });
    contentEl.innerHTML = html;
    contentEl.querySelectorAll('.mp-adm').forEach(function (b) {
      b.addEventListener('click', async function () {
        var id = b.dataset.pid, act = b.dataset.act, reason = '';
        if (act === 'reject') { reason = prompt('Reason for rejection (optional, shown to the seller):') || ''; }
        b.disabled = true;
        try {
          if (act === 'approve') await RA.approveProduct(id); else await RA.rejectProduct(id, reason);
          PENDING = await RA.pendingProducts(); renderNav(); renderAdminReview();
        } catch (e) { b.disabled = false; alert('Action failed: ' + (e.message || e)); }
      });
    });
  }

  function evMonth(s) { if (!s) return ''; try { return ['January','February','March','April','May','June','July','August','September','October','November','December'][new Date(s + 'T00:00:00').getMonth()]; } catch (e) { return ''; } }
  function evDateLabel(start, st, et) { try { var d = new Date(start + 'T00:00:00'); var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]; var l = mo + ' ' + d.getDate() + ', ' + d.getFullYear(); if (st) l += ' · ' + st + (et ? '–' + et : ''); return l; } catch (e) { return start; } }
  function setEvMsg(t, ok) { var m = document.getElementById('evMsg'); if (m) m.innerHTML = t ? '<div style="padding:.6rem .85rem;border-radius:9px;margin:.6rem 0;font-size:.86rem;background:' + (ok ? '#eafaf1;color:#1e824c' : '#fdecea;color:#c0392b') + '">' + esc(t) + '</div>' : ''; }
  function eventFormHtml() {
    function f(id, label, type, ph) { return '<div class="acct-field"><div class="acct-label">' + label + '</div><input class="acct-input" id="' + id + '"' + (type ? ' type="' + type + '"' : '') + ' placeholder="' + (ph || '') + '"></div>'; }
    return '<div class="acct-card">' +
      f('ev-series', 'Event name / series', 'text', 'e.g. Language Across Borders') +
      '<div class="acct-2col">' + f('ev-start', 'Start date', 'date', '') + f('ev-end', 'End date (optional)', 'date', '') + '</div>' +
      '<div class="acct-2col">' + f('ev-stime', 'Start time', 'time', '') + f('ev-etime', 'End time', 'time', '') + '</div>' +
      '<div class="acct-2col">' + f('ev-city', 'City', 'text', 'e.g. Beijing') + f('ev-country', 'Country', 'text', 'e.g. China') + '</div>' +
      '<div class="acct-field"><div class="acct-label">Type</div><select class="acct-input" id="ev-type"><option>in-person</option><option>hybrid</option><option>online</option></select></div>' +
      f('ev-format', 'Format', 'text', 'e.g. Language Exchange, Workshop') +
      f('ev-langs', 'Languages (comma-separated)', 'text', 'e.g. Chinese, Arabic') +
      f('ev-fee', 'Entrance fee', 'text', 'e.g. Free, 50 SAR') +
      f('ev-venue', 'Venue', 'text', '') +
      '<div class="acct-field"><div class="acct-label">Overview</div><textarea class="acct-input" id="ev-overview" rows="3" placeholder="What is the event about?"></textarea></div>' +
      '<button class="acct-btn acct-btn-solid" id="evSubmit" style="width:100%">Submit for review</button>' +
      '<div style="font-size:.72rem;color:var(--asoft);text-align:center;margin-top:.5rem">🛡️ Reviewed by our team before it appears in the directory.</div></div>';
  }
  function wireEventForm() {
    document.getElementById('evSubmit').addEventListener('click', async function () {
      var series = document.getElementById('ev-series').value.trim();
      var start = document.getElementById('ev-start').value;
      if (!series) return setEvMsg('Please enter an event name.');
      if (!start) return setEvMsg('Please choose a start date.');
      var city = document.getElementById('ev-city').value.trim();
      var st = document.getElementById('ev-stime').value || null, et = document.getElementById('ev-etime').value || null;
      var data = {
        series: series, communities: [], type: document.getElementById('ev-type').value,
        format: document.getElementById('ev-format').value.trim() || 'Community Meetup',
        cities: city ? [city] : [], country: document.getElementById('ev-country').value.trim(),
        startDate: start, endDate: document.getElementById('ev-end').value || start, startTime: st, endTime: et,
        dateLabel: evDateLabel(start, st, et), month: evMonth(start),
        languages: document.getElementById('ev-langs').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
        supportingLanguages: ['English'], requirement: 'No Requirement', moderator: 'Optional', networking: 'Optional', rsvp: 'No',
        entranceFee: document.getElementById('ev-fee').value.trim() || 'Free', venue: document.getElementById('ev-venue').value.trim(),
        overview: document.getElementById('ev-overview').value.trim(), icon: 'network'
      };
      var btn = document.getElementById('evSubmit'); btn.disabled = true; var o = btn.textContent; btn.textContent = 'Submitting…';
      try { await RA.submitEvent(data); MYEVENTS = await RA.myEvents(); setEvMsg('✓ Submitted! It’s pending review and will appear in the directory once approved.', true); setTimeout(renderMyEvents, 1600); }
      catch (e) { btn.disabled = false; btn.textContent = o; setEvMsg(e.message || 'Could not submit the event.'); }
    });
  }
  function renderMyEvents() {
    var items = MYEVENTS || [];
    var live = items.filter(function (e) { return e.status === 'approved'; }).length;
    var pend = items.filter(function (e) { return e.status === 'pending'; }).length;
    var html = '<h1 class="acct-h1">Hosted Events</h1><p class="acct-sub">Submit events to the RealLingo directory — each is reviewed before going public.</p>';
    html += '<div class="acct-card"><div class="acct-stats">' +
      '<div class="acct-stat"><div class="acct-stat-num">' + live + '</div><div class="acct-stat-lbl">Live</div></div>' +
      '<div class="acct-stat"><div class="acct-stat-num">' + pend + '</div><div class="acct-stat-lbl">Pending</div></div>' +
      '<div class="acct-stat"><div class="acct-stat-num">' + items.length + '</div><div class="acct-stat-lbl">Total</div></div></div></div>';
    html += '<button class="acct-btn acct-btn-solid" id="evNewBtn" style="margin:1rem 0;display:inline-block">＋ Submit an event</button>';
    html += '<div id="evFormWrap" style="display:none"></div><div id="evMsg"></div>';
    if (items.length) {
      html += '<h2 class="acct-h2">Your submissions</h2>';
      items.forEach(function (e) {
        var d = e.data || {};
        html += '<div class="acct-card mp-listing"><div class="mp-listing-row"><div class="mp-listing-thumb">📅</div>' +
          '<div class="mp-listing-main"><div class="mp-listing-title">' + esc(e.title || d.series || 'Event') + '</div>' +
          '<div class="mp-listing-reason">' + esc(d.dateLabel || e.start_date || '') + ' · ' + esc((d.cities || []).join(', ')) + ' ' + esc(d.country || '') + '</div>' +
          mpStatusBadge(e.status) + (e.status === 'rejected' && e.reject_reason ? '<div class="mp-listing-reason">Rejected: ' + esc(e.reject_reason) + '</div>' : '') +
          '</div></div><div class="mp-listing-actions"><button class="acct-btn acct-btn-danger ev-del" data-id="' + e.id + '">Delete</button></div></div>';
      });
    }
    contentEl.innerHTML = html;
    document.getElementById('evNewBtn').addEventListener('click', function () {
      var w = document.getElementById('evFormWrap');
      if (w.style.display === 'none') { w.innerHTML = eventFormHtml(); w.style.display = 'block'; wireEventForm(); this.style.display = 'none'; }
    });
    contentEl.querySelectorAll('.ev-del').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Delete this event submission?')) return; b.disabled = true;
        try { await RA.deleteEvent(b.dataset.id); MYEVENTS = await RA.myEvents(); renderMyEvents(); } catch (e) { b.disabled = false; alert('Could not delete: ' + (e.message || e)); }
      });
    });
  }
  function renderEventReview() {
    var html = '<h1 class="acct-h1">Event Review 🗓️</h1><p class="acct-sub">Approve or reject event submissions before they appear in the public directory.</p>';
    if (!PENDING_EVENTS.length) { html += '<div class="acct-empty">🎉 No events pending review right now.</div>'; contentEl.innerHTML = html; return; }
    html += '<h2 class="acct-h2">Pending (' + PENDING_EVENTS.length + ')</h2>';
    PENDING_EVENTS.forEach(function (e) {
      var d = e.data || {};
      html += '<div class="acct-card mp-listing"><div class="mp-listing-row"><div class="mp-listing-thumb">📅</div>' +
        '<div class="mp-listing-main"><div class="mp-listing-title">' + esc(e.title || d.series) + '</div>' +
        '<div class="mp-listing-reason">' + esc(d.dateLabel || e.start_date || '') + ' · ' + esc((d.cities || []).join(', ')) + ' ' + esc(d.country || '') + '</div>' +
        (d.overview ? '<div class="mp-listing-reason">' + esc(d.overview) + '</div>' : '') +
        '<div class="mp-listing-reason">' + esc((d.languages || []).join(', ')) + ' · ' + esc(d.format || '') + ' · ' + esc(d.entranceFee || '') + ' · ' + esc(d.venue || '') + '</div>' +
        '</div></div><div class="mp-listing-actions"><button class="acct-btn acct-btn-solid ev-adm" data-act="approve" data-id="' + e.id + '">Approve</button>' +
        '<button class="acct-btn acct-btn-danger ev-adm" data-act="reject" data-id="' + e.id + '">Reject</button></div></div>';
    });
    contentEl.innerHTML = html;
    contentEl.querySelectorAll('.ev-adm').forEach(function (b) {
      b.addEventListener('click', async function () {
        var id = b.dataset.id, act = b.dataset.act, reason = '';
        if (act === 'reject') reason = prompt('Reason for rejection (optional, shown to the organizer):') || '';
        b.disabled = true;
        try { if (act === 'approve') await RA.approveEvent(id); else await RA.rejectEvent(id, reason); PENDING_EVENTS = await RA.pendingEvents(); renderNav(); renderEventReview(); }
        catch (e) { b.disabled = false; alert('Action failed: ' + (e.message || e)); }
      });
    });
  }

  function renderSettings() {
    var p = DATA.profile, np = p.notification_prefs || {};
    var html = '<h1 class="acct-h1">Settings</h1><p class="acct-sub">Manage your account.</p>';
    // Avatar
    html += '<div class="acct-card"><div class="acct-label">Profile picture</div><div style="display:flex;align-items:center;gap:1rem">' +
      '<img class="acct-hd-ava" src="' + esc(AVATAR) + '"' + (p.avatar_url ? '' : ' data-default="1"') + '>' +
      '<div class="acct-ava-actions"><button class="acct-btn" id="s-ava-up">' + (p.avatar_url ? 'Replace' : 'Upload') + ' photo</button>' +
      (p.avatar_url ? '<button class="acct-btn acct-btn-danger" id="s-ava-rm">Remove</button>' : '') + '</div></div></div>';
    // Username
    html += '<div class="acct-card"><div class="acct-msg" id="s-uname-msg"></div><div class="acct-label">Username</div>' +
      '<input class="acct-input" id="s-username" value="' + esc(p.username || '') + '" maxlength="20" autocomplete="off"><div class="acct-uname-status" id="s-uname-status"></div>' +
      '<div style="font-size:.72rem;color:var(--asoft);margin-top:.35rem">You can change your username up to twice a month.</div>' +
      '<button class="acct-btn acct-btn-solid" id="s-uname-save" style="margin-top:.4rem">Save username</button></div>';
    // Personal info
    html += '<div class="acct-card"><div class="acct-msg" id="s-basics-msg"></div>' +
      '<div class="acct-field"><div class="acct-label">Preferred name</div><input class="acct-input" id="s-name" value="' + esc(p.full_name || '') + '"></div>' +
      '<div class="acct-2col">' +
        '<div class="acct-field"><div class="acct-label">Country</div><select class="acct-select" id="s-country">' + countryOptions(p.country || '') + '</select></div>' +
        '<div class="acct-field"><div class="acct-label">City</div><input class="acct-input" id="s-city" value="' + esc(p.city || '') + '"></div>' +
      '</div>' +
      '<div class="acct-field"><div class="acct-label">Phone</div><input class="acct-input" id="s-phone" value="' + esc(p.phone || '') + '"></div>' +
      '<button class="acct-btn acct-btn-solid" id="s-basics-save">Save changes</button></div>';
    // Email
    html += '<div class="acct-card"><div class="acct-msg" id="s-email-msg"></div><div class="acct-label">Email</div><input class="acct-input" id="s-email" type="email" value="' + esc(p.email || '') + '">' +
      '<p style="font-size:.75rem;color:var(--asoft);margin:.45rem 0 .6rem">Changing your email sends a confirmation link to the new address.</p>' +
      '<button class="acct-btn acct-btn-solid" id="s-email-save">Update email</button></div>';
    // Password
    html += '<div class="acct-card"><div class="acct-msg" id="s-pass-msg"></div><div class="acct-label">New password</div><input class="acct-input" id="s-pass" type="password" placeholder="At least 8 characters">' +
      '<div class="acct-label" style="margin-top:.6rem">Confirm password</div><input class="acct-input" id="s-pass2" type="password">' +
      '<button class="acct-btn acct-btn-solid" id="s-pass-save" style="margin-top:.7rem">Update password</button></div>';
    // Notifications
    html += '<div class="acct-card"><div class="acct-msg" id="s-notif-msg"></div><div class="acct-label">Notification preferences</div>' +
      '<label class="acct-check"><input type="checkbox" id="s-np-product"' + (np.product ? ' checked' : '') + '> Product updates</label>' +
      '<label class="acct-check"><input type="checkbox" id="s-np-events"' + (np.events ? ' checked' : '') + '> Event reminders</label>' +
      '<label class="acct-check"><input type="checkbox" id="s-np-tips"' + (np.tips ? ' checked' : '') + '> Tips &amp; offers</label>' +
      '<button class="acct-btn acct-btn-solid" id="s-notif-save">Save preferences</button></div>';
    // Danger zone
    html += '<div class="acct-danger-zone"><h3>Delete account</h3><p>Permanently delete your account and all associated data. This cannot be undone.</p>' +
      '<div class="acct-msg" id="s-del-msg"></div><button class="acct-btn acct-btn-danger" id="s-del">Delete my account</button></div>';
    contentEl.innerHTML = html;
    wireSettings(p);
  }

  function setMsg(id, text, ok) { var el = document.getElementById(id); if (el) { el.textContent = text; el.className = 'acct-msg ' + (ok ? 'ok' : 'err'); } }

  function wireSettings(p) {
    document.getElementById('s-ava-up').addEventListener('click', function () { fileInput.click(); });
    var rm = document.getElementById('s-ava-rm');
    if (rm) rm.addEventListener('click', async function () { rm.disabled = true; try { await RA.removeAvatar(); await refresh('settings'); } catch (e) { rm.disabled = false; alert('Could not remove: ' + (e.message || e)); } });

    // username availability
    var unmeIn = document.getElementById('s-username'), t = null;
    unmeIn.addEventListener('input', function () {
      clearTimeout(t); var v = unmeIn.value.trim(), s = document.getElementById('s-uname-status');
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(v)) { s.textContent = v ? '3–20 letters, numbers, underscores' : ''; s.className = 'acct-uname-status bad'; return; }
      if (v.toLowerCase() === (p.username || '').toLowerCase()) { s.textContent = ''; s.className = 'acct-uname-status'; return; }
      s.textContent = 'Checking…'; s.className = 'acct-uname-status';
      t = setTimeout(function () { RA.usernameAvailable(v).then(function (ok) { if (unmeIn.value.trim() !== v) return; s.textContent = ok ? '✓ Available' : '✕ Taken'; s.className = 'acct-uname-status ' + (ok ? 'ok' : 'bad'); }).catch(function () { s.textContent = ''; }); }, 400);
    });
    document.getElementById('s-uname-save').addEventListener('click', async function () {
      var v = unmeIn.value.trim();
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(v)) return setMsg('s-uname-msg', 'Username must be 3–20 letters, numbers, or underscores.');
      if (v.toLowerCase() === (p.username || '').toLowerCase()) return setMsg('s-uname-msg', "That's already your username.");
      var days = unameDaysUntilAllowed(p.id);
      if (days > 0) return setMsg('s-uname-msg', 'You can change your username at most twice a month. Please try again in ' + days + ' day' + (days === 1 ? '' : 's') + '.');
      try { await RA.updateUsername(v); recordUnameChange(p.id); setMsg('s-uname-msg', 'Username updated.', true); await refresh('settings'); }
      catch (e) { setMsg('s-uname-msg', e.code === 'username_taken' ? 'That username is already taken.' : (e.message || 'Could not update.')); }
    });

    document.getElementById('s-basics-save').addEventListener('click', async function () {
      var country = document.getElementById('s-country').value;
      try {
        await RA.updateBasics({ full_name: document.getElementById('s-name').value.trim() || null, country: country || null, city: document.getElementById('s-city').value.trim() || null, phone: document.getElementById('s-phone').value.trim() || null, phone_country: country || null, phone_code: (typeof COUNTRY_DIAL_CODES !== 'undefined' ? COUNTRY_DIAL_CODES[country] : '') || null });
        setMsg('s-basics-msg', 'Saved.', true); await refresh('settings');
      } catch (e) { setMsg('s-basics-msg', e.message || 'Could not save.'); }
    });

    document.getElementById('s-email-save').addEventListener('click', async function () {
      var em = document.getElementById('s-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return setMsg('s-email-msg', 'Please enter a valid email.');
      try { await RA.updateEmail(em); setMsg('s-email-msg', 'Confirmation sent to the new address. It updates once confirmed.', true); }
      catch (e) { setMsg('s-email-msg', e.message || 'Could not update email.'); }
    });

    document.getElementById('s-pass-save').addEventListener('click', async function () {
      var p1 = document.getElementById('s-pass').value, p2 = document.getElementById('s-pass2').value;
      if (p1.length < 8) return setMsg('s-pass-msg', 'Password must be at least 8 characters.');
      if (p1 !== p2) return setMsg('s-pass-msg', 'Passwords do not match.');
      try { await RA.updatePassword(p1); setMsg('s-pass-msg', 'Password updated.', true); document.getElementById('s-pass').value = ''; document.getElementById('s-pass2').value = ''; }
      catch (e) { setMsg('s-pass-msg', e.message || 'Could not update password.'); }
    });

    document.getElementById('s-notif-save').addEventListener('click', async function () {
      try { await RA.updateNotificationPrefs({ product: document.getElementById('s-np-product').checked, events: document.getElementById('s-np-events').checked, tips: document.getElementById('s-np-tips').checked }); setMsg('s-notif-msg', 'Preferences saved.', true); await refresh('settings'); }
      catch (e) { setMsg('s-notif-msg', e.message || 'Could not save.'); }
    });

    document.getElementById('s-del').addEventListener('click', async function () {
      if (!window.confirm('Permanently delete your account and all your data? This cannot be undone.')) return;
      var btn = this; btn.disabled = true; btn.textContent = 'Deleting…';
      try { await RA.deleteAccount(); window.location.href = ROOT(); }
      catch (e) { btn.disabled = false; btn.textContent = 'Delete my account'; setMsg('s-del-msg', e.message || 'Could not delete account.'); }
    });
  }

  async function onAvatarFile() {
    var f = fileInput.files && fileInput.files[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) { alert('Image must be under 2 MB.'); fileInput.value = ''; return; }
    try { await RA.uploadAvatar(f); await refresh('settings'); } catch (e) { alert('Upload failed: ' + (e.message || e)); }
    fileInput.value = '';
  }

  async function refresh(section) { await ensureData(); renderHeader(); paint(section || CURRENT); }

  function doLogout() { RA.signOut().catch(function () {}).then(function () { window.location.href = ROOT(); }); }

  async function open(mountEl) {
    build(mountEl); show();
    // deep-link: /dashboard/?s=cart opens that section directly
    try {
      var _s = new URLSearchParams(location.search).get('s');
      var _valid = ['dashboard','roles','saved','calendar','cart','marketplace','applications','settings','myevents','adminreview','eventreview'];
      if (_s && _valid.indexOf(_s) >= 0) CURRENT = _s;
    } catch (e) {}
    contentEl.innerHTML = '<div class="acct-loading">Loading your account…</div>';
    if (typeof RA === 'undefined') { contentEl.innerHTML = '<div class="acct-loading">Account tools failed to load. Please reload.</div>'; return; }
    try {
      var user = await RA.getUser();
      if (!user) { window.location.href = ROOT() + 'login/'; return; }
      try { await RA.flushPending(); } catch (e) {}
      await ensureData();
      if (!DATA || !DATA.profile) {
        renderHeader(); renderNav();
        contentEl.innerHTML = '<h1 class="acct-h1">Almost there</h1><div class="acct-empty">Your profile isn\'t set up yet. <a class="acct-role-cta" href="' + ROOT() + 'signup/user/">Finish onboarding →</a></div>';
        return;
      }
      renderHeader(); renderNav(); paint(CURRENT);
    } catch (e) { console.error(e); contentEl.innerHTML = '<div class="acct-loading">Something went wrong. Please reload.</div>'; }
  }

  window.openAccountDrawer = open;
  // Render the account panel inline on a page (docked mode) instead of as a
  // slide-over overlay. Pass the container element to mount into.
  window.openAccountPage = function (mountEl) { return open(mountEl); };

  /* ── Global Event Calendar: a slide-down panel that reuses the SAME calendar
     rendered in the drawer (renderCalendar targets calPanelBody instead of the
     drawer content). Opened from the header icon via window.openEventCalendar(). */
  var calPanel, calPanelBody, calPanelOverlay, _calPanelPrevFocus;
  function buildCalPanel() {
    if (calPanel) return;
    calPanelOverlay = document.createElement('div'); calPanelOverlay.className = 'calpanel-overlay';
    calPanel = document.createElement('section'); calPanel.className = 'calpanel';
    calPanel.setAttribute('role', 'dialog'); calPanel.setAttribute('aria-modal', 'true'); calPanel.setAttribute('aria-label', 'Event Calendar');
    calPanel.innerHTML =
      '<div class="calpanel-hd"><h2 class="calpanel-title">Event Calendar</h2>' +
      '<button class="calpanel-close" aria-label="Close calendar">&times;</button></div>' +
      '<div class="calpanel-body" id="calPanelBody"></div>';
    document.body.appendChild(calPanelOverlay); document.body.appendChild(calPanel);
    calPanelBody = calPanel.querySelector('#calPanelBody');
    calPanelOverlay.addEventListener('click', closeCalPanel);
    calPanel.querySelector('.calpanel-close').addEventListener('click', closeCalPanel);
  }
  function calPanelKeydown(e) {
    if (e.key === 'Escape') { closeCalPanel(); return; }
    if (e.key === 'Tab' && calPanel) {   // simple focus trap
      var f = calPanel.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function closeCalPanel() {
    if (!calPanel) return;
    calPanelOverlay.classList.remove('open'); calPanel.classList.remove('open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', calPanelKeydown);
    if (_calPanelPrevFocus && _calPanelPrevFocus.focus) { try { _calPanelPrevFocus.focus(); } catch (e) {} }
  }
  window.closeEventCalendar = closeCalPanel;
  window.openEventCalendar = async function () {
    if (typeof RA === 'undefined') { window.location.href = ROOT() + 'dashboard/'; return; }
    buildCalPanel();
    calPanelBody.innerHTML = '<div class="acct-loading">Loading your calendar…</div>';
    _calPanelPrevFocus = document.activeElement;
    calPanelOverlay.classList.add('open'); calPanel.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', calPanelKeydown);
    try {
      if (!DATA) { await ensureData(); }                 // first open → load profile + saved
      else { try { SAVED = await RA.loadSaved(); } catch (e) {} }   // keep in sync with the drawer
    } catch (e) { console.error('calendar data load failed', e); }
    CAL.detail = null;
    renderCalendar(calPanelBody);                         // SAME calendar, targeting the panel
    var closeBtn = calPanel.querySelector('.calpanel-close'); if (closeBtn) closeBtn.focus();
  };
})();
