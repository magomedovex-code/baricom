/* baricom v2 — interactions */
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var root = document.documentElement;

  /* ---------- pixel textures for the strata (original noise, generated here) ---------- */
  function rnd(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function tex(seed, pick) {
    var c = document.createElement("canvas"); c.width = c.height = 16;
    var g = c.getContext("2d"), r = rnd(seed);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) { g.fillStyle = pick(x, y, r); g.fillRect(x, y, 1, 1); }
    return "url(" + c.toDataURL() + ")";
  }
  function from(arr) { return function (x, y, r) { return arr[Math.floor(r() * arr.length)]; }; }
  var DIRT = ["#7a5434", "#6b4a2e", "#86603d", "#5e4128", "#8d6842"];
  var STONE = ["#7d8084", "#6f7276", "#878a8e", "#636569", "#74777b"];
  var SLATE = ["#45464b", "#3c3d42", "#4c4d52", "#36373b", "#404146"];
  var BED = ["#2a2a2d", "#141416", "#3a3a3e", "#0c0c0e", "#222225"];
  var GRASS = ["#5e9e3f", "#538f37", "#6aad49", "#4a8131"];
  try {
    root.style.setProperty("--tex-dirt", tex(11, from(DIRT)));
    root.style.setProperty("--tex-stone", tex(23, from(STONE)));
    root.style.setProperty("--tex-slate", tex(37, from(SLATE)));
    root.style.setProperty("--tex-bed", tex(41, from(BED)));
    root.style.setProperty("--tex-grass", tex(53, function (x, y, r) {
      var edge = 3 + ((x * 7) % 3 === 0 ? 1 : 0) + (r() < .2 ? 1 : 0);
      return y < edge ? GRASS[Math.floor(r() * GRASS.length)] : DIRT[Math.floor(r() * DIRT.length)];
    }));
    root.style.setProperty("--tex-dirtstone", tex(67, function (x, y, r) {
      var edge = 7 + ((x * 5) % 4 === 0 ? 1 : 0) - ((x * 3) % 5 === 0 ? 1 : 0);
      return y < edge ? DIRT[Math.floor(r() * DIRT.length)] : STONE[Math.floor(r() * STONE.length)];
    }));
  } catch (e) {}

  /* ---------- hero: isometric world, bot clears the selection ---------- */
  var stage = document.getElementById("stage"), cv = document.getElementById("world"), chat = document.getElementById("chat");
  if (cv && cv.getContext) {
    var ctx = cv.getContext("2d");
    var N = 10, H = 4, W = 20, OX = 0, OY = 0, DPR = 1;
    var COL = { grass: [94, 158, 63], dirt: [122, 84, 52], stone: [125, 128, 132], ore: [78, 232, 240], lava: [255, 120, 30], deep: [86, 88, 94] };
    var world = {}, order = [], queue = [], removed = [], parts = [];
    var SEL = { x0: 2, x1: 7, y0: 2, y1: 7, z0: 1, z1: 3 };
    var r = rnd(99);
    function key(x, y, z) { return x + "," + y + "," + z; }
    function build() {
      world = {}; order = [];
      for (var x = 0; x < N; x++) for (var y = 0; y < N; y++) for (var z = 0; z < H; z++) {
        var k = z === 3 ? "grass" : z === 2 ? "dirt" : z === 0 ? "deep" : "stone";
        world[key(x, y, z)] = { x: x, y: y, z: z, k: k, v: (r() - .5) * .12, drop: 0, delay: 0 };
        order.push([x, y, z]);
      }
      [[4, 6, 1], [6, 3, 1], [3, 3, 0], [8, 8, 1], [1, 7, 1]].forEach(function (p) { world[key(p[0], p[1], p[2])].k = "ore"; });
      world[key(9, 1, 1)].k = "lava"; world[key(8, 0, 1)].k = "lava";
      order.sort(function (a, b) { return (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]) || a[2] - b[2]; });
      queue = [];
      for (var zz = SEL.z1; zz >= SEL.z0; zz--) for (var yy = SEL.y0; yy <= SEL.y1; yy++) {
        var row = []; for (var xx = SEL.x0; xx <= SEL.x1; xx++) row.push([xx, yy, zz]);
        if ((yy - SEL.y0) % 2) row.reverse(); queue = queue.concat(row);
      }
    }
    var TOTAL = (SEL.x1 - SEL.x0 + 1) * (SEL.y1 - SEL.y0 + 1) * (SEL.z1 - SEL.z0 + 1);
    function P(x, y, z) { return [OX + (x - y) * W, OY + (x + y) * W / 2 - z * W]; }
    function resize() {
      var b = stage.getBoundingClientRect(); DPR = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(b.width * DPR); cv.height = Math.round(b.height * DPR);
      var pad = 10 * DPR, cw = cv.width, ch = cv.height;
      W = Math.min((cw - 2 * pad) / (2 * N), (ch - 2 * pad) / (N + 1 + H + 1.2));
      OX = cw / 2; OY = pad + (H + 1.2) * W;
    }
    function shade(c, f, v) { return "rgb(" + c.map(function (n) { return Math.max(0, Math.min(255, Math.round(n * f * (1 + v)))); }).join(",") + ")"; }
    function poly(pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); }
    function has(x, y, z) { var b = world[key(x, y, z)]; return b && b.drop < 0.5; }
    var mining = null, mineT = 0;
    function drawBlock(b, t) {
      var p = P(b.x, b.y, b.z), sx = p[0], sy = p[1] - W - b.drop * 3 * W;
      var c = COL[b.k], v = b.v + (b.k === "lava" ? Math.sin(t / 300 + b.x) * .12 : 0);
      ctx.globalAlpha = 1 - b.drop;
      ctx.strokeStyle = "rgba(0,0,0,.22)"; ctx.lineWidth = Math.max(1, DPR * .8);
      if (!has(b.x, b.y, b.z + 1)) poly([[sx, sy], [sx + W, sy + W / 2], [sx, sy + W], [sx - W, sy + W / 2]], shade(c, 1, v));
      if (!has(b.x, b.y + 1, b.z)) poly([[sx - W, sy + W / 2], [sx, sy + W], [sx, sy + 2 * W], [sx - W, sy + 1.5 * W]], shade(b.k === "grass" ? COL.dirt : c, .74, v));
      if (!has(b.x + 1, b.y, b.z)) poly([[sx, sy + W], [sx + W, sy + W / 2], [sx + W, sy + 1.5 * W], [sx, sy + 2 * W]], shade(b.k === "grass" ? COL.dirt : c, .58, v));
      if (b.k === "grass" && !has(b.x, b.y, b.z + 1)) { // grass lip on sides
        ctx.fillStyle = shade(COL.grass, .8, 0);
        if (!has(b.x, b.y + 1, b.z)) { ctx.beginPath(); ctx.moveTo(sx - W, sy + W / 2); ctx.lineTo(sx, sy + W); ctx.lineTo(sx, sy + W * 1.22); ctx.lineTo(sx - W, sy + W * .72); ctx.fill(); }
        if (!has(b.x + 1, b.y, b.z)) { ctx.fillStyle = shade(COL.grass, .66, 0); ctx.beginPath(); ctx.moveTo(sx, sy + W); ctx.lineTo(sx + W, sy + W / 2); ctx.lineTo(sx + W, sy + W * .72); ctx.lineTo(sx, sy + W * 1.22); ctx.fill(); }
      }
      if (mining && mining.x === b.x && mining.y === b.y && mining.z === b.z) {
        ctx.fillStyle = "rgba(255,255,255," + (0.15 + 0.45 * mineT) + ")";
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + W, sy + W / 2); ctx.lineTo(sx + W, sy + 1.5 * W); ctx.lineTo(sx, sy + 2 * W); ctx.lineTo(sx - W, sy + 1.5 * W); ctx.lineTo(sx - W, sy + W / 2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = Math.max(1, DPR); ctx.beginPath();
        var k = mineT * W * .5; ctx.moveTo(sx - k, sy + W / 2 - k / 3); ctx.lineTo(sx, sy + W / 2); ctx.lineTo(sx + k, sy + W / 2 + k / 4); ctx.moveTo(sx, sy + W / 2); ctx.lineTo(sx + k / 3, sy + W / 2 - k / 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    function wire(t) {
      var c = [], s = SEL, x, y, z;
      function Q(x, y, z) { var p = P(x, y, z - 1); return [p[0], p[1] - W]; }
      var xs = [s.x0, s.x1 + 1], ys = [s.y0, s.y1 + 1], zs = [s.z0, s.z1 + 1];
      ctx.save(); ctx.strokeStyle = "#ff4fd8"; ctx.lineWidth = 2.2 * DPR; ctx.setLineDash([7 * DPR, 6 * DPR]); ctx.lineDashOffset = -t / 40;
      ctx.shadowColor = "rgba(255,79,216,.8)"; ctx.shadowBlur = 8 * DPR;
      for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) for (var d = 0; d < 2; d++) {
        var p0 = Q(xs[a], ys[b], zs[d]);
        if (!a) { var p1 = Q(xs[1], ys[b], zs[d]); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
        if (!b) { var p2 = Q(xs[a], ys[1], zs[d]); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); }
        if (!d) { var p3 = Q(xs[a], ys[b], zs[1]); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p3[0], p3[1]); ctx.stroke(); }
      }
      ctx.restore();
    }
    var bot = { x: 0, y: 0 };
    function drawBot(t, tx, ty) {
      bot.x += (tx - bot.x) * .18; bot.y += (ty - bot.y) * .18;
      var bx = bot.x, by = bot.y + Math.sin(t / 220) * W * .12, s = W * .55;
      if (mining) { // beam
        var p = P(mining.x, mining.y, mining.z);
        ctx.save(); ctx.strokeStyle = "rgba(255,79,216,.75)"; ctx.lineWidth = 2 * DPR; ctx.setLineDash([3 * DPR, 3 * DPR]);
        ctx.beginPath(); ctx.moveTo(bx, by + s); ctx.lineTo(p[0], p[1] - W / 2); ctx.stroke(); ctx.restore();
      }
      ctx.strokeStyle = "#000"; ctx.lineWidth = DPR * 1.2;
      poly([[bx, by - s], [bx + s, by - s / 2], [bx, by], [bx - s, by - s / 2]], "#3a3b42");
      poly([[bx - s, by - s / 2], [bx, by], [bx, by + s], [bx - s, by + s / 2]], "#1f2025");
      poly([[bx, by], [bx + s, by - s / 2], [bx + s, by + s / 2], [bx, by + s]], "#16171b");
      ctx.fillStyle = "#ff4fd8"; ctx.shadowColor = "#ff4fd8"; ctx.shadowBlur = 10 * DPR;
      ctx.beginPath(); ctx.moveTo(bx - s * .8, by - s * .1); ctx.lineTo(bx - s * .15, by + s * .22); ctx.lineTo(bx - s * .15, by + s * .42); ctx.lineTo(bx - s * .8, by + s * .1); ctx.fill();
      ctx.shadowBlur = 0;
    }
    function burst(b) {
      var p = P(b.x, b.y, b.z), c = COL[b.k];
      for (var i = 0; i < 9; i++) parts.push({ x: p[0] + (r() - .5) * W, y: p[1] - W / 2 + (r() - .5) * W * .6, vx: (r() - .5) * 3 * DPR, vy: -(1 + r() * 3) * DPR, life: 1, c: shade(c, .7 + r() * .5, 0) });
    }
    // chat
    function line(html, cls) { var d = document.createElement("div"); if (cls) d.className = cls; d.innerHTML = html; chat.appendChild(d); while (chat.children.length > 5) chat.removeChild(chat.firstChild); return d; }
    var prog = null;
    // state machine
    var phase = "type", pt = 0, qi = 0, last = 0, running = false, typed = 0;
    var CMDS = ["#sel 1", "#sel 2", "#sel cleararea"];
    function reset() { build(); phase = "type"; pt = 0; qi = 0; typed = 0; mining = null; removed = []; chat.innerHTML = ""; prog = null; }
    function step(dt, t) {
      pt += dt;
      if (phase === "type") {
        var due = Math.floor(pt / 650);
        while (typed < Math.min(due, 3)) { line('<span class="you">&lt;Ты&gt;</span> <span class="cmd">' + CMDS[typed] + "</span>"); typed++; }
        if (pt > 2300) { phase = "dig"; pt = 0; prog = line('[Baritone] Копаю: 0/' + TOTAL + ' <span class="bar"><i></i></span>', "sys"); }
      } else if (phase === "dig") {
        if (!mining) { if (qi >= queue.length) { phase = "done"; pt = 0; line("[Baritone] Готово. Зона чистая.", "sys"); return; } var q = queue[qi]; mining = world[key(q[0], q[1], q[2])]; mineT = 0; }
        mineT += dt / 95;
        if (mineT >= 1) {
          burst(mining); delete world[key(mining.x, mining.y, mining.z)]; removed.push(mining); mining = null; qi++;
          if (prog) { prog.firstChild.nodeValue = "[Baritone] Копаю: " + qi + "/" + TOTAL + " "; prog.querySelector("i").style.width = (qi / TOTAL * 100) + "%"; }
        }
      } else if (phase === "done") {
        if (pt > 2200) { phase = "regrow"; pt = 0; removed.forEach(function (b, i) { b.drop = 1; b.delay = (removed.length - i) * 7; world[key(b.x, b.y, b.z)] = b; }); }
      } else if (phase === "regrow") {
        var all = true;
        removed.forEach(function (b) { if (pt > b.delay) b.drop = Math.max(0, b.drop - dt / 380); if (b.drop > 0) all = false; });
        if (all && pt > 400) { reset(); }
      }
    }
    function render(t) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (var i = 0; i < order.length; i++) { var o = order[i], b = world[key(o[0], o[1], o[2])]; if (b && b.drop < 1) drawBlock(b, t); }
      wire(t);
      for (var j = parts.length - 1; j >= 0; j--) { var p = parts[j]; p.x += p.vx; p.y += p.vy; p.vy += .25 * DPR; p.life -= .03; if (p.life <= 0) { parts.splice(j, 1); continue; } ctx.globalAlpha = p.life; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, W / 5, W / 5); }
      ctx.globalAlpha = 1;
      var tgt = mining || (queue[Math.min(qi, queue.length - 1)] && world[key.apply(null, queue[Math.min(qi, queue.length - 1)])]) || { x: SEL.x0, y: SEL.y0, z: SEL.z1 };
      var tp = P(tgt.x, tgt.y, tgt.z + 2.4);
      if (!bot.x) { bot.x = tp[0]; bot.y = tp[1]; }
      drawBot(t, tp[0], tp[1]);
    }
    function frame(t) {
      if (!running) return;
      var dt = Math.min(50, t - (last || t)); last = t;
      step(dt, t); render(t);
      requestAnimationFrame(frame);
    }
    build(); resize();
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); if (!running) render(performance.now()); }).observe(stage);
    if (reduce) {
      for (var k = 0; k < TOTAL / 2; k++) { var q = queue[k]; delete world[key(q[0], q[1], q[2])]; } qi = TOTAL / 2; render(0);
    } else {
      chat.innerHTML = "";
      var start = function () { if (!running) { running = true; last = 0; requestAnimationFrame(frame); } };
      var stop = function () { running = false; };
      if (window.IntersectionObserver) new IntersectionObserver(function (es) { es[0].isIntersecting ? start() : stop(); }).observe(stage); else start();
      document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
    }
  }

  /* ---------- depth: Y readout, gauge, menu ---------- */
  var secs = [].slice.call(document.querySelectorAll("main > section[data-y]"));
  var yval = document.getElementById("yval"), gbot = document.getElementById("gbot");
  var glinks = [].slice.call(document.querySelectorAll(".gauge a")), mlinks = [].slice.call(document.querySelectorAll(".depth-menu a"));
  function fmt(y) { y = Math.round(y); return "Y " + (y < 0 ? "−" + (-y) : y); }
  function placeGauge() {
    var dh = document.documentElement.scrollHeight - innerHeight;
    glinks.forEach(function (a) { var s = document.getElementById(a.dataset.sec); if (s) a.style.top = Math.min(100, Math.max(0, (s.offsetTop / Math.max(1, dh)) * 100)) + "%"; });
  }
  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var probe = scrollY + innerHeight * .35, cur = 0;
      for (var i = 0; i < secs.length; i++) if (secs[i].offsetTop <= probe) cur = i;
      var a = secs[cur], b = secs[cur + 1], ya = +a.dataset.y, y = ya;
      var aTop = cur === 0 ? innerHeight * .35 : a.offsetTop;
      if (b) { var f = (probe - aTop) / Math.max(1, b.offsetTop - aTop); y = ya + (+b.dataset.y - ya) * Math.min(1, Math.max(0, f)); }
      if (scrollY + innerHeight >= document.documentElement.scrollHeight - 4) { y = -64; cur = secs.length - 1; }
      if (yval) yval.textContent = fmt(y);
      var dh = document.documentElement.scrollHeight - innerHeight;
      if (gbot) gbot.style.top = (Math.min(1, scrollY / Math.max(1, dh)) * 100) + "%";
      var id = secs[cur].id;
      glinks.concat(mlinks).forEach(function (l) { l.classList.toggle("on", l.dataset.sec === id); });
    });
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", function () { placeGauge(); onScroll(); });
  addEventListener("load", function () { placeGauge(); onScroll(); });
  placeGauge(); onScroll();

  var ytag = document.getElementById("ytag"), menu = document.getElementById("depthMenu");
  function setMenu(open) { if (!menu) return; menu.hidden = !open; ytag.setAttribute("aria-expanded", open ? "true" : "false"); }
  if (ytag) ytag.addEventListener("click", function (e) { e.stopPropagation(); setMenu(menu.hidden); });
  mlinks.forEach(function (l) { l.addEventListener("click", function () { setMenu(false); }); });
  document.addEventListener("click", function (e) { if (menu && !menu.hidden && !menu.contains(e.target)) setMenu(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

  /* ---------- copy ---------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".copy"); if (!b) return;
    var txt = b.getAttribute("data-copy"), old = b.textContent;
    function done(ok) { b.textContent = ok ? "✓" : "выдели"; b.classList.toggle("ok", ok); setTimeout(function () { b.textContent = old; b.classList.remove("ok"); }, 1300); }
    function fallback() { try { var t = document.createElement("textarea"); t.value = txt; t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select(); var ok = document.execCommand("copy"); document.body.removeChild(t); done(ok); } catch (er) { done(false); } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { done(true); }, fallback); else fallback();
  });

  /* ---------- command console ---------- */
  var cq = document.getElementById("cq"), cbody = document.getElementById("cbody"), ccount = document.getElementById("ccount"), cempty = document.getElementById("cempty");
  if (cq && cbody) {
    var cat = "all", chips = [].slice.call(document.querySelectorAll(".chip")), groups = [].slice.call(cbody.querySelectorAll(".cgroup"));
    var total = cbody.querySelectorAll(".crow").length;
    function filter() {
      var q = cq.value.trim().toLowerCase().replace(/^#/, ""), n = 0;
      groups.forEach(function (g) {
        var vis = 0, okCat = cat === "all" || g.dataset.cat === cat;
        [].forEach.call(g.querySelectorAll(".crow"), function (row) { var ok = okCat && (!q || row.dataset.s.indexOf(q) > -1); row.hidden = !ok; if (ok) vis++; });
        g.hidden = !vis; n += vis;
      });
      ccount.textContent = (q || cat !== "all") ? n + " из " + total : total + " команд";
      cempty.hidden = n > 0;
    }
    cq.addEventListener("input", filter);
    chips.forEach(function (c) { c.addEventListener("click", function () { cat = c.dataset.cat; chips.forEach(function (x) { x.setAttribute("aria-pressed", x === c ? "true" : "false"); }); cbody.scrollTop = 0; filter(); }); });
    [].forEach.call(document.querySelectorAll(".feat"), function (f) {
      f.addEventListener("click", function () {
        cq.value = f.dataset.q; cat = "all"; chips.forEach(function (x) { x.setAttribute("aria-pressed", x.dataset.cat === "all" ? "true" : "false"); });
        filter(); cbody.scrollTop = 0; document.querySelector(".console").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      });
    });
  }

  /* ---------- x-ray modes ---------- */
  var xg = document.getElementById("xgrid"), xi = document.getElementById("xinfo");
  [].forEach.call(document.querySelectorAll(".seg button"), function (b, _, all) {
    b.addEventListener("click", function () {
      var m = b.dataset.x; xg.dataset.show = m; xi.dataset.show = m;
      [].forEach.call(document.querySelectorAll(".seg button"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      [].forEach.call(xg.querySelectorAll(".path"), function (p) { p.style.animation = "none"; p.getBoundingClientRect(); p.style.animation = ""; });
    });
  });
})();
