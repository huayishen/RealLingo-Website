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
    { key: 'settings', label: 'Settings', icon: '⚙️' }
  ];

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
      return '<button class="acct-nav-item' + (it.key === CURRENT ? ' active' : '') + '" data-nav="' + it.key + '"><span class="acct-nav-ico">' + it.icon + '</span><span class="acct-nav-lbl">' + it.label + '</span></button>';
    }).join('') + '<button class="acct-nav-item acct-nav-logout" data-nav="__logout"><span class="acct-nav-ico">🚪</span><span class="acct-nav-lbl">Log Out</span></button>';
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
