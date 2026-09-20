/* Custom cursor + scroll-progress spine — Indisea-inspired, RL brand */
(function () {
  'use strict';

  /* ── Custom cursor ──────────────────────────────────────────── */
  var dot   = document.createElement('div');
  var ring  = document.createElement('div');
  dot.className  = 'rl-cursor-dot';
  ring.className = 'rl-cursor-ring';
  document.body.appendChild(dot);
  document.body.appendChild(ring);

  var mx = -200, my = -200;   // current mouse
  var rx = -200, ry = -200;   // ring (lagged)
  var raf;

  document.addEventListener('mousemove', function (e) {
    mx = e.clientX;
    my = e.clientY;
  });

  // hide native cursor via body class
  document.documentElement.classList.add('custom-cursor');

  // hover state on interactive elements
  document.addEventListener('mouseover', function (e) {
    var t = e.target.closest('a, button, [role="button"], input, select, textarea, label, .site-overlay-link');
    if (t) {
      dot.classList.add('hover');
      ring.classList.add('hover');
    }
  });
  document.addEventListener('mouseout', function (e) {
    var t = e.target.closest('a, button, [role="button"], input, select, textarea, label, .site-overlay-link');
    if (t) {
      dot.classList.remove('hover');
      ring.classList.remove('hover');
    }
  });

  function lerp(a, b, t) { return a + (b - a) * t; }

  function tick() {
    // dot: snap
    dot.style.transform = 'translate(' + (mx - 4) + 'px,' + (my - 4) + 'px)';
    // ring: lag
    rx = lerp(rx, mx, 0.12);
    ry = lerp(ry, my, 0.12);
    ring.style.transform = 'translate(' + (rx - 18) + 'px,' + (ry - 18) + 'px)';
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  /* ── Scroll-progress spine ──────────────────────────────────── */
  var spine = document.getElementById('rl-spine');
  if (!spine) return;

  var spineTrack = spine.querySelector('.rl-spine-track');
  var spineDot   = spine.querySelector('.rl-spine-dot');

  function updateSpine() {
    var scrolled = window.scrollY || document.documentElement.scrollTop;
    var total    = document.documentElement.scrollHeight - window.innerHeight;
    var pct      = total > 0 ? Math.min(100, (scrolled / total) * 100) : 0;
    if (spineTrack) spineTrack.style.height = pct + '%';
    if (spineDot)   spineDot.style.top = pct + '%';
  }

  window.addEventListener('scroll', updateSpine, { passive: true });
  updateSpine();
})();
