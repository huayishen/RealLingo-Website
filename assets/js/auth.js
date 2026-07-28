/* ════════════════════════════════════════════════════════════
   RealLingo — Auth + Profile layer (client-side Supabase)

   Requires assets/js/supabase-client.js to be loaded first
   (it exposes window.getSupabaseClient — one shared client/session).

   Exposes a single global: window.RA
   - Auth:     signUp, signIn, signOut, getUser, getSession, onAuth,
               resetPassword, updatePassword, requireAuth
   - Username: usernameAvailable
   - Avatar:   uploadAvatar, removeAvatar, avatarPublicUrl
   - Onboard:  stashPending, getPending, clearPending, flushPending
   - Profile:  saveProfile (formData => normalized tables), loadProfile

   Security note: every table is protected by RLS (auth.uid() = owner),
   so these helpers can only ever touch the signed-in user's own rows.
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function client() {
    if (typeof window.getSupabaseClient !== 'function') {
      throw new Error('supabase-client.js must load before auth.js');
    }
    return window.getSupabaseClient();
  }

  // ── localStorage keys ─────────────────────────────────────
  const K_PENDING = 'ra_pending_profile';   // profile stash awaiting a session (email round-trip)
  const K_EMAIL   = 'ra_pending_email';      // email awaiting verification (verify page)
  const K_REMEMBER = 'ra_remember';          // '1' | '0'
  const S_SEEN    = 'ra_session_seen';        // sessionStorage marker for remember-me

  // ── Role → table mapping (hybrid: typed cols + details jsonb) ──
  const ROLE_TABLE = {
    learner:        { table: 'learner_profiles',         cat: 'personal',     cols: { currency: 'learnerCurrency', budget_min: 'learnerBudMin', budget_max: 'learnerBudMax', note: 'learnerNote' },
                      detailKeys: ['learnerLanguages','learnerPurpose','learnerPurposeOther','learnerLooking','learnerLookingOther','learnerBudgetTypes','learnerPeriodSpec'] },
    traveler:       { table: 'traveler_profiles',        cat: 'personal',     cols: { currency: 'travelCurrency', budget_min: 'travelBudMin', budget_max: 'travelBudMax', trip_start: 'tripStart', trip_end: 'tripEnd', note: 'travelNote' },
                      detailKeys: ['travelCountries','travelBudgetTypes','travelPeriodSpec'] },
    eventMember:    { table: 'event_member_profiles',    cat: 'personal',     cols: {},
                      detailKeys: ['memberAvailability','memberInterests','memberInterestsOther','partnerMember','partnerCommunities','partnerCommunityOther','memberLangInterest','memberLangInterestOther'] },
    tutor:          { table: 'tutor_profiles',           cat: 'professional', cols: { mode: 'tutorMode', currency: 'tutorCurrency', rate_min: 'tutorRateMin', rate_max: 'tutorRateMax', note: 'tutorNote' },
                      detailKeys: ['tutorLanguages','tutorStudentLevels','tutorChargeTypes','tutorPeriodSpec'] },
    translator:     { table: 'translator_profiles',      cat: 'professional', cols: { currency: 'transCurrency', rate_min: 'transRateMin', rate_max: 'transRateMax', note: 'transNote' },
                      detailKeys: ['langPairs','transSpecializations','transSpecializationsOther','transAvailability','transProvides','transChargeTypes','transPeriodSpec'] },
    tourGuide:      { table: 'tour_guide_profiles',      cat: 'professional', cols: { currency: 'tourCurrency', rate_min: 'tourRateMin', rate_max: 'tourRateMax', note: 'tourNote' },
                      detailKeys: ['tourCountries','tourChargeTypes','tourPeriodSpec'] },
    influencer:     { table: 'influencer_profiles',      cat: 'professional', cols: { experience: 'inflExperience' },
                      detailKeys: ['platforms','inflOpenTo'] },
    languageTalent: { table: 'language_talent_profiles', cat: 'professional', cols: { currency: 'talentCurrency', salary_min: 'talentSalMin', salary_max: 'talentSalMax' },
                      detailKeys: ['talentIndustries'] },
    languageEvent:  { table: 'language_event_profiles',  cat: 'professional', cols: { country: 'eventCountry' },
                      detailKeys: ['eventLanguages'] }
  };
  const HIRE_TARGET = { hireTranslator: 'translator', hireInfluencer: 'influencer', hireLanguageEvent: 'languageEvent', hireLanguageTalent: 'languageTalent' };
  const HIRE_CAT = 'hire';

  const NUM_COLS  = new Set(['budget_min','budget_max','rate_min','rate_max','salary_min','salary_max']);
  const DATE_COLS = new Set(['trip_start','trip_end']);

  function numOrNull(v) { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; }
  function coerce(col, v) {
    if (NUM_COLS.has(col)) return numOrNull(v);
    if (DATE_COLS.has(col)) return v || null;
    return (v === undefined || v === '') ? null : v;
  }
  function categoryOf(r) { return HIRE_TARGET[r] ? HIRE_CAT : (ROLE_TABLE[r] ? ROLE_TABLE[r].cat : null); }
  function pick(obj, keys) { const o = {}; keys.forEach(k => { o[k] = obj[k]; }); return o; }

  function flattenLanguages(uid, langs) {
    const rows = [];
    if (!langs) return rows;
    for (const [lang, val] of Object.entries(langs)) {
      if (val && typeof val === 'object') {
        for (const [variant, level] of Object.entries(val)) { if (level) rows.push({ user_id: uid, language: lang, variant: variant, level: level }); }
      } else if (val) {
        rows.push({ user_id: uid, language: lang, variant: null, level: val });
      }
    }
    return rows;
  }

  // ── Remember-me enforcement ──────────────────────────────
  // If the user did NOT tick "Remember me", drop the session when the
  // browser session ends (sessionStorage clears on full browser close).
  async function enforceRemember() {
    try {
      if (localStorage.getItem(K_REMEMBER) === '0' && !sessionStorage.getItem(S_SEEN)) {
        const sb = await client();
        await sb.auth.signOut();
      }
    } catch (e) { /* ignore */ }
    try { sessionStorage.setItem(S_SEEN, '1'); } catch (e) {}
  }

  // ── Auth ─────────────────────────────────────────────────
  async function signUp(email, password, emailRedirectTo) {
    const sb = await client();
    const { data, error } = await sb.auth.signUp({ email: email, password: password, options: { emailRedirectTo: emailRedirectTo } });
    if (error) throw error;
    return data; // data.session is null when email confirmation is required
  }
  async function signIn(email, password, remember) {
    try { localStorage.setItem(K_REMEMBER, remember ? '1' : '0'); sessionStorage.setItem(S_SEEN, '1'); } catch (e) {}
    const sb = await client();
    const { data, error } = await sb.auth.signInWithPassword({ email: email, password: password });
    if (error) throw error;
    return data;
  }
  async function signOut() {
    const sb = await client();
    await sb.auth.signOut();
    try { localStorage.removeItem(K_REMEMBER); localStorage.removeItem(K_PENDING); localStorage.removeItem(K_EMAIL); } catch (e) {}
  }
  async function getUser()    { const sb = await client(); const { data } = await sb.auth.getUser();    return data ? data.user : null; }
  async function getSession() { const sb = await client(); const { data } = await sb.auth.getSession(); return data ? data.session : null; }
  async function onAuth(cb)   { const sb = await client(); return sb.auth.onAuthStateChange(cb); }
  async function resetPassword(email, redirectTo) { const sb = await client(); const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo }); if (error) throw error; }
  async function updatePassword(newPw) { const sb = await client(); const { error } = await sb.auth.updateUser({ password: newPw }); if (error) throw error; }
  async function requireAuth(loginUrl) {
    await enforceRemember();
    const session = await getSession();
    if (!session) { window.location.href = loginUrl; return null; }
    return session.user;
  }

  // ── Username ─────────────────────────────────────────────
  async function usernameAvailable(u) {
    const sb = await client();
    const { data, error } = await sb.rpc('username_available', { candidate: u });
    if (error) throw error;
    return !!data;
  }

  // ── Avatars ──────────────────────────────────────────────
  function randId() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + '-' + Math.round(Math.random() * 1e9)); }
  // NOTE: this supabase-js build does not reliably attach the signed-in user's
  // token to Storage requests (it falls back to the publishable key, so the
  // owner-only RLS policy sees a null auth.uid()). We therefore do authenticated
  // Storage writes/deletes with a raw fetch carrying an explicit Bearer token.
  // Public reads (getPublicUrl) are plain URL construction and need no token.
  async function sessionOrThrow() {
    const sb = await client();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    return { sb, session };
  }
  // A persisted access token is sometimes rejected by Storage even when it
  // looks valid; a freshly refreshed token works. So on 401/403 we refresh
  // once and retry.
  async function rawStorageFetch(method, path, body, contentType) {
    const { sb, session } = await sessionOrThrow();
    const cfg = window.SUPABASE_CONFIG;
    const send = (tok) => {
      // NOTE: no x-upsert — we always write a unique path, and upsert makes
      // Storage evaluate RLS via the UPDATE path, which fails the owner check.
      const headers = { apikey: cfg.key, Authorization: 'Bearer ' + tok };
      if (method === 'POST') { headers['Content-Type'] = contentType || 'application/octet-stream'; }
      return fetch(cfg.url + '/storage/v1/object/avatars/' + path, { method: method, headers: headers, body: body });
    };
    // This supabase-js build intermittently sends Storage a token it briefly
    // won't accept (a background-refresh race; HTTP 400 w/ body statusCode 403).
    // Retry a few times, refreshing the token and waiting a beat between tries.
    let token = session.access_token;
    let resp = await send(token);
    for (let attempt = 0; attempt < 3 && !resp.ok; attempt++) {
      try { const r = await sb.auth.refreshSession(); if (r && r.data && r.data.session) token = r.data.session.access_token; } catch (e) {}
      await new Promise(res => setTimeout(res, 500 + attempt * 500));
      resp = await send(token);
    }
    return resp;
  }
  async function rawStoragePut(path, body, contentType) {
    const resp = await rawStorageFetch('POST', path, body, contentType);
    if (!resp.ok) throw new Error('Upload failed (' + resp.status + '): ' + (await resp.text()));
  }
  async function uploadAvatar(file) {
    const { sb, session } = await sessionOrThrow();
    const uid = session.user.id;
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = uid + '/' + randId() + '.' + ext;
    await rawStoragePut(path, file, file.type || undefined);
    const { error } = await sb.from('profiles').update({ avatar_url: path }).eq('id', uid);
    if (error) throw error;
    return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  }
  async function uploadAvatarDataUrl(dataUrl, uid) {
    const res = await fetch(dataUrl); const blob = await res.blob();
    const ext = (blob.type.split('/')[1] || 'png');
    const path = uid + '/' + randId() + '.' + ext;
    await rawStoragePut(path, blob, blob.type);
    const sb = await client();
    await sb.from('profiles').update({ avatar_url: path }).eq('id', uid);
    return path;
  }
  async function removeAvatar() {
    const { sb, session } = await sessionOrThrow();
    const uid = session.user.id;
    const { data: prof } = await sb.from('profiles').select('avatar_url').eq('id', uid).maybeSingle();
    if (prof && prof.avatar_url) {
      await rawStorageFetch('DELETE', prof.avatar_url);
    }
    await sb.from('profiles').update({ avatar_url: null }).eq('id', uid);
  }
  async function avatarPublicUrl(path) {
    if (!path) return null;
    const sb = await client();
    return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  }

  // ── Onboarding stash (survives the email round-trip) ─────
  function stashPending(p) {
    try {
      localStorage.setItem(K_PENDING, JSON.stringify(p));
      if (p && p.email) localStorage.setItem(K_EMAIL, p.email);
    } catch (e) { console.error('stashPending failed', e); }
  }
  function getPending() { try { return JSON.parse(localStorage.getItem(K_PENDING) || 'null'); } catch (e) { return null; } }
  function clearPending() { try { localStorage.removeItem(K_PENDING); } catch (e) {} }
  async function flushPending() {
    const p = getPending();
    if (!p) return { flushed: false, reason: 'no-pending' };
    const session = await getSession();
    if (!session) return { flushed: false, reason: 'no-session' };
    await saveProfile(p);
    clearPending();
    return { flushed: true };
  }

  // ── Profile mapper: formData => normalized tables ────────
  async function saveProfile(pending) {
    const sb = await client();
    const user = await getUser();
    if (!user) throw new Error('Not authenticated');
    const uid = user.id;
    const fd = pending.formData || {};
    const roles = pending.roles || [];
    const roleRows = pending.roleRows || {};

    // Guard: username taken by someone else (unique constraint would also catch it)
    const desiredUsername = pending.username || fd.username || null;
    if (desiredUsername) {
      const ok = await usernameAvailable(desiredUsername).catch(() => true);
      // ok===false means it exists; allow if it's already THIS user's username
      if (!ok) {
        const { data: mine } = await sb.from('profiles').select('username').eq('id', uid).maybeSingle();
        if (!mine || String(mine.username).toLowerCase() !== String(desiredUsername).toLowerCase()) {
          const err = new Error('That username is already taken. Please choose another.');
          err.code = 'username_taken';
          throw err;
        }
      }
    }

    // 1. profiles (upsert)
    const profileRow = {
      id: uid,
      username: desiredUsername,
      full_name: fd.name || null,
      email: user.email || fd.email || null,
      phone: fd.phone ? (String(fd.phoneCode || '') + ' ' + fd.phone).trim() : null,
      phone_country: fd.phoneCountry || null,
      phone_code: fd.phoneCode || null,
      country: fd.country || null,
      city: fd.city || null,
      hiring_as: fd.hiringAs || null,
      company_name: fd.companyName || null,
      company_industry: fd.companyIndustry || null,
      qualifications: fd.qualifications || null,
      other_role: fd.otherRole || null,
      onboarding_flow: pending.flow || null,
      onboarding_complete: true
    };
    { const { error } = await sb.from('profiles').upsert(profileRow, { onConflict: 'id' }); if (error) throw error; }

    // 1b. avatar chosen during review (base64 data URL) => upload to Storage
    if (fd.avatarDataUrl && String(fd.avatarDataUrl).startsWith('data:')) {
      try { await uploadAvatarDataUrl(fd.avatarDataUrl, uid); } catch (e) { console.error('avatar upload failed', e); }
    }

    // 2. languages (replace)
    await sb.from('profile_languages').delete().eq('user_id', uid);
    const langRows = flattenLanguages(uid, fd.languages);
    if (langRows.length) { const { error } = await sb.from('profile_languages').insert(langRows); if (error) throw error; }

    // 3. roles (replace)
    await sb.from('profile_roles').delete().eq('user_id', uid);
    const prRows = roles.map(r => ({ user_id: uid, role_key: r, category: categoryOf(r) }));
    if (prRows.length) { const { error } = await sb.from('profile_roles').insert(prRows); if (error) throw error; }

    // 4. per-role detail tables
    await sb.from('hire_requests').delete().eq('user_id', uid);
    for (const r of roles) {
      const disp = roleRows[r] || [];
      if (HIRE_TARGET[r]) {
        const p = r; // dynamic prefix in formData, e.g. 'hireTranslator'
        const row = {
          user_id: uid, target_role: HIRE_TARGET[r],
          currency: fd[p + 'Currency'] || null,
          budget_min: numOrNull(fd[p + 'BudMin']), budget_max: numOrNull(fd[p + 'BudMax']),
          note: fd[p + 'Note'] || null,
          details: { languages: fd[p + 'Languages'] || [], budgetTypes: fd[p + 'BudgetTypes'] || [], periodSpec: fd[p + 'PeriodSpec'] || '', useShared: !!fd[p + 'UseShared'], display_rows: disp }
        };
        const { error } = await sb.from('hire_requests').upsert(row, { onConflict: 'user_id,target_role' }); if (error) throw error;
      } else if (ROLE_TABLE[r]) {
        const cfg = ROLE_TABLE[r];
        const row = { user_id: uid };
        for (const [dbCol, fdKey] of Object.entries(cfg.cols)) row[dbCol] = coerce(dbCol, fd[fdKey]);
        const details = pick(fd, cfg.detailKeys);
        details.display_rows = disp;
        row.details = details;
        const { error } = await sb.from(cfg.table).upsert(row, { onConflict: 'user_id' }); if (error) throw error;
      }
    }

    // 5. clean up detail rows for de-selected roles (matters on re-save/edit)
    for (const [r, cfg] of Object.entries(ROLE_TABLE)) {
      if (!roles.includes(r)) { await sb.from(cfg.table).delete().eq('user_id', uid); }
    }

    return { ok: true };
  }

  // ── Load everything for the dashboard ────────────────────
  async function loadProfile() {
    const sb = await client();
    const user = await getUser();
    if (!user) return null;
    const uid = user.id;
    const [pRes, lRes, rRes, aRes] = await Promise.all([
      sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
      sb.from('profile_languages').select('*').eq('user_id', uid),
      sb.from('profile_roles').select('*').eq('user_id', uid).order('created_at', { ascending: true }),
      sb.from('applications').select('*').eq('user_id', uid).order('created_at', { ascending: false })
    ]);
    const roles = rRes.data || [];
    const roleDetails = {};
    for (const rr of roles) {
      const r = rr.role_key;
      if (HIRE_TARGET[r]) {
        const { data } = await sb.from('hire_requests').select('*').eq('user_id', uid).eq('target_role', HIRE_TARGET[r]).maybeSingle();
        roleDetails[r] = data;
      } else if (ROLE_TABLE[r]) {
        const { data } = await sb.from(ROLE_TABLE[r].table).select('*').eq('user_id', uid).maybeSingle();
        roleDetails[r] = data;
      }
    }
    return {
      user: user,
      profile: pRes.data || null,
      languages: lRes.data || [],
      roles: roles,
      roleDetails: roleDetails,
      applications: aRes.data || []
    };
  }

  // ── Settings updates (Phase 2) ───────────────────────────
  async function updateUsername(newName) {
    const sb = await client();
    const user = await getUser();
    if (!user) throw new Error('Not authenticated');
    const { data: mine } = await sb.from('profiles').select('username').eq('id', user.id).maybeSingle();
    if (mine && String(mine.username).toLowerCase() === String(newName).toLowerCase()) return; // unchanged
    const ok = await usernameAvailable(newName);
    if (!ok) { const e = new Error('That username is already taken.'); e.code = 'username_taken'; throw e; }
    const { error } = await sb.from('profiles').update({ username: newName }).eq('id', user.id);
    if (error) throw error;
  }
  async function updateBasics(fields) {
    const sb = await client();
    const user = await getUser();
    if (!user) throw new Error('Not authenticated');
    const allowed = {};
    ['full_name','country','city','phone','phone_country','phone_code'].forEach(k => { if (k in fields) allowed[k] = fields[k]; });
    const { error } = await sb.from('profiles').update(allowed).eq('id', user.id);
    if (error) throw error;
  }
  async function updateNotificationPrefs(prefs) {
    const sb = await client();
    const user = await getUser();
    if (!user) throw new Error('Not authenticated');
    const { error } = await sb.from('profiles').update({ notification_prefs: prefs }).eq('id', user.id);
    if (error) throw error;
  }
  async function submitApplication(type, details) {
    const sb = await client();
    const user = await getUser();
    if (!user) throw new Error('Not authenticated');
    const { error } = await sb.from('applications').insert({ user_id: user.id, type: type, details: details || {} });
    if (error) throw error;
  }

  // ── Reverse mapper: normalized tables => formData (edit mode) ──
  function rebuildLanguages(rows) {
    const langs = {};
    (rows || []).forEach(r => {
      if (r.variant) { if (typeof langs[r.language] !== 'object' || langs[r.language] === null) langs[r.language] = {}; langs[r.language][r.variant] = r.level; }
      else { langs[r.language] = r.level; }
    });
    return langs;
  }
  function profileToFormData(data) {
    const fd = {};
    const p = (data && data.profile) || {};
    fd.name = p.full_name || '';
    fd.username = p.username || '';
    fd.email = p.email || '';
    fd.country = p.country || '';
    fd.city = p.city || '';
    fd.phone = p.phone ? String(p.phone).replace(p.phone_code ? (p.phone_code + ' ') : '', '') : '';
    fd.phoneCountry = p.phone_country || '';
    fd.phoneCode = p.phone_code || '';
    fd.hiringAs = p.hiring_as || '';
    fd.companyName = p.company_name || '';
    fd.companyIndustry = p.company_industry || '';
    if (p.qualifications) fd.qualifications = p.qualifications;
    fd.otherRole = p.other_role || '';
    fd.languages = rebuildLanguages(data && data.languages);
    const roles = ((data && data.roles) || []).map(r => r.role_key);
    roles.forEach(r => {
      const detail = data.roleDetails[r];
      if (!detail) return;
      if (HIRE_TARGET[r]) {
        fd[r + 'Currency'] = detail.currency; fd[r + 'BudMin'] = detail.budget_min; fd[r + 'BudMax'] = detail.budget_max; fd[r + 'Note'] = detail.note;
        const d = detail.details || {};
        fd[r + 'Languages'] = d.languages; fd[r + 'BudgetTypes'] = d.budgetTypes; fd[r + 'PeriodSpec'] = d.periodSpec; fd[r + 'UseShared'] = d.useShared;
      } else if (ROLE_TABLE[r]) {
        const cfg = ROLE_TABLE[r];
        for (const [dbCol, fdKey] of Object.entries(cfg.cols)) fd[fdKey] = detail[dbCol];
        const d = detail.details || {};
        Object.keys(d).forEach(k => { if (k !== 'display_rows') fd[k] = d[k]; });
      }
    });
    return { formData: fd, roles: roles };
  }

  // ── Public API ───────────────────────────────────────────
  window.RA = {
    ROLE_TABLE, HIRE_TARGET,
    signUp, signIn, signOut, getUser, getSession, onAuth, resetPassword, updatePassword, requireAuth,
    usernameAvailable,
    uploadAvatar, removeAvatar, avatarPublicUrl,
    stashPending, getPending, clearPending, flushPending,
    saveProfile, loadProfile,
    updateUsername, updateBasics, updateNotificationPrefs, submitApplication, profileToFormData,
    enforceRemember
  };
})();
