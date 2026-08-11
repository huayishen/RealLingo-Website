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
  const K_UNAME   = 'ra_username';            // cached username for the shared nav
  const K_NAME    = 'ra_name';                // cached display name (full_name) for greetings
  const K_AVA     = 'ra_avatar';              // cached avatar public URL for the nav button
  const S_SEEN    = 'ra_session_seen';        // sessionStorage marker for remember-me

  function cacheIdentity(profile) {
    try {
      // Always reflect the CURRENT account — clear stale values when the new
      // account has no profile / no name yet, so we never greet with the
      // previously-logged-in user's name.
      if (!profile) { localStorage.removeItem(K_UNAME); localStorage.removeItem(K_NAME); localStorage.removeItem(K_AVA); return; }
      if (profile.username) localStorage.setItem(K_UNAME, profile.username); else localStorage.removeItem(K_UNAME);
      if (profile.full_name) localStorage.setItem(K_NAME, profile.full_name); else localStorage.removeItem(K_NAME);
      var cfg = window.SUPABASE_CONFIG;
      if (profile.avatar_url && cfg) localStorage.setItem(K_AVA, cfg.url + '/storage/v1/object/public/avatars/' + profile.avatar_url);
      else localStorage.removeItem(K_AVA);
    } catch (e) {}
  }

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

  function flattenLanguages(uid, langs, other) {
    const rows = [];
    if (!langs) return rows;
    other = other || {};
    for (const [lang, val] of Object.entries(langs)) {
      if (val && typeof val === 'object') {
        for (const [variant, level] of Object.entries(val)) {
          if (!level) continue;
          // For an "Other variant(s)" option, store the user's typed variety name
          // in the variant column (falls back to a generic label if left blank).
          const variantName = /^other_/.test(variant) ? ((other[lang] && String(other[lang]).trim()) || 'Other') : variant;
          rows.push({ user_id: uid, language: lang, variant: variantName, level: level });
        }
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
  // TEMPORARY email-verification bypass. Supabase's default SMTP times the
  // /signup request out (10s → 504, account rolled back), so instead of
  // sb.auth.signUp we create the account already-confirmed via the `signup`
  // edge function (service-role admin.createUser, email_confirm:true, no email
  // sent) and then sign in to establish a session. Revert callers to signUp()
  // once custom SMTP (Resend) is live and re-enable "Confirm email".
  async function signUpDirect(email, password) {
    const sb = await client();
    const { data, error } = await sb.functions.invoke('signup', { body: { email: email, password: password } });
    // supabase-js surfaces a non-2xx as FunctionsHttpError (body in .context);
    // some builds instead resolve the parsed body into `data`. Handle both.
    let code = '';
    if (error) { try { code = (await error.context.json()).error || ''; } catch (_e) { code = ''; } }
    else if (data && data.error) { code = data.error; }
    if (code) {
      if (code === 'already_registered') { const e = new Error('already registered'); e.code = 'already_registered'; throw e; }
      if (code === 'invalid_email') throw new Error('Please enter a valid email address');
      if (code === 'weak_password') throw new Error('Password must be at least 8 characters');
      throw new Error((error && error.message) || 'Could not create your account');
    }
    if (error) throw error;
    // Account exists and is confirmed — establish a session right away.
    return await signIn(email, password, true);
  }
  async function signIn(email, password, remember) {
    try { localStorage.setItem(K_REMEMBER, remember ? '1' : '0'); sessionStorage.setItem(S_SEEN, '1'); } catch (e) {}
    const sb = await client();
    const { data, error } = await sb.auth.signInWithPassword({ email: email, password: password });
    if (error) throw error;
    // Cache name/username/avatar so the shared nav can greet the user right away.
    try { const { data: prof } = await sb.from('profiles').select('username, full_name, avatar_url').eq('id', data.user.id).maybeSingle(); cacheIdentity(prof); } catch (e) {}
    return data;
  }
  async function signOut() {
    const sb = await client();
    await sb.auth.signOut();
    try { [K_REMEMBER, K_PENDING, K_EMAIL, K_UNAME, K_NAME, K_AVA].forEach(k => localStorage.removeItem(k)); } catch (e) {}
  }
  async function updateEmail(newEmail) {
    const sb = await client();
    const { error } = await sb.auth.updateUser({ email: newEmail });
    if (error) throw error;   // Supabase emails a confirmation link to the new address
  }
  async function deleteAccount() {
    const sb = await client();
    const { error } = await sb.rpc('delete_own_account');
    if (error) throw error;
    try { await sb.auth.signOut(); } catch (e) {}
    try { [K_REMEMBER, K_PENDING, K_EMAIL, K_UNAME, K_NAME, K_AVA].forEach(k => localStorage.removeItem(k)); } catch (e) {}
  }
  async function loadSaved() {
    const sb = await client();
    const user = await getUser();
    if (!user) return [];
    const { data } = await sb.from('saved_items').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    return data || [];
  }
  async function saveItem(item) {
    const sb = await client();
    const user = await getUser();
    if (!user) throw new Error('Not authenticated');
    const { error } = await sb.from('saved_items').upsert({
      user_id: user.id, item_type: item.item_type, item_ref: item.item_ref,
      title: item.title || null, url: item.url || null, data: item.data || {}
    }, { onConflict: 'user_id,item_type,item_ref' });
    if (error) throw error;
  }
  async function unsaveItem(itemType, itemRef) {
    const sb = await client();
    const user = await getUser();
    if (!user) throw new Error('Not authenticated');
    const { error } = await sb.from('saved_items').delete().eq('user_id', user.id).eq('item_type', itemType).eq('item_ref', itemRef);
    if (error) throw error;
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
      // false only when the user tapped "Skip for now"; any full run (incl. the
      // later "complete your profile" edit) leaves it true.
      onboarding_complete: pending.onboardingComplete === false ? false : true
    };
    { const { error } = await sb.from('profiles').upsert(profileRow, { onConflict: 'id' }); if (error) throw error; }
    cacheIdentity(profileRow); // keep the shared-nav greeting ("Hi, <name>") in sync immediately after signup/edit

    // 1b. avatar chosen during review (base64 data URL) => upload to Storage
    if (fd.avatarDataUrl && String(fd.avatarDataUrl).startsWith('data:')) {
      try { await uploadAvatarDataUrl(fd.avatarDataUrl, uid); } catch (e) { console.error('avatar upload failed', e); }
    }

    // 2. languages (replace)
    await sb.from('profile_languages').delete().eq('user_id', uid);
    const langRows = flattenLanguages(uid, fd.languages, fd.langOther);
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
    if (pRes.data) cacheIdentity(pRes.data);
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
    const langs = {}, other = {};
    const langDef = (lang) => { try { return (typeof LANGUAGES !== 'undefined') && LANGUAGES.find(l => l.key === lang); } catch (e) { return null; } };
    (rows || []).forEach(r => {
      if (r.variant) {
        if (typeof langs[r.language] !== 'object' || langs[r.language] === null) langs[r.language] = {};
        const def = langDef(r.language);
        const known = def ? def.variants.map(v => v.key) : null;
        if (known && known.indexOf(r.variant) === -1) {
          // a typed "Other variant" name → restore the other_* key + the text
          const ov = def.variants.find(v => /^other_/.test(v.key));
          if (ov) { langs[r.language][ov.key] = r.level; other[r.language] = r.variant; }
          else { langs[r.language][r.variant] = r.level; }
        } else {
          langs[r.language][r.variant] = r.level;
        }
      } else { langs[r.language] = r.level; }
    });
    return { langs, other };
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
    { const rl = rebuildLanguages(data && data.languages); fd.languages = rl.langs; fd.langOther = rl.other; }
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

  // Add a single role to the current user's profile (idempotent). Used by the
  // "become an event organizer" CTA for already-logged-in users.
  async function addRole(roleKey) {
    const { sb, session } = await sessionOrThrow();
    const { error } = await sb.from('profile_roles').upsert(
      { user_id: session.user.id, role_key: roleKey, category: categoryOf(roleKey) },
      { onConflict: 'user_id,role_key' }
    );
    if (error) throw error;
  }

  // ── Marketplace ──────────────────────────────────────────
  const ADMIN_EMAIL = 'pr@thereallingo.com';
  async function isAdmin() {
    try { const u = await getUser(); return !!(u && String(u.email || '').toLowerCase() === ADMIN_EMAIL); } catch (e) { return false; }
  }
  function productImageUrl(path) {
    if (!path) return null;
    const cfg = window.SUPABASE_CONFIG;
    return cfg ? (cfg.url + '/storage/v1/object/public/product-images/' + path) : null;
  }
  async function uploadProductImage(file) {
    const { session } = await sessionOrThrow();
    const sb = await client();
    const cfg = window.SUPABASE_CONFIG;
    const uid = session.user.id;
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = uid + '/' + randId() + '.' + ext;
    const send = (tok) => fetch(cfg.url + '/storage/v1/object/product-images/' + path, {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + tok, 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    let token = session.access_token;
    let resp = await send(token);
    for (let a = 0; a < 3 && !resp.ok; a++) {
      try { const r = await sb.auth.refreshSession(); if (r && r.data && r.data.session) token = r.data.session.access_token; } catch (e) {}
      await new Promise(res => setTimeout(res, 500 + a * 500));
      resp = await send(token);
    }
    if (!resp.ok) throw new Error('Image upload failed (' + resp.status + ')');
    return path;
  }
  async function createProduct(p) {
    const { sb, session } = await sessionOrThrow();
    const row = {
      seller_id: session.user.id,
      title: p.title, description: p.description || null,
      price: (p.price === '' || p.price == null) ? null : Number(p.price),
      currency: p.currency || 'USD', category: p.category || null, condition: p.condition || null,
      image_url: p.image_url || null, contact: p.contact || null, location: p.location || null,
      quantity: p.quantity ? Number(p.quantity) : 1
    };
    const { data, error } = await sb.from('marketplace_products').insert(row).select().single();
    if (error) throw error;
    return data; // status is forced to 'pending' by the DB trigger
  }
  async function listMarketplace(opts) {
    opts = opts || {};
    const sb = await client();
    let q = sb.from('marketplace_products').select('*').eq('status', 'approved').order('created_at', { ascending: false });
    if (opts.category) q = q.eq('category', opts.category);
    const { data, error } = await q;
    if (error) throw error;
    let rows = data || [];
    if (opts.search) { const s = opts.search.toLowerCase(); rows = rows.filter(r => (r.title || '').toLowerCase().includes(s) || (r.description || '').toLowerCase().includes(s) || (r.category || '').toLowerCase().includes(s)); }
    return rows;
  }
  async function myProducts() {
    const { sb, session } = await sessionOrThrow();
    const { data, error } = await sb.from('marketplace_products').select('*').eq('seller_id', session.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }
  async function updateProduct(id, patch) { const sb = await client(); const { error } = await sb.from('marketplace_products').update(patch).eq('id', id); if (error) throw error; }
  async function markProductSold(id) { return updateProduct(id, { status: 'sold' }); }
  async function deleteProduct(id) { const sb = await client(); const { error } = await sb.from('marketplace_products').delete().eq('id', id); if (error) throw error; }
  // Admin (RLS enforces that only pr@thereallingo.com can actually change status)
  async function pendingProducts() { const sb = await client(); const { data, error } = await sb.from('marketplace_products').select('*').eq('status', 'pending').order('created_at', { ascending: true }); if (error) throw error; return data || []; }
  async function allProductsAdmin() { const sb = await client(); const { data, error } = await sb.from('marketplace_products').select('*').order('created_at', { ascending: false }); if (error) throw error; return data || []; }
  async function approveProduct(id) { return updateProduct(id, { status: 'approved', reject_reason: null }); }
  async function rejectProduct(id, reason) { return updateProduct(id, { status: 'rejected', reject_reason: reason || null }); }

  // ── Public API ───────────────────────────────────────────
  window.RA = {
    ROLE_TABLE, HIRE_TARGET,
    signUp, signUpDirect, signIn, signOut, getUser, getSession, onAuth, resetPassword, updatePassword, requireAuth,
    usernameAvailable,
    uploadAvatar, removeAvatar, avatarPublicUrl,
    stashPending, getPending, clearPending, flushPending,
    saveProfile, loadProfile,
    updateUsername, updateBasics, updateNotificationPrefs, submitApplication, profileToFormData,
    updateEmail, deleteAccount, loadSaved, saveItem, unsaveItem, addRole,
    isAdmin, productImageUrl, uploadProductImage, createProduct, listMarketplace, myProducts,
    updateProduct, markProductSold, deleteProduct, pendingProducts, allProductsAdmin, approveProduct, rejectProduct,
    enforceRemember
  };
})();
