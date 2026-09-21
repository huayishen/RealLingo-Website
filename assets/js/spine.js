/* Scroll-driven winding spine — connects page sections with an animated SVG path.
   The segment near the currently-visible section glows bright yellow. */
(function () {
  'use strict';
  if (!window.matchMedia('(min-width: 900px) and (pointer: fine)').matches) return;

  var YELLOW        = '#ffeb99';
  var YELLOW_DIM    = 'rgba(255,235,153,0.10)';
  var DOT_R         = 10;
  var SW            = 8;
  var CORNER        = 60;

  function init() {
    var sections = Array.prototype.slice.call(
      document.querySelectorAll('section[id], .rlcc-panel[id], [data-spine-stop]')
    );
    if (sections.length < 2) return;

    var docW = document.documentElement.offsetWidth;
    var docH = document.documentElement.scrollHeight;
    var xL   = Math.round(docW * 0.055);
    var xR   = Math.round(docW * 0.945);

    /* Anchor points — start on left (hero area), alternate left/right */
    var anchors = sections.map(function (s, i) {
      var top = s.getBoundingClientRect().top + window.scrollY;
      var bot = top + s.offsetHeight;
      return {
        x: i % 2 === 0 ? xL : xR,
        y: Math.round(top + s.offsetHeight * 0.72),
        top: Math.round(top),
        bot: Math.round(bot)
      };
    });

    /* Entry: left side just above first section */
    var firstTop = sections[0].getBoundingClientRect().top + window.scrollY;
    var lastBot  = sections[sections.length - 1].getBoundingClientRect().bottom + window.scrollY;
    var entryPt  = { x: xL, y: Math.max(40, firstTop + 40) };
    /* Exit lands above the last section's content (≈ top 30%) so the line
       visually "arrives at" the CTA rather than passing all the way through */
    var lastAnchor = anchors[anchors.length - 1];
    var exitPt   = { x: lastAnchor.x, y: Math.round(lastAnchor.top + (lastAnchor.bot - lastAnchor.top) * 0.35) };

    var pts = [entryPt].concat(anchors).concat([exitPt]);

    /* midYs[i] = explicit y for the horizontal crossing from pts[i] to pts[i+1].
       Use midpoint of the gap between consecutive sections so the crossing
       passes through the blank space rather than inside either section. */
    var midYs = new Array(pts.length).fill(null);
    for (var ai = 0; ai < anchors.length - 1; ai++) {
      var gapTop = anchors[ai].bot;
      var gapBot = anchors[ai + 1].top;
      /* If sections are adjacent (no gap) fall back to section bottom */
      midYs[ai + 1] = gapBot > gapTop
        ? Math.round((gapTop + gapBot) / 2)
        : gapTop;
    }

    /* Y-range for scroll fill start (after hero) */
    var heroBottomY = anchors.length > 1
      ? anchors[1].y - window.innerHeight * 0.4
      : firstTop + sections[0].offsetHeight;

    /* Build SVG path with rounded corners.
       crossYs[i] overrides the default midpoint for the horizontal crossing
       from pts[i] to pts[i+1], routing crossings to section boundaries. */
    function buildD(pts, crossYs) {
      var d = 'M ' + pts[0].x + ' ' + pts[0].y;
      for (var i = 1; i < pts.length; i++) {
        var p = pts[i - 1], c = pts[i];
        if (p.x === c.x) {
          d += ' L ' + c.x + ' ' + c.y;
        } else {
          var midY = (crossYs && crossYs[i - 1] != null)
            ? crossYs[i - 1]
            : Math.round((p.y + c.y) / 2);
          var R    = Math.min(CORNER, Math.abs(midY - p.y) - 2, Math.abs(c.y - midY) - 2, Math.abs(c.x - p.x) / 2 - 2);
          if (R < 4) { d += ' L ' + c.x + ' ' + c.y; continue; }
          var dirX = c.x > p.x ? 1 : -1;
          var dirP = midY > p.y ? 1 : -1;
          var dirC = c.y > midY ? 1 : -1;
          d += ' L '  + p.x + ' ' + (midY - dirP * R);
          d += ' Q '  + p.x + ' ' + midY + ' ' + (p.x + dirX * R) + ' ' + midY;
          d += ' L '  + (c.x - dirX * R) + ' ' + midY;
          d += ' Q '  + c.x + ' ' + midY + ' ' + c.x + ' ' + (midY + dirC * R);
          d += ' L '  + c.x + ' ' + c.y;
        }
      }
      return d;
    }

    var pathD = buildD(pts, midYs);

    /* ── SVG container ── */
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;overflow:visible;pointer-events:none;z-index:5;';
    svg.setAttribute('height', docH);
    svg.setAttribute('viewBox', '0 0 ' + docW + ' ' + docH);

    /* Gradient defs: track fades in below hero */
    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    var gradId = 'spineTrackGrad';
    var grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.setAttribute('id', gradId);
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', entryPt.y);
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', heroBottomY);
    function makeStop(offset, opacity) {
      var s = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', '#ffeb99');
      s.setAttribute('stop-opacity', opacity);
      return s;
    }
    grad.appendChild(makeStop('0%',   '0'));
    grad.appendChild(makeStop('100%', '0.10'));
    defs.appendChild(grad);

    /* Progress fill gradient: light yellow → deep yellow along scroll direction */
    var fillGrad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    var fillGradId = 'spineProgressGrad';
    fillGrad.setAttribute('id', fillGradId);
    fillGrad.setAttribute('gradientUnits', 'userSpaceOnUse');
    fillGrad.setAttribute('x1', '0'); fillGrad.setAttribute('y1', String(entryPt.y));
    fillGrad.setAttribute('x2', '0'); fillGrad.setAttribute('y2', String(exitPt.y));
    function makeFillStop(offset, color) {
      var s = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', color);
      return s;
    }
    fillGrad.appendChild(makeFillStop('0%',   '#fff3b0'));
    fillGrad.appendChild(makeFillStop('50%',  '#ffeb99'));
    fillGrad.appendChild(makeFillStop('100%', '#f5c840'));
    defs.appendChild(fillGrad);

    svg.appendChild(defs);

    /* 1. Faint track (always visible, gradient fade at top) */
    function makePath(stroke, width, opacity) {
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', pathD);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', stroke);
      p.setAttribute('stroke-width', width);
      p.setAttribute('stroke-linecap', 'round');
      if (opacity != null) p.setAttribute('stroke-opacity', opacity);
      return p;
    }
    svg.appendChild(makePath('url(#' + gradId + ')', SW));

    /* 2. Progressive scroll fill (hidden in hero, draws as you scroll) */
    var progressFill = makePath('url(#' + fillGradId + ')', SW);
    svg.appendChild(progressFill);

    /* 3. Active-section highlight — sweeps top-to-bottom as section enters view */
    var activeFill = makePath('url(#' + fillGradId + ')', SW + 2);
    /* dasharray transition drives the top-to-bottom reveal; opacity fades in simultaneously */
    activeFill.style.transition = 'stroke-dasharray 0.55s cubic-bezier(.22,1,.36,1), stroke-opacity 0.45s ease';
    activeFill.setAttribute('stroke-opacity', '0');
    svg.appendChild(activeFill);

    /* Dots */
    function dot(cx, cy, color) {
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', DOT_R);
      c.setAttribute('fill', color); return c;
    }
    svg.appendChild(dot(entryPt.x, entryPt.y, 'transparent'));

    /* Focal glow at exit — radial burst pointing toward CTA */
    var focalId = 'spineFocalGrad';
    var focalGrad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    focalGrad.setAttribute('id', focalId);
    focalGrad.setAttribute('cx', '50%'); focalGrad.setAttribute('cy', '50%');
    focalGrad.setAttribute('r', '50%');
    function rStop(offset, opacity) {
      var s = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', '#ffeb99');
      s.setAttribute('stop-opacity', opacity);
      return s;
    }
    focalGrad.appendChild(rStop('0%',   '0.55'));
    focalGrad.appendChild(rStop('35%',  '0.22'));
    focalGrad.appendChild(rStop('100%', '0'));
    defs.appendChild(focalGrad);

    /* Outer glow disc */
    var focalDisc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    focalDisc.setAttribute('cx', exitPt.x); focalDisc.setAttribute('cy', exitPt.y);
    focalDisc.setAttribute('r', '120');
    focalDisc.setAttribute('fill', 'url(#' + focalId + ')');
    focalDisc.setAttribute('opacity', '0');
    focalDisc.style.transition = 'opacity 0.6s ease';
    svg.appendChild(focalDisc);

    /* Inner bright dot */
    var endDot = dot(exitPt.x, exitPt.y, YELLOW_DIM);
    endDot.setAttribute('r', DOT_R + 2);
    endDot.style.transition = 'fill 0.4s ease, r 0.4s ease';
    svg.appendChild(endDot);

    /* Attach */
    var host = document.querySelector('.site-page') || document.body;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.insertBefore(svg, host.firstChild);

    /* Elevate section content above spine (z-index:5) */
    sections.forEach(function (section) {
      if (getComputedStyle(section).position === 'static') section.style.position = 'relative';
      Array.prototype.slice.call(section.children).forEach(function (child) {
        var cs = getComputedStyle(child);
        if (cs.position === 'static') child.style.position = 'relative';
        var z = parseInt(cs.zIndex, 10);
        if (isNaN(z) || z < 6) child.style.zIndex = '6';
      });
    });

    /* ── Path length measurements ── */
    var totalLen = progressFill.getTotalLength();
    progressFill.setAttribute('stroke-dasharray', totalLen);
    progressFill.setAttribute('stroke-dashoffset', totalLen);
    activeFill.setAttribute('stroke-dasharray', '0 ' + totalLen);
    activeFill.setAttribute('stroke-dashoffset', '0');

    /* Estimate path length at each anchor by binary-searching getPointAtLength.
       We walk Y-axis: since path is mostly vertical, a bisect on Y is accurate. */
    function lenAtY(targetY) {
      var lo = 0, hi = totalLen;
      for (var k = 0; k < 22; k++) {
        var mid = (lo + hi) * 0.5;
        var pt  = progressFill.getPointAtLength(mid);
        if (pt.y < targetY) lo = mid; else hi = mid;
      }
      return (lo + hi) * 0.5;
    }

    /* Precompute anchor lengths (+1 and -1 for pts array offset) */
    var anchorLens = anchors.map(function (a) { return lenAtY(a.y); });

    /* Window size: span 80% of the distance to the next anchor */
    var WINDOW_HALF = totalLen * 0.08; /* ±8% of path = roughly 1 section height */

    /* ── Active highlight: brightness proportional to viewport coverage ── */
    /* ratios[i] = intersectionRatio (0–1) for each section */
    var ratios = new Array(sections.length).fill(0);

    var _prevBestI = -1; /* track section changes to avoid transition on section-switch */

    function updateHighlight() {
      /* Pick section with highest ratio; tie-break toward the last one */
      var bestI = -1, bestR = 0;
      for (var i = 0; i < ratios.length; i++) {
        if (ratios[i] >= bestR) { bestR = ratios[i]; bestI = i; }
      }
      if (bestI < 0 || bestR < 0.01) {
        activeFill.setAttribute('stroke-dasharray', '0 ' + totalLen);
        activeFill.setAttribute('stroke-opacity', '0');
        activeFill.style.filter = 'none';
        _prevBestI = -1;
        return;
      }

      /* Highlight window: starts at top of the ±WINDOW_HALF centered on anchor */
      var center   = anchorLens[bestI];
      var startOff = Math.max(0, center - WINDOW_HALF);
      var fullLit  = Math.min(WINDOW_HALF * 2, totalLen - startOff);

      /* When the active section changes, snap the position instantly
         (no transition) so the sweep always starts from the right place */
      if (bestI !== _prevBestI) {
        activeFill.style.transition = 'none';
        activeFill.setAttribute('stroke-dasharray', startOff + ' 0 ' + totalLen);
        activeFill.setAttribute('stroke-opacity', '0');
        /* Force a reflow so the next setAttribute fires as a new transition */
        activeFill.getBoundingClientRect();
        activeFill.style.transition = 'stroke-dasharray 0.55s cubic-bezier(.22,1,.36,1), stroke-opacity 0.45s ease';
        _prevBestI = bestI;
      }

      /* lit grows from 0 → fullLit as ratio 0 → 1 (top-to-bottom sweep) */
      var lit     = fullLit * Math.min(1, bestR);
      var opacity = Math.min(1, bestR * 1.4); /* full brightness at ~71% coverage */
      activeFill.setAttribute('stroke-dasharray', startOff + ' ' + lit.toFixed(1) + ' ' + totalLen);
      activeFill.setAttribute('stroke-dashoffset', '0');
      activeFill.setAttribute('stroke-opacity', opacity.toFixed(3));
      var glowAlpha = (opacity * 0.65).toFixed(2);
      activeFill.style.filter = 'drop-shadow(0 0 ' + (3 + opacity * 9).toFixed(1) + 'px rgba(255,235,153,' + glowAlpha + '))';
    }

    /* Use many thresholds so the callback fires continuously as the section scrolls */
    var THRESHOLDS = [];
    for (var t = 0; t <= 20; t++) THRESHOLDS.push(t / 20);

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var idx = sections.indexOf(entry.target);
        if (idx >= 0) ratios[idx] = entry.intersectionRatio;
      });
      updateHighlight();
    }, { threshold: THRESHOLDS });

    sections.forEach(function (s) { observer.observe(s); });

    /* ── Progressive fill: draw from heroBottomY to page end ── */
    var scrollStart = heroBottomY;
    var scrollEnd   = docH - window.innerHeight;

    function updateProgress() {
      var pct = window.scrollY <= scrollStart ? 0
              : Math.min(1, (window.scrollY - scrollStart) / Math.max(1, scrollEnd - scrollStart));
      progressFill.setAttribute('stroke-dashoffset', totalLen * (1 - pct));
      /* Focal glow: fades in as scroll reaches the last 15% */
      var focalPct = Math.max(0, (pct - 0.85) / 0.15);
      endDot.setAttribute('fill', pct > 0.92 ? YELLOW : YELLOW_DIM);
      focalDisc.setAttribute('opacity', (focalPct * 0.9).toFixed(3));
    }
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 120);
  }
})();
