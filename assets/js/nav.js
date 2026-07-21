/* Shared header/footer injector + dropdown & mobile nav behavior.
   Each page sets window.SITE_ROOT (relative path back to site root)
   and optionally window.SITE_SECTION / window.SITE_PAGE before this
   script runs, so the same partials work at any folder depth. */
(function () {
  var ROOT = typeof window.SITE_ROOT === 'string' ? window.SITE_ROOT : './';
  var SECTION = window.SITE_SECTION || null;
  var PAGE = window.SITE_PAGE || null;

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
        var b = i.querySelector('.site-nav-btn');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
    }
    function openOnly(item) {
      cancelClose();
      closeAll();
      item.classList.add('open');
      item.querySelector('.site-nav-btn').setAttribute('aria-expanded', 'true');
    }
    function scheduleClose(item) {
      cancelClose();
      closeTimer = setTimeout(function () {
        item.classList.remove('open');
        item.querySelector('.site-nav-btn').setAttribute('aria-expanded', 'false');
      }, CLOSE_DELAY);
    }

    items.forEach(function (item) {
      var btn = item.querySelector('.site-nav-btn');
      if (!btn) return; // plain link item (e.g. "About") — no dropdown to wire up

      // Click / tap — primary interaction on mobile, also works on desktop (keyboard access).
      btn.addEventListener('click', function () {
        if (item.classList.contains('open')) {
          closeAll();
        } else {
          openOnly(item);
        }
      });

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

  document.addEventListener('DOMContentLoaded', function () {
    loadPartial('nav.html', 'site-header', initHeader);
    loadPartial('footer.html', 'site-footer');
  });
})();
