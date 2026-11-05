/* SIMDEC — малювання кільця циклу (SVG). Спільне для тренажера і редактора. */
(function () {
  function polar(cx, cy, r, deg) {
    var a = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function arc(cx, cy, r, a0, a1) {
    var p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    var large = a1 - a0 > 180 ? 1 : 0;
    return "M" + p0[0].toFixed(2) + " " + p0[1].toFixed(2) +
      " A" + r + " " + r + " 0 " + large + " 1 " + p1[0].toFixed(2) + " " + p1[1].toFixed(2);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /**
   * opts: { stages:[{code,name}], color, current (index|-1), done (кількість пройдених),
   *         size, center: {top, bottom}, letters: true }
   */
  window.SimdecCycle = function (opts) {
    var stages = opts.stages || [];
    var n = Math.max(stages.length, 1);
    var size = opts.size || 200;
    var c = 100, r = 74, w = 22, gap = 7;
    var seg = 360 / n;
    var out = '<svg class="cycle" viewBox="0 0 200 200" width="' + size + '" height="' + size +
      '" role="img" aria-label="Цикл ' + esc(stages.map(function (s) { return s.code; }).join(" → ")) + '">';
    stages.forEach(function (s, i) {
      var a0 = i * seg + gap / 2, a1 = (i + 1) * seg - gap / 2;
      var state = i < (opts.done || 0) ? "done" : (i === opts.current ? "current" : "todo");
      var col = state === "todo" ? "var(--ring-todo, #DCE3EE)" : opts.color;
      var op = state === "done" && !opts.solid ? 0.55 : 1;
      out += '<path class="seg seg-' + state + '" d="' + arc(c, c, r, a0, a1) + '" fill="none" stroke="' + col +
        '" stroke-opacity="' + op + '" stroke-width="' + w + '" stroke-linecap="butt"/>';
      if (opts.letters !== false) {
        var p = polar(c, c, r, (a0 + a1) / 2);
        var label = n <= 4 ? s.code.charAt(0) : String(i + 1);
        out += '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 4.5).toFixed(1) +
          '" text-anchor="middle" class="seg-letter" fill="' + (state === "todo" ? "#6B7A90" : "#fff") + '">' + esc(label) + '</text>';
      }
    });
    if (opts.center) {
      out += '<text x="100" y="' + (opts.center.bottom ? 97 : 106) + '" text-anchor="middle" class="ring-top">' + esc(opts.center.top || "") + '</text>';
      if (opts.center.bottom) out += '<text x="100" y="118" text-anchor="middle" class="ring-bottom">' + esc(opts.center.bottom) + '</text>';
    }
    out += "</svg>";
    return out;
  };
})();
