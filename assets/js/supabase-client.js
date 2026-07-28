/* ════════════════════════════════════════════════════════════
   SUPABASE CLIENT (static-site / no build step)

   Loads @supabase/supabase-js straight from a CDN as an ES module
   and exposes one global helper: window.submitToSupabase(payload).

   The URL + publishable key below are PUBLIC by design — the
   publishable key maps to the anonymous role and is safe to ship in
   client code. It's protected by Row-Level Security: the `submissions`
   table only allows INSERT for anonymous visitors, never SELECT.

   NOTE: there is no build step here, so browsers cannot read a .env
   file. Config for the browser lives in this file. (The .env at the
   project root mirrors these values for local tooling only.)
════════════════════════════════════════════════════════════ */
(function () {
  const SUPABASE_URL = 'https://fcvmbygdcynpakmpfams.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cSjnjMCjgoOmGHpMWIr6Sw_6RH0fLQz';

  let _clientPromise = null;

  function getClient() {
    if (!_clientPromise) {
      _clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
        .then(({ createClient }) =>
          createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { persistSession: false }  // no auth on this site
          })
        );
    }
    return _clientPromise;
  }

  /**
   * Insert one row into public.submissions.
   * We deliberately do NOT chain .select() — the anon role has no SELECT
   * policy, so reading the row back would fail. Insert-only is the point.
   *
   * @param {object} payload - { flow, name?, email?, phone?, country?, roles?, data }
   * @returns {Promise<void>} resolves on success, rejects with the Supabase error.
   */
  window.submitToSupabase = async function submitToSupabase(payload) {
    const supabase = await getClient();
    const { error } = await supabase.from('submissions').insert(payload);
    if (error) throw error;
  };

  const CV_MIME = {
    pdf:  'application/pdf',
    doc:  'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };

  /**
   * Upload a CV file to the private `cv-uploads` bucket.
   * Returns the storage path (string) to persist alongside the submission.
   * The bucket enforces a 5 MB / PDF-DOC-DOCX limit server-side too.
   *
   * @param {File} file
   * @returns {Promise<string>} the object path within the bucket
   */
  window.uploadCV = async function uploadCV(file) {
    const supabase = await getClient();
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const path = `${id}.${ext}`;
    const { data, error } = await supabase.storage.from('cv-uploads').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || CV_MIME[ext] || 'application/octet-stream'
    });
    if (error) throw error;
    return data.path;
  };
})();
