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
    { key: 'applications', label: 'Applications', icon: '📄' },
    { key: 'saved', label: 'Saved', icon: '❤️' },
    { key: 'calendar', label: 'Calendar', icon: '📅' },
    { key: 'settings', label: 'Settings', icon: '⚙️' }
  ];
  var CAL = { view: 'month', ref: null, detail: null };  // calendar state

  var built = false, DATA = null, SAVED = [], AVATAR = null, CURRENT = 'dashboard';
  var overlay, drawer, hdEl, navEl, contentEl, fileInput;

  function build() {
    if (built) return; built = true;
    overlay = document.createElement('div'); overlay.className = 'acct-overlay';
    drawer = document.createElement('aside'); drawer.className = 'acct-drawer'; drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true');
    drawer.innerHTML =
      '<div class="acct-hd" id="acctHd"></div>' +
      '<div class="acct-main"><nav class="acct-nav" id="acctNav"></nav><div class="acct-content" id="acctContent"></div></div>';
    fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif'; fileInput.style.display = 'none';
    document.body.appendChild(overlay); document.body.appendChild(drawer); document.body.appendChild(fileInput);
    hdEl = drawer.querySelector('#acctHd'); navEl = drawer.querySelector('#acctNav'); contentEl = drawer.querySelector('#acctContent');

    overlay.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('open')) close(); });
    fileInput.addEventListener('change', onAvatarFile);
  }

  function show() { overlay.classList.add('open'); drawer.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function close() { overlay.classList.remove('open'); drawer.classList.remove('open'); document.body.style.overflow = ''; }

  async function ensureData() {
    DATA = await RA.loadProfile();
    try { SAVED = await RA.loadSaved(); } catch (e) { SAVED = []; }
    var p = DATA && DATA.profile;
    AVATAR = (p && p.avatar_url) ? await RA.avatarPublicUrl(p.avatar_url) : (ROOT() + 'assets/img/logo-yellow.png');
  }

  function firstName(p) { return ((p && p.full_name || '').trim().split(/\s+/)[0]) || (p && p.username) || 'there'; }

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
    navEl.innerHTML = NAV.map(function (it) {
      return '<button class="acct-nav-item' + (it.key === CURRENT ? ' active' : '') + '" data-nav="' + it.key + '"><span class="acct-nav-lbl">' + it.label + '</span></button>';
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
    if (section === 'calendar') return renderCalendar();
    if (section === 'settings') return renderSettings();
  }

  function renderDashboard() {
    var p = DATA.profile, pct = completion(p, DATA.languages, DATA.roles);
    var html = '<h1 class="acct-h1">Welcome back, ' + esc(firstName(p)) + '!</h1><p class="acct-sub">Your RealLingo control center.</p>';
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
      : '<div class="acct-empty">No roles yet. <a class="acct-role-cta" href="' + ROOT() + 'signup/' + esc(p.onboarding_flow || 'all') + '/?edit=1">Add roles →</a></div>';
    html += '<h2 class="acct-h2">Languages</h2><div class="acct-card">' + esc(formatLanguages(DATA.languages)) + '</div>';
    html += '<h2 class="acct-h2">Contact</h2><div class="acct-card">' +
      '<div class="acct-row"><span class="acct-row-lbl">Email</span><span class="acct-row-val">' + esc(p.email || '—') + '</span></div>' +
      '<div class="acct-row"><span class="acct-row-lbl">Location</span><span class="acct-row-val">' + esc([p.city, p.country].filter(Boolean).join(', ') || '—') + '</span></div>' +
      '<div class="acct-row"><span class="acct-row-lbl">Member since</span><span class="acct-row-val">' + memberSince(p.created_at) + '</span></div></div>';
    contentEl.innerHTML = html;
  }

  function renderRoles() {
    var p = DATA.profile;
    if (!DATA.roles.length) { contentEl.innerHTML = '<h1 class="acct-h1">My Roles</h1><div class="acct-empty">No roles selected yet. <a class="acct-role-cta" href="' + ROOT() + 'signup/' + esc(p.onboarding_flow || 'all') + '/?edit=1">Add roles →</a></div>'; return; }
    var html = '<h1 class="acct-h1">My Roles</h1><p class="acct-sub">Tap a role to see its details.</p>';
    DATA.roles.forEach(function (rr) {
      var r = rr.role_key, m = ROLE_META[r] || {}, detail = DATA.roleDetails[r], rows = (detail && detail.details && detail.details.display_rows) || [];
      var preview = rows.slice(0, 2).map(function (x) { return x.v; }).join(' · ') || 'No details yet';
      html += '<div class="acct-card acct-clickable acct-role-card" data-role="' + r + '">' +
        '<div class="acct-role-hd"><span class="acct-role-ico">' + (m.icon || '⭐') + '</span><span class="acct-role-title">' + esc(m.label || r) + '</span></div>' +
        '<div class="acct-role-preview">' + esc(preview) + '</div>' +
        '<div class="acct-role-detail" style="display:none">' +
          rows.map(function (x) { return '<div class="acct-row"><span class="acct-row-lbl">' + esc(x.l) + '</span><span class="acct-row-val">' + esc(x.v) + '</span></div>'; }).join('') +
          '<div style="margin-top:.8rem"><a class="acct-btn acct-btn-solid" href="' + ROOT() + 'signup/' + esc(p.onboarding_flow || 'all') + '/?edit=1">Edit in full editor →</a></div>' +
        '</div>' +
        '<div class="acct-role-cta acct-role-toggle">View details →</div>' +
      '</div>';
    });
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
    var html = '<h1 class="acct-h1">Applications</h1>';
    if (!DATA.applications.length) { html += '<div class="acct-empty">No applications yet. Scholarship, partner, and event applications will appear here.</div>'; }
    else html += DATA.applications.map(function (a) {
      return '<div class="acct-card"><div style="font-weight:700;text-transform:capitalize">' + esc(a.type) + ' application</div>' +
        '<div style="color:var(--asoft);font-size:.8rem;margin-top:.2rem">' + memberSince(a.created_at) + '</div>' +
        '<span class="acct-chip" style="margin-top:.6rem">' + esc(a.status || 'submitted') + '</span></div>';
    }).join('');
    contentEl.innerHTML = html;
  }

  function renderSaved() {
    var html = '<h1 class="acct-h1">Saved</h1>';
    if (!SAVED.length) { html += '<div class="acct-empty">Nothing saved yet. Save events and resources to find them here.</div>'; }
    else html += SAVED.map(function (s) {
      return '<div class="acct-card acct-clickable">' + (s.url ? '<a href="' + esc(s.url) + '" style="text-decoration:none;color:inherit">' : '') +
        '<div style="font-weight:700">' + esc(s.title || s.item_ref) + '</div><div style="color:var(--asoft);font-size:.8rem;margin-top:.2rem;text-transform:capitalize">' + esc(s.item_type) + '</div>' +
        (s.url ? '</a>' : '') + '</div>';
    }).join('');
    contentEl.innerHTML = html;
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

  function renderCalendar() {
    if (!CAL.ref) CAL.ref = new Date();
    if (CAL.detail) return renderEventDetail(CAL.detail);
    var events = calEvents();
    if (!events.length) {
      contentEl.innerHTML =
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
    contentEl.innerHTML = html;
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
        row('Venue', d.venue)+
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
      '<div class="cal-detail-actions">'+
        '<a class="acct-btn acct-btn-solid" href="'+esc((ev.saved && ev.saved.url) || (ROOT()+'eventpartners/'))+'">View Event</a>'+
        '<button class="acct-btn acct-btn-danger" data-cal="remove" data-ref="'+esc(ev.ref)+'">Remove from Saved</button>'+
      '</div>'+
      '<div class="cal-detail-actions"><button class="acct-btn" disabled>Add reminder (soon)</button><button class="acct-btn" disabled>Share (soon)</button></div>';
    contentEl.innerHTML = html;
    contentEl.querySelector('[data-cal="back"]').addEventListener('click', function(){ CAL.detail=null; renderCalendar(); });
    var rm=contentEl.querySelector('[data-cal="remove"]');
    if(rm) rm.addEventListener('click', async function(){
      rm.disabled=true;
      try { await RA.unsaveItem('event', ev.ref); SAVED = SAVED.filter(function(s){return !(s.item_type==='event'&&s.item_ref===ev.ref);}); CAL.detail=null; renderCalendar(); }
      catch(e){ rm.disabled=false; alert('Could not remove: '+(e.message||e)); }
    });
  }

  function wireCalendar(){
    contentEl.querySelectorAll('[data-cal]').forEach(function(b){
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
    contentEl.querySelectorAll('.cal-view-btn').forEach(function(b){
      b.addEventListener('click', function(){ CAL.view=b.dataset.view; renderCalendar(); });
    });
    contentEl.querySelectorAll('[data-ev]').forEach(function(b){
      b.addEventListener('click', function(e){ e.stopPropagation(); CAL.detail=b.dataset.ev; renderEventDetail(b.dataset.ev); });
    });
    // clicking a month day cell (not on an event) → jump to that day
    contentEl.querySelectorAll('.cal-cell[data-day]').forEach(function(c){
      c.addEventListener('click', function(){ var p=c.dataset.day.split('-'); CAL.ref=new Date(+p[0],+p[1]-1,+p[2]); CAL.view='day'; renderCalendar(); });
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
      '<button class="acct-btn acct-btn-solid" id="s-uname-save" style="margin-top:.4rem">Save username</button></div>';
    // Personal info
    html += '<div class="acct-card"><div class="acct-msg" id="s-basics-msg"></div><div class="acct-label">Full name</div><input class="acct-input" id="s-name" value="' + esc(p.full_name || '') + '">' +
      '<div class="acct-label" style="margin-top:.6rem">Country</div><select class="acct-select" id="s-country">' + countryOptions(p.country || '') + '</select>' +
      '<div class="acct-label" style="margin-top:.6rem">City</div><input class="acct-input" id="s-city" value="' + esc(p.city || '') + '">' +
      '<div class="acct-label" style="margin-top:.6rem">Phone</div><input class="acct-input" id="s-phone" value="' + esc(p.phone || '') + '">' +
      '<button class="acct-btn acct-btn-solid" id="s-basics-save" style="margin-top:.7rem">Save changes</button></div>';
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
      try { await RA.updateUsername(v); setMsg('s-uname-msg', 'Username updated.', true); await refresh('settings'); }
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

  async function open() {
    build(); show();
    contentEl.innerHTML = '<div class="acct-loading">Loading your account…</div>';
    if (typeof RA === 'undefined') { contentEl.innerHTML = '<div class="acct-loading">Account tools failed to load. Please reload.</div>'; return; }
    try {
      var user = await RA.getUser();
      if (!user) { window.location.href = ROOT() + 'login/'; return; }
      try { await RA.flushPending(); } catch (e) {}
      await ensureData();
      if (!DATA || !DATA.profile) {
        renderHeader(); renderNav();
        contentEl.innerHTML = '<h1 class="acct-h1">Almost there</h1><div class="acct-empty">Your profile isn\'t set up yet. <a class="acct-role-cta" href="' + ROOT() + 'signup/">Finish onboarding →</a></div>';
        return;
      }
      renderHeader(); renderNav(); paint(CURRENT);
    } catch (e) { console.error(e); contentEl.innerHTML = '<div class="acct-loading">Something went wrong. Please reload.</div>'; }
  }

  window.openAccountDrawer = open;
})();
