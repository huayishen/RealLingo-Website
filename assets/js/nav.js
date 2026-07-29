/* Shared header/footer injector + dropdown & mobile nav behavior.
   Each page sets window.SITE_ROOT (relative path back to site root)
   and optionally window.SITE_SECTION / window.SITE_PAGE before this
   script runs, so the same partials work at any folder depth. */
(function () {
  var ROOT = typeof window.SITE_ROOT === 'string' ? window.SITE_ROOT : './';
  var SECTION = window.SITE_SECTION || null;
  var PAGE = window.SITE_PAGE || null;

  // Lightweight logged-in check: read the persisted Supabase session straight
  // from localStorage so marketing pages don't have to load supabase-js.
  function currentUsername() {
    var loggedIn = false;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!/^sb-.*-auth-token$/.test(k)) continue;
        var v = JSON.parse(localStorage.getItem(k) || 'null');
        var sess = v && (v.currentSession || v);
        if (sess && sess.access_token) {
          var exp = sess.expires_at || sess.expiresAt;      // unix seconds
          if (!exp || exp * 1000 >= Date.now()) loggedIn = true;  // present & not clearly expired
        }
        break;
      }
    } catch (e) { return null; }
    if (!loggedIn) return null;   // not logged in — keep Log In / Sign Up
    // logged in — surface the cached username for a friendlier nav (best-effort)
    var uname = '';
    try { uname = localStorage.getItem('ra_username') || ''; } catch (e) {}
    return /^[a-zA-Z0-9_]{1,20}$/.test(uname) ? uname : '';
  }

  function navLogout() {
    // No supabase-js on marketing pages, so clear the persisted session
    // locally and send the user home.
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k);
      }
      localStorage.removeItem('ra_username');
      localStorage.removeItem('ra_remember');
    } catch (e) {}
    window.location.href = ROOT;
  }

  function applyAuthState(target) {
    var actions = target.querySelector('.site-actions');
    if (!actions) return;
    var uname = currentUsername();
    if (uname === null) return; // not logged in — keep Log In / Sign Up
    // Layout: "Hi, @username"  [Dashboard]  [Log out]
    actions.innerHTML =
      '<span class="site-hi">Hi, ' + (uname ? '@' + uname : 'there') + '</span>' +
      '<a href="' + ROOT + 'dashboard/" class="site-btn-solid">Dashboard</a>' +
      '<a href="#" class="site-btn-ghost" id="siteLogout">Log out</a>';
    var lo = actions.querySelector('#siteLogout');
    if (lo) lo.addEventListener('click', function (e) { e.preventDefault(); navLogout(); });
  }

  function rewriteLinks(container) {
    container.querySelectorAll('[data-href]').forEach(function (el) {
      var href = el.getAttribute('data-href');
      el.setAttribute('href', ROOT + href);
      if (PAGE && href.replace(/\/$/, '') === PAGE.replace(/\/$/, '')) {
        el.classList.add('current');
      }
    });
    container.querySelectorAll('[data-src]').forEach(function (el) {
      el.setAttribute('src', ROOT + el.getAttribute('data-src'));
    });
  }

  function loadPartial(name, targetId, after) {
    fetch(ROOT + 'partials/' + name)
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var target = document.getElementById(targetId);
        if (!target) return;
        target.innerHTML = html;
        rewriteLinks(target);
        if (after) after(target);
      });
  }

  function initHeader(target) {
    document.body.classList.add('has-site-hdr');
    applyAuthState(target);   // swap Log In/Sign Up → Dashboard when signed in
    var hdr = target.querySelector('#siteHdr');
    var nav = target.querySelector('#siteNav');
    var burger = target.querySelector('#siteBurger');

    if (SECTION) {
      var active = target.querySelector('.site-nav-item[data-section="' + SECTION + '"]');
      if (active) active.classList.add('active');
    }

    // Scroll shadow
    window.addEventListener('scroll', function () {
      hdr.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });

    // Dropdown toggles
    var items = target.querySelectorAll('.site-nav-item');
    var hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)');
    var CLOSE_DELAY = 500; // grace period so the cursor can travel from the button down into the dropdown
    var closeTimer = null;

    function cancelClose() {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    function closeAll() {
      cancelClose();
      items.forEach(function (i) {
        i.classList.remove('open');
        var t = i.querySelector('.site-nav-btn, .site-nav-caret');
        if (t) t.setAttribute('aria-expanded', 'false');
      });
    }
    function openOnly(item) {
      cancelClose();
      closeAll();
      item.classList.add('open');
      var t = item.querySelector('.site-nav-btn, .site-nav-caret');
      if (t) t.setAttribute('aria-expanded', 'true');
    }
    function scheduleClose(item) {
      cancelClose();
      closeTimer = setTimeout(function () {
        item.classList.remove('open');
        var t = item.querySelector('.site-nav-btn, .site-nav-caret');
        if (t) t.setAttribute('aria-expanded', 'false');
      }, CLOSE_DELAY);
    }

    items.forEach(function (item) {
      if (!item.querySelector('.site-dd')) return; // plain link item (e.g. "About") — no dropdown to wire up
      // "Explore" splits its label (a real link) from a separate caret that
      // only toggles the submenu, so the label click can navigate straight
      // to Resources while the caret still reveals the other subpages.
      var toggle = item.querySelector('.site-nav-btn, .site-nav-caret');

      // Click / tap — primary interaction on mobile, also works on desktop (keyboard access).
      if (toggle) {
        toggle.addEventListener('click', function (e) {
          e.preventDefault();
          if (item.classList.contains('open')) {
            closeAll();
          } else {
            openOnly(item);
          }
        });
      }

      // Hover — desktop only, so the submenu shows just by moving the mouse over it.
      // Closing is delayed so the cursor has time to travel from the button into the
      // dropdown panel (there's a visual gap between them) without it snapping shut.
      item.addEventListener('mouseenter', function () {
        if (hoverCapable.matches) openOnly(item);
      });
      item.addEventListener('mouseleave', function () {
        if (hoverCapable.matches) scheduleClose(item);
      });
    });

    document.addEventListener('click', function (e) {
      if (!hdr.contains(e.target)) {
        closeAll();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeAll();
        nav.classList.remove('mobile-open');
        burger.classList.remove('open');
      }
    });

    // Mobile burger
    burger.addEventListener('click', function () {
      var willOpen = !nav.classList.contains('mobile-open');
      nav.classList.toggle('mobile-open', willOpen);
      burger.classList.toggle('open', willOpen);
      burger.setAttribute('aria-expanded', String(willOpen));
      if (!willOpen) closeAll();
    });
  }

  function initFooter(target) {
    var btn = target.querySelector('#ftrEmailBtn');
    var reveal = target.querySelector('#ftrEmailReveal');
    var copyBtn = target.querySelector('#ftrCopyBtn');
    var text = target.querySelector('.site-ftr-email-text');
    if (!btn || !reveal) return;
    btn.addEventListener('click', function () {
      reveal.hidden = !reveal.hidden;
    });
    if (copyBtn && text) {
      copyBtn.addEventListener('click', function () {
        var email = text.textContent;
        var done = function () {
          copyBtn.classList.add('copied');
          setTimeout(function () { copyBtn.classList.remove('copied'); }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(email).then(done, done);
        } else {
          done();
        }
      });
    }

    var backTop = target.querySelector('#ftrBackTop');
    if (backTop) {
      backTop.addEventListener('click', function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadPartial('nav.html', 'site-header', initHeader);
    loadPartial('footer.html', 'site-footer', initFooter);
  });
})();
