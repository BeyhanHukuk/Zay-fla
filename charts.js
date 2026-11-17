/* Zayıfla - bağımlılıksız SVG grafikleri (retina'da keskin, karanlık modda CSS değişkenleriyle renklenir) */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function svgRoot(container, h) {
    container.innerHTML = '';
    var w = Math.max(260, Math.round(container.clientWidth || 320));
    var svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h, width: '100%', height: h, class: 'chart-svg', role: 'img', preserveAspectRatio: 'none' });
    container.appendChild(svg);
    return { svg: svg, w: w, h: h };
  }
  function empty(container, text, h) {
    container.innerHTML = '<div class="chart-empty" style="height:' + (h || 180) + 'px"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg><span>' + (text || 'Henüz veri yok') + '</span></div>';
  }
  function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayNum(s) { return Math.round(parseDate(s).getTime() / 864e5); }
  function fmtDay(s) { var d = parseDate(s); return d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function fmtNum(v, dec) { return Number(v).toFixed(dec == null ? 1 : dec).replace('.', ','); }

  function niceStep(span, count) {
    var raw = span / Math.max(1, count), mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * mag;
  }

  /**
   * Kilo çizgi grafiği.
   * opts: {points:[{date,y}], trend:[{date,y}], goal, unit, fmt(v), height, from(date str), to(date str)}
   */
  function line(container, opts) {
    var H = opts.height || 220;
    var pts = (opts.points || []).filter(function (p) { return isFinite(p.y); });
    var tr = (opts.trend || []).filter(function (p) { return isFinite(p.y); });
    if (!pts.length) return empty(container, opts.emptyText || 'Henüz kilo kaydı yok', H);
    var r = svgRoot(container, H), svg = r.svg, W = r.w;
    var fmt = opts.fmt || function (v) { return fmtNum(v); };
    var padL = 40, padR = 12, padT = 14, padB = 26;
    var xs = pts.map(function (p) { return dayNum(p.date); });
    var x0 = opts.from ? dayNum(opts.from) : Math.min.apply(null, xs);
    var x1 = opts.to ? dayNum(opts.to) : Math.max.apply(null, xs);
    if (x1 - x0 < 6) { x0 = x1 - 6; }
    var ys = pts.map(function (p) { return p.y; }).concat(tr.map(function (p) { return p.y; }));
    var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
    var goal = opts.goal, goalInside = false;
    if (goal != null && isFinite(goal)) {
      var span0 = Math.max(1, ymax - ymin);
      if (goal >= ymin - span0 * 1.2 - 1.5 && goal <= ymax + span0 * 1.2 + 1.5) {
        ymin = Math.min(ymin, goal); ymax = Math.max(ymax, goal); goalInside = true;
      }
    }
    var pad = Math.max(0.4, (ymax - ymin) * 0.12);
    ymin -= pad; ymax += pad;
    var step = niceStep(ymax - ymin, 4);
    ymin = Math.floor(ymin / step) * step; ymax = Math.ceil(ymax / step) * step;
    var X = function (d) { return padL + (d - x0) / Math.max(1, x1 - x0) * (W - padL - padR); };
    var Y = function (v) { return padT + (ymax - v) / (ymax - ymin) * (H - padT - padB); };

    // grid + y etiketleri
    for (var v = ymin; v <= ymax + 1e-9; v += step) {
      el('line', { x1: padL, x2: W - padR, y1: Y(v), y2: Y(v), class: 'ch-grid' }, svg);
      var t = el('text', { x: padL - 6, y: Y(v) + 4, class: 'ch-label', 'text-anchor': 'end' }, svg);
      t.textContent = fmtNum(v, step < 1 ? 1 : 0);
    }
    // x etiketleri
    var nT = Math.min(5, Math.max(2, Math.floor((W - padL) / 80)));
    for (var i = 0; i < nT; i++) {
      var d = Math.round(x0 + (x1 - x0) * i / (nT - 1));
      var dt = new Date(d * 864e5);
      var lbl = dt.getUTCDate() + ' ' + MONTHS[dt.getUTCMonth()]; // d = yerel tarihin gün numarası (UTC olarak)
      var tx = el('text', { x: X(d), y: H - 8, class: 'ch-label', 'text-anchor': i === 0 ? 'start' : i === nT - 1 ? 'end' : 'middle' }, svg);
      tx.textContent = lbl;
    }
    // hedef çizgisi
    if (goal != null && isFinite(goal)) {
      if (goalInside) {
        el('line', { x1: padL, x2: W - padR, y1: Y(goal), y2: Y(goal), class: 'ch-goal' }, svg);
        var gt = el('text', { x: W - padR - 2, y: Y(goal) - 5, class: 'ch-goal-label', 'text-anchor': 'end' }, svg);
        gt.textContent = 'Hedef ' + fmt(goal);
      } else {
        var above = goal > ymax;
        var gt2 = el('text', { x: W - padR - 2, y: above ? padT + 10 : H - padB - 4, class: 'ch-goal-label', 'text-anchor': 'end' }, svg);
        gt2.textContent = 'Hedef ' + fmt(goal) + (above ? ' ↑' : ' ↓');
      }
    }
    // trend alanı + çizgisi
    if (tr.length > 1) {
      var dPath = tr.map(function (p, k) { return (k ? 'L' : 'M') + X(dayNum(p.date)).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ');
      var area = dPath + ' L' + X(dayNum(tr[tr.length - 1].date)).toFixed(1) + ' ' + (H - padB) + ' L' + X(dayNum(tr[0].date)).toFixed(1) + ' ' + (H - padB) + ' Z';
      var gid = 'g' + Math.random().toString(36).slice(2, 8);
      var defs = el('defs', null, svg);
      var lg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el('stop', { offset: '0%', class: 'ch-area-stop1' }, lg);
      el('stop', { offset: '100%', class: 'ch-area-stop2' }, lg);
      el('path', { d: area, fill: 'url(#' + gid + ')', stroke: 'none' }, svg);
      el('path', { d: dPath, class: 'ch-trend' }, svg);
    }
    // ham noktalar
    var dotR = pts.length > 60 ? 2 : 3.2;
    pts.forEach(function (p) {
      el('circle', { cx: X(dayNum(p.date)), cy: Y(p.y), r: dotR, class: 'ch-dot' }, svg);
    });
    // dokunmatik ipucu
    var hover = el('g', { class: 'ch-hover', style: 'display:none' }, svg);
    var hl = el('line', { y1: padT, y2: H - padB, class: 'ch-hover-line' }, hover);
    var hc = el('circle', { r: 5, class: 'ch-hover-dot' }, hover);
    var hb = el('rect', { rx: 8, ry: 8, height: 38, class: 'ch-tip' }, hover);
    var ht1 = el('text', { class: 'ch-tip-t1' }, hover);
    var ht2 = el('text', { class: 'ch-tip-t2' }, hover);
    function show(evt) {
      var rect = svg.getBoundingClientRect();
      var px = (evt.clientX - rect.left) * (W / rect.width);
      var best = null, bd = Infinity;
      pts.forEach(function (p) { var dd = Math.abs(X(dayNum(p.date)) - px); if (dd < bd) { bd = dd; best = p; } });
      if (!best) return;
      var trp = null;
      tr.forEach(function (p) { if (p.date === best.date) trp = p; });
      var cx = X(dayNum(best.date)), cy = Y(best.y);
      hover.setAttribute('style', '');
      hl.setAttribute('x1', cx); hl.setAttribute('x2', cx);
      hc.setAttribute('cx', cx); hc.setAttribute('cy', cy);
      ht1.textContent = fmtDay(best.date) + ' · ' + fmt(best.y);
      ht2.textContent = trp ? 'Trend ' + fmt(trp.y) : '';
      var bw = 132, bx = Math.min(W - padR - bw, Math.max(padL, cx - bw / 2));
      var by = cy - 52 < padT ? cy + 12 : cy - 50;
      hb.setAttribute('x', bx); hb.setAttribute('y', by); hb.setAttribute('width', bw);
      ht1.setAttribute('x', bx + 10); ht1.setAttribute('y', by + 16);
      ht2.setAttribute('x', bx + 10); ht2.setAttribute('y', by + 31);
    }
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointermove', function (e) { if (e.buttons || e.pointerType === 'mouse') show(e); });
    svg.addEventListener('pointerleave', function () { hover.setAttribute('style', 'display:none'); });
  }

  /**
   * Çubuk grafik.
   * opts: {data:[{key,label,value,sub}], target, height, selected, onSelect(i), fmt}
   */
  function bars(container, opts) {
    var H = opts.height || 200;
    var data = opts.data || [];
    var any = data.some(function (d) { return d.value > 0; });
    if (!data.length || !any) return empty(container, opts.emptyText || 'Bu aralıkta kayıt yok', H);
    var r = svgRoot(container, H), svg = r.svg, W = r.w;
    var padL = 36, padR = 8, padT = 16, padB = 24;
    var target = opts.target || 0;
    var max = Math.max(target * 1.15, Math.max.apply(null, data.map(function (d) { return d.value; })) * 1.08, 100);
    var step = niceStep(max, 4);
    max = Math.ceil(max / step) * step;
    var Y = function (v) { return padT + (1 - v / max) * (H - padT - padB); };
    for (var v = 0; v <= max + 1e-9; v += step) {
      el('line', { x1: padL, x2: W - padR, y1: Y(v), y2: Y(v), class: 'ch-grid' }, svg);
      var t = el('text', { x: padL - 6, y: Y(v) + 4, class: 'ch-label', 'text-anchor': 'end' }, svg);
      t.textContent = v >= 1000 ? fmtNum(v / 1000, v % 1000 ? 1 : 0) + 'b' : String(Math.round(v));
    }
    var n = data.length, slot = (W - padL - padR) / n, bw = Math.max(3, Math.min(28, slot * 0.62));
    var labelEvery = n <= 10 ? 1 : Math.ceil(n / 7);
    data.forEach(function (d, i) {
      var cx = padL + slot * i + slot / 2;
      var val = Math.max(0, d.value || 0);
      var y = Y(val), hgt = Math.max(val > 0 ? 3 : 2, H - padB - y);
      var cls = 'ch-bar' + (val <= 0 ? ' is-empty' : target && val > target * 1.05 ? ' is-over' : '') + (opts.selected === i ? ' is-sel' : '');
      el('rect', { x: cx - bw / 2, y: H - padB - hgt, width: bw, height: hgt, rx: Math.min(6, bw / 2), class: cls }, svg);
      // dokunma alanı
      var hit = el('rect', { x: padL + slot * i, y: padT, width: slot, height: H - padT, fill: 'transparent', class: 'ch-hit', 'data-i': i }, svg);
      hit.style.cursor = 'pointer';
      if ((n - 1 - i) % labelEvery === 0) {
        var lt = el('text', { x: cx, y: H - 7, class: 'ch-label' + (opts.selected === i ? ' is-sel' : ''), 'text-anchor': 'middle' }, svg);
        lt.textContent = d.label;
      }
    });
    if (target) {
      el('line', { x1: padL, x2: W - padR, y1: Y(target), y2: Y(target), class: 'ch-goal' }, svg);
      var gt = el('text', { x: W - padR, y: Y(target) - 5, class: 'ch-goal-label', 'text-anchor': 'end' }, svg);
      gt.textContent = 'Hedef ' + Math.round(target);
    }
    svg.addEventListener('click', function (e) {
      var tEl = e.target.closest ? e.target.closest('.ch-hit') : null;
      if (tEl && opts.onSelect) opts.onSelect(+tEl.getAttribute('data-i'));
    });
  }

  /** Halka (donut) grafik. opts: {segments:[{value,color,label}], size, thickness, center:[big, small]} */
  function donut(container, opts) {
    var size = opts.size || 140, th = opts.thickness || 16;
    var total = (opts.segments || []).reduce(function (a, s) { return a + Math.max(0, s.value || 0); }, 0);
    container.innerHTML = '';
    var svg = el('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size, class: 'donut-svg' });
    container.appendChild(svg);
    var cx = size / 2, R = (size - th) / 2, C = 2 * Math.PI * R;
    el('circle', { cx: cx, cy: cx, r: R, class: 'ring-track', 'stroke-width': th, fill: 'none' }, svg);
    if (total > 0) {
      var off = 0, gap = opts.segments.length > 1 ? 2 : 0;
      opts.segments.forEach(function (s) {
        var len = Math.max(0, s.value) / total * C;
        if (len <= 0) return;
        el('circle', {
          cx: cx, cy: cx, r: R, fill: 'none', stroke: s.color, 'stroke-width': th,
          'stroke-dasharray': Math.max(0, len - gap) + ' ' + (C - Math.max(0, len - gap)),
          'stroke-dashoffset': -off, transform: 'rotate(-90 ' + cx + ' ' + cx + ')', 'stroke-linecap': 'butt'
        }, svg);
        off += len;
      });
    }
    if (opts.center) {
      var t1 = el('text', { x: cx, y: cx + 2, 'text-anchor': 'middle', class: 'donut-big' }, svg); t1.textContent = opts.center[0];
      var t2 = el('text', { x: cx, y: cx + 20, 'text-anchor': 'middle', class: 'donut-small' }, svg); t2.textContent = opts.center[1] || '';
    }
  }

  /** Kalori halkası (Bugün ekranı). */
  function ring(container, opts) {
    var size = opts.size || 196, th = opts.thickness || 16;
    var goal = Math.max(1, opts.goal || 1), val = Math.max(0, opts.value || 0);
    var R = (size - th) / 2, C = 2 * Math.PI * R, cx = size / 2;
    var frac = Math.min(1, val / goal), over = val > goal;
    var html = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" class="ring-svg" aria-hidden="true">' +
      '<circle cx="' + cx + '" cy="' + cx + '" r="' + R + '" fill="none" class="ring-track" stroke-width="' + th + '"/>' +
      '<circle cx="' + cx + '" cy="' + cx + '" r="' + R + '" fill="none" class="ring-fill' + (over ? ' is-over' : '') + '" stroke-width="' + th +
      '" stroke-linecap="round" stroke-dasharray="' + (C * frac).toFixed(2) + ' ' + C.toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cx + ')"/>' +
      '</svg>';
    container.innerHTML = html;
  }

  window.ZCharts = { line: line, bars: bars, donut: donut, ring: ring, empty: empty, fmtDay: fmtDay, MONTHS: MONTHS };
})();
