/* baricom — command simulator: a tiny isometric voxel world where the bot acts out every command */
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var COL = {
    grass: [94, 158, 63], dirt: [122, 84, 52], stone: [125, 128, 132], deep: [86, 88, 94], ore: [125, 128, 132], iron: [125, 128, 132],
    lava: [255, 120, 30], plank: [184, 140, 86], log: [110, 78, 45], cobble: [112, 114, 118], glass: [170, 220, 236], chest: [190, 128, 52],
    table: [160, 104, 58], nrack: [150, 56, 56], basalt: [62, 60, 68], farmland: [92, 62, 40], wool: [232, 232, 232], ghost: [255, 79, 216],
    gold: [255, 204, 77], sand: [222, 206, 150]
  };
  var SPECK = { ore: "#4ee8f0", iron: "#e0b394", gold: "#ffd84d" };
  function rgba(c, f, a) { return "rgba(" + Math.max(0, Math.min(255, Math.round(c[0] * f))) + "," + Math.max(0, Math.min(255, Math.round(c[1] * f))) + "," + Math.max(0, Math.min(255, Math.round(c[2] * f))) + "," + (a == null ? 1 : a) + ")"; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lp(p, q, t) { return [lerp(p[0], q[0], t), lerp(p[1], q[1], t)]; }
  function fpt(f, u, v) { return lp(lp(f[0], f[1], u), lp(f[3], f[2], u), v); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  function Sim(cv, chat) {
    this.cv = cv; this.ctx = cv.getContext("2d"); this.chat = chat; this.N = 12; this.Z = 8; this.DPR = 1; this.dt = 16; this.t = 0;
    this.clear();
  }
  var S = Sim.prototype;

  /* ---------------- world ---------------- */
  S.key = function (x, y, z) { return x + "," + y + "," + z; };
  S.clear = function (o) {
    o = o || {};
    this.blocks = {}; this.ents = []; this.parts = []; this.boxes = []; this.beacons = []; this.labels = []; this.tints = {}; this.crops = {};
    this.fog = null; this.chunks = null; this.xray = false; this.hold = false; this.stopAll = false; this.mining = null; this.flashA = 0; this.flashC = "#fff"; this.marks = [];
    var L = o.layers || 3, pal = o.pal || "normal";
    for (var x = 0; x < this.N; x++) for (var y = 0; y < this.N; y++) for (var z = 0; z < L; z++) {
      var k = z === L - 1 ? "grass" : z === L - 2 ? "dirt" : "stone";
      if (pal === "nether") k = z === 0 ? "basalt" : "nrack";
      this.set(x, y, z, k);
    }
    this.ground = L;
  };
  S.set = function (x, y, z, k, o) {
    var b = { x: x, y: y, z: z, k: k, v: (Math.sin(x * 12.9 + y * 78.2 + z * 37.7) * 43758.5 % 1) * .12, drop: 0, crack: 0, flash: 0, ghost: false, hl: null, hide: false };
    if (o) for (var p in o) b[p] = o[p];
    this.blocks[this.key(x, y, z)] = b; return b;
  };
  S.get = function (x, y, z) { return this.blocks[this.key(x, y, z)]; };
  S.del = function (x, y, z) { delete this.blocks[this.key(x, y, z)]; };
  S.solid = function (x, y, z) { var b = this.blocks[this.key(x, y, z)]; return !!(b && !b.ghost && !b.hide && b.drop < .35); };
  S.surf = function (x, y) { for (var z = this.Z; z >= 0; z--) if (this.solid(x, y, z)) return z + 1; return 0; };
  S.floorAt = function (x, y, zf) {
    if (x < 0 || y < 0 || x >= this.N || y >= this.N) return zf;
    for (var z = Math.min(this.Z, Math.floor(zf + .01) + 1); z >= 0; z--) if (this.solid(x, y, z)) return z + 1;
    return 0;
  };

  /* ---------------- entities & overlays ---------------- */
  S.add = function (type, x, y, o) {
    var e = { type: type, x: x + .5, y: y + .5, z: 0, bob: Math.random() * 6 };
    if (o) for (var p in o) e[p] = o[p];
    if (o && o.z != null) e.z = o.z; else e.z = this.surf(x, y);
    this.ents.push(e); return e;
  };
  S.bot = function (x, y, z) { return this.B = this.add("bot", x, y, z != null ? { z: z } : null); };
  S.remove = function (e) { var i = this.ents.indexOf(e); if (i > -1) this.ents.splice(i, 1); };
  S.beacon = function (x, y, c) { var b = { x: x, y: y, c: c || "#ff4fd8", a: 1 }; this.beacons.push(b); return b; };
  S.label = function (x, y, z, text, c) { var l = { x: x, y: y, z: z, text: text, c: c || "#efeadf", a: 1 }; this.labels.push(l); return l; };
  S.tint = function (x, y, c, a, small) { this.tints[x + "," + y] = { c: c, a: a == null ? .5 : a, small: !!small }; };
  S.untint = function (x, y) { delete this.tints[x + "," + y]; };
  S.dots = function (pts, c) { for (var i = 0; i < pts.length; i++) this.tint(pts[i][0], pts[i][1], c || "#ff4fd8", .9, true); };
  S.box = function (x0, y0, z0, x1, y1, z1, c) { var b = { x0: x0, y0: y0, z0: z0, x1: x1, y1: y1, z1: z1, c: c || "#ff4fd8", a: 1 }; this.boxes.push(b); return b; };
  S.mark = function (x, y, z, c, text) { var m = { x: x, y: y, z: z, c: c, text: text, a: 1, t: 0 }; this.marks.push(m); return m; };
  S.flag = function (x, y, name, c) { return this.add("flag", x, y, { label: name, c: c || [255, 79, 216], pop: 0 }); };
  S.route = function (a, b) { var p = [], x = a[0], y = a[1]; while (x !== b[0]) { x += Math.sign(b[0] - x); p.push([x, y]); } while (y !== b[1]) { y += Math.sign(b[1] - y); p.push([x, y]); } return p; };
  S.chain = function (pts) { var out = []; for (var i = 1; i < pts.length; i++) out = out.concat(this.route(pts[i - 1], pts[i])); return out; };
  S.tile = function (e) { return [Math.floor(e.x), Math.floor(e.y)]; };

  /* ---------------- chat ---------------- */
  S.line = function (html, cls) {
    var d = document.createElement("div"); if (cls) d.className = cls; d.innerHTML = html; this.chat.appendChild(d);
    while (this.chat.children.length > 5) this.chat.removeChild(this.chat.firstChild);
    return d;
  };
  S.log = function (t, cls) { return this.line(esc(t), cls || "sys"); };

  /* ---------------- coroutine helpers ---------------- */
  S.wait = function* (ms) { var t = 0; while (t < ms) { t += this.dt; yield; } };
  S.type = function* (text) {
    text = text || this.cmd;
    var d = this.line('<span class="you">&lt;Ты&gt;</span> <span class="cmd"></span>'), sp = d.querySelector(".cmd");
    for (var i = 1; i <= text.length; i++) { sp.textContent = text.slice(0, i); yield* this.wait(22); }
    yield* this.wait(260);
  };
  S.walk = function* (e, pts, speed) {
    speed = speed || 3.6;
    for (var i = 0; i < pts.length; i++) {
      var tx = pts[i][0] + .5, ty = pts[i][1] + .5, sx = e.x, sy = e.y, d = Math.hypot(tx - sx, ty - sy);
      if (d < 1e-3) continue;
      var t = 0;
      while (t < 1) {
        if (e.halt) return;
        if (!this.hold) { t = Math.min(1, t + speed * this.dt / 1000 / d); e.x = lerp(sx, tx, t); e.y = lerp(sy, ty, t); }
        yield;
      }
      this.untintSmall(pts[i][0], pts[i][1]);
    }
  };
  S.untintSmall = function (x, y) { var t = this.tints[x + "," + y]; if (t && t.small) delete this.tints[x + "," + y]; };
  S.jump = function* (e, to, h) {
    var sx = e.x, sy = e.y, sz = e.z, tx = to[0] + .5, ty = to[1] + .5, t = 0; e.air = true;
    while (t < 1) { t = Math.min(1, t + this.dt / 520); var tz = this.floorAt(to[0], to[1], sz + 1); e.x = lerp(sx, tx, t); e.y = lerp(sy, ty, t); e.z = lerp(sz, tz, t) + Math.sin(Math.PI * t) * (h || 1.2); if (e.onJump) e.onJump(t); yield; }
    e.air = false;
  };
  S.hover = function (e, x, y, z) { e.hov = [x + .5, y + .5, z]; };
  S.dig = function* (x, y, z, ms) {
    var b = this.get(x, y, z); if (!b) return; ms = ms || 170; this.mining = b; var t = 0;
    while (t < ms) { if (this.stopAll) { b.crack = 0; this.mining = null; return; } if (!this.hold) t += this.dt; b.crack = t / ms; yield; }
    this.burst(b); this.del(x, y, z); this.mining = null;
  };
  S.put = function* (x, y, z, k, ms, o) {
    var b = this.set(x, y, z, k, o); b.drop = 1; ms = ms || 110; var t = 0;
    while (t < ms) { if (!this.hold) t += this.dt; b.drop = Math.max(0, 1 - t / ms); yield; }
    b.drop = 0;
  };
  S.par = function* () {
    var gs = [].slice.call(arguments);
    while (true) { var alive = false; for (var i = 0; i < gs.length; i++) { if (gs[i]) { if (gs[i].next().done) gs[i] = null; else alive = true; } } if (!alive) return; yield; }
  };
  S.chase = function* (e, target, dist, ms, speed) {
    var t = 0; speed = speed || 3.4;
    while (t < ms) {
      t += this.dt; var tg = typeof target === "function" ? target() : target;
      var dx = tg.x - e.x, dy = tg.y - e.y, d = Math.hypot(dx, dy);
      if (d > dist) { var s = Math.min(d - dist, speed * this.dt / 1000); e.x += dx / d * s; e.y += dy / d * s; }
      yield;
    }
  };
  S.fade = function* (o, ms) { ms = ms || 400; var t = 0; while (t < ms) { t += this.dt; o.a = Math.max(0, 1 - t / ms); yield; } };
  S.collect = function (b, to) { var it = this.add("item", b.x, b.y, { z: b.z + .3, k: b.k, fly: to || this.B, ft: 0 }); return it; };
  S.burst = function (b, n) {
    var c = b.k === "ore" ? [78, 232, 240] : (COL[b.k] || COL.stone);
    for (var i = 0; i < (n || 10); i++) this.parts.push({ wx: b.x + .5, wy: b.y + .5, wz: b.z + .6, vx: (Math.random() - .5) * .07, vy: (Math.random() - .5) * .07, vz: Math.random() * .09 + .02, life: 1, c: rgba(c, .75 + Math.random() * .45), s: .14 + Math.random() * .1 });
  };
  S.sparkle = function (x, y, z, c, n) {
    for (var i = 0; i < (n || 14); i++) this.parts.push({ wx: x, wy: y, wz: z, vx: (Math.random() - .5) * .09, vy: (Math.random() - .5) * .09, vz: Math.random() * .1, life: 1, c: c || "#ffcc4d", s: .1 });
  };
  S.flash = function (c) { this.flashA = .55; this.flashC = c || "#fff"; };
  S.many = function* (list, fn) { for (var i = 0; i < list.length; i++) yield* fn.call(this, list[i], i); };

  /* ---------------- projection & drawing ---------------- */
  S.resize = function () {
    var r = this.cv.getBoundingClientRect(); this.DPR = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.max(10, Math.round(r.width * this.DPR)); this.cv.height = Math.max(10, Math.round(r.height * this.DPR));
    var pad = 8 * this.DPR, cw = this.cv.width, ch = this.cv.height;
    this.W = Math.min((cw - 2 * pad) / (2 * this.N), (ch - 2 * pad) / (this.N + this.Z - 1.5));
    this.OX = cw / 2; this.OY = pad + (this.Z - 1.2) * this.W + (ch - 2 * pad - (this.N + this.Z - 1.5) * this.W) / 2;
  };
  S.P = function (x, y, z) { return [this.OX + (x - y) * this.W, this.OY + (x + y) * this.W / 2 - z * this.W]; };
  S.poly = function (pts, fill, stroke, lw) {
    var c = this.ctx; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || this.DPR * .8; c.stroke(); }
  };
  S.faces = function (x, y, z, sx, sy, sz) {
    var P = this.P.bind(this);
    return { top: [P(x, y, z + sz), P(x + sx, y, z + sz), P(x + sx, y + sy, z + sz), P(x, y + sy, z + sz)],
      left: [P(x, y + sy, z + sz), P(x + sx, y + sy, z + sz), P(x + sx, y + sy, z), P(x, y + sy, z)],
      right: [P(x + sx, y, z + sz), P(x + sx, y + sy, z + sz), P(x + sx, y + sy, z), P(x + sx, y, z)] };
  };
  S.cube = function (x, y, z, sx, sy, sz, col, o) {
    o = o || {}; var f = this.faces(x, y, z, sx, sy, sz), a = o.a == null ? 1 : o.a, v = o.v || 0, st = o.st === undefined ? "rgba(0,0,0," + (.25 * a) + ")" : o.st;
    if (o.top !== false) this.poly(f.top, rgba(o.tc || col, 1 + v, a), st);
    if (o.left !== false) this.poly(f.left, rgba(o.sc || col, .74 + v * .7, a), st);
    if (o.right !== false) this.poly(f.right, rgba(o.sc || col, .58 + v * .6, a), st);
    return f;
  };
  S.drawBlock = function (b) {
    if (b.hide) return;
    var x = b.x, y = b.y, z = b.z + b.drop * 1.4, k = b.k, c = COL[k] || COL.stone, ctx = this.ctx;
    if (b.ghost) {
      var gf = this.faces(x, y, z, 1, 1, 1), gc = COL[k] || COL.ghost, pulse = .5 + .25 * Math.sin(this.t / 300);
      ["top", "left", "right"].forEach(function (n) { this.poly(gf[n], rgba(gc, 1, .14), "rgba(255,79,216," + pulse + ")", this.DPR); }, this);
      return;
    }
    var top = !this.solid(x, y, b.z + 1), left = !this.solid(x, y + 1, b.z), right = !this.solid(x + 1, y, b.z);
    if (b.drop > 0) top = left = right = true;
    if (!top && !left && !right) return;
    var a = b.drop ? 1 - b.drop * .7 : 1, sc = (k === "grass" || k === "farmland") ? COL.dirt : c;
    var lv = k === "lava" ? Math.sin(this.t / 260 + x + y) * .12 : 0;
    var f = this.cube(x, y, z, 1, 1, 1, c, { top: top, left: left, right: right, a: a, v: b.v + lv, sc: sc });
    var self = this;
    function q(face, u0, v0, u1, v1, col) { self.poly([fpt(face, u0, v0), fpt(face, u1, v0), fpt(face, u1, v1), fpt(face, u0, v1)], col); }
    if (k === "grass") { if (left) q(f.left, 0, 0, 1, .24, rgba(COL.grass, .8, a)); if (right) q(f.right, 0, 0, 1, .24, rgba(COL.grass, .66, a)); }
    if (SPECK[k]) {
      var sp = SPECK[k], pts = [[.18, .2], [.6, .15], [.35, .55], [.72, .62], [.15, .78]];
      ["top", "left", "right"].forEach(function (n) { if ((n === "top" && top) || (n === "left" && left) || (n === "right" && right)) pts.forEach(function (p) { q(f[n], p[0], p[1], p[0] + .16, p[1] + .16, sp); }); });
    }
    if (k === "table" && top) { q(f.top, .1, .1, .9, .9, rgba([120, 80, 45], 1, a)); q(f.top, .45, .1, .55, .9, rgba([200, 150, 90], 1, a)); q(f.top, .1, .45, .9, .55, rgba([200, 150, 90], 1, a)); }
    if (k === "chest") { if (left) q(f.left, .42, .3, .58, .5, "#3a2a14"); if (top) q(f.top, .05, .05, .95, .95, rgba([210, 150, 70], 1, a)); }
    if (k === "glass") { ["top", "left", "right"].forEach(function (n) { if (f[n]) q(f[n], .2, .2, .8, .8, "rgba(255,255,255,.35)"); }); }
    if (k === "farmland" && top) { for (var i = 0; i < 3; i++) q(f.top, .1, .12 + i * .3, .9, .2 + i * .3, rgba([70, 46, 30], 1, a)); }
    if (k === "plank") { if (left) { q(f.left, 0, .48, 1, .52, rgba([140, 100, 58], 1, a)); } if (right) q(f.right, 0, .48, 1, .52, rgba([120, 86, 50], 1, a)); }
    if (b.flash > 0) { ["top", "left", "right"].forEach(function (n) { self.poly(f[n], "rgba(255,255,255," + (b.flash * .7) + ")"); }); b.flash = Math.max(0, b.flash - this.dt / 500); }
    if (b.crack > 0) {
      ["top", "left", "right"].forEach(function (n) { self.poly(f[n], "rgba(255,255,255," + (.12 + b.crack * .35) + ")"); });
      ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = this.DPR * 1.2; ctx.beginPath();
      var m = fpt(f.left, .5, .5), r = b.crack * .45;
      [[0, 0], [1, .2], [.2, 1], [.9, .9]].forEach(function (d) { var e = fpt(f.left, .5 + (d[0] - .5) * r * 2, .5 + (d[1] - .5) * r * 2); ctx.moveTo(m[0], m[1]); ctx.lineTo(e[0], e[1]); });
      ctx.stroke();
    }
    if (b.hl) {
      var pul = .55 + .45 * Math.sin(this.t / 180);
      ctx.save(); ctx.shadowColor = b.hl; ctx.shadowBlur = 10 * this.DPR;
      ["top", "left", "right"].forEach(function (n) { self.poly(f[n], null, b.hl, 2 * self.DPR * pul + self.DPR); });
      ctx.restore();
    }
  };
  S.drawEnt = function (e) {
    var ctx = this.ctx, t = this.t, self = this, z;
    if (e.ring) { var cp = this.P(e.x, e.y, e.z + .02), rr = e.ring * this.W * Math.SQRT2; ctx.save(); ctx.strokeStyle = e.ringC || "rgba(255,79,216,.75)"; ctx.setLineDash([5 * this.DPR, 5 * this.DPR]); ctx.lineDashOffset = -t / 40; ctx.lineWidth = 2 * this.DPR; ctx.beginPath(); ctx.ellipse(cp[0], cp[1], rr, rr / 2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    if (e.type === "bot") {
      var s = .6; z = e.z + .22 + Math.sin(t / 230 + e.bob) * .07;
      if (e.trail) { e.trail.forEach(function (p, i) { self.cube(p[0] - s / 2, p[1] - s / 2, p[2], s, s, s, [255, 79, 216], { a: .1 + i * .05, st: null }); }); }
      if (e.wings) { var w0 = this.P(e.x, e.y, z + s * .8), wf = Math.sin(t / 90) * .25; ctx.fillStyle = "rgba(200,200,215,.85)"; ctx.beginPath(); ctx.moveTo(w0[0], w0[1]); ctx.lineTo(w0[0] - this.W * 1.3, w0[1] - this.W * (.5 + wf)); ctx.lineTo(w0[0] - this.W * .4, w0[1] + this.W * .3); ctx.fill(); ctx.beginPath(); ctx.moveTo(w0[0], w0[1]); ctx.lineTo(w0[0] + this.W * 1.3, w0[1] - this.W * (.5 + wf)); ctx.lineTo(w0[0] + this.W * .4, w0[1] + this.W * .3); ctx.fill(); }
      var f = this.cube(e.x - s / 2, e.y - s / 2, z, s, s, s, [46, 47, 56], { st: "rgba(0,0,0,.8)" });
      ctx.save(); ctx.shadowColor = "#ff4fd8"; ctx.shadowBlur = 8 * this.DPR;
      this.poly([fpt(f.left, .12, .38), fpt(f.left, .88, .38), fpt(f.left, .88, .58), fpt(f.left, .12, .58)], e.paused ? "#ffcc4d" : "#ff4fd8");
      this.poly([fpt(f.right, .15, .38), fpt(f.right, .45, .38), fpt(f.right, .45, .58), fpt(f.right, .15, .58)], e.paused ? "#ffcc4d" : "#ff4fd8");
      ctx.restore();
      if (this.mining) { var mp = this.P(this.mining.x + .5, this.mining.y + .5, this.mining.z + .5), bp = this.P(e.x, e.y, z); ctx.save(); ctx.strokeStyle = "rgba(255,79,216,.8)"; ctx.lineWidth = 2 * this.DPR; ctx.setLineDash([3 * this.DPR, 3 * this.DPR]); ctx.beginPath(); ctx.moveTo(bp[0], bp[1]); ctx.lineTo(mp[0], mp[1]); ctx.stroke(); ctx.restore(); }
    } else if (e.type === "player" || e.type === "mob") {
      z = e.z; var body = e.type === "mob" ? [96, 60, 140] : (e.c || [59, 130, 246]), skin = e.type === "mob" ? [120, 80, 170] : [232, 180, 138];
      this.cube(e.x - .2, e.y - .13, z, .4, .26, .7, [45, 52, 90]);
      this.cube(e.x - .25, e.y - .16, z + .7, .5, .32, .62, body);
      var hf = this.cube(e.x - .21, e.y - .21, z + 1.32, .42, .42, .42, skin);
      var eye = e.type === "mob" ? "#ff4a4a" : "#2a2a30";
      this.poly([fpt(hf.left, .2, .4), fpt(hf.left, .38, .4), fpt(hf.left, .38, .55), fpt(hf.left, .2, .55)], eye);
      this.poly([fpt(hf.left, .62, .4), fpt(hf.left, .8, .4), fpt(hf.left, .8, .55), fpt(hf.left, .62, .55)], eye);
    } else if (e.type === "pig") {
      z = e.z + .25; this.cube(e.x - .45, e.y - .28, z, .9, .56, .5, [240, 160, 176]);
      var pf = this.cube(e.x + .35, e.y - .22, z + .15, .38, .44, .42, [244, 170, 186]);
      this.poly([fpt(pf.right, .3, .5), fpt(pf.right, .7, .5), fpt(pf.right, .7, .8), fpt(pf.right, .3, .8)], "#d8879a");
      this.cube(e.x - .35, e.y + .12, e.z, .16, .16, .25, [210, 140, 156]); this.cube(e.x + .2, e.y + .12, e.z, .16, .16, .25, [210, 140, 156]);
    } else if (e.type === "item") {
      z = e.z + .25 + Math.sin(t / 200 + e.bob) * .08; var ic = e.k === "ore" ? [78, 232, 240] : (COL[e.k] || COL.dirt);
      this.cube(e.x - .14, e.y - .14, z, .28, .28, .28, ic, { st: "rgba(0,0,0,.6)" });
    } else if (e.type === "flag") {
      z = e.z; var sc = Math.min(1, e.pop == null ? 1 : e.pop); this.cube(e.x - .05, e.y - .05, z, .1, .1, 1.5 * sc, [200, 200, 205]);
      var a0 = this.P(e.x, e.y, z + 1.5 * sc), a1 = this.P(e.x + .75 * sc, e.y - .05, z + 1.3 * sc), a2 = this.P(e.x, e.y, z + 1.08 * sc);
      ctx.fillStyle = rgba(e.c, 1, e.a == null ? 1 : e.a); ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1] + Math.sin(t / 150) * this.W * .05); ctx.lineTo(a2[0], a2[1]); ctx.fill();
    } else if (e.type === "grave") {
      z = e.z; this.cube(e.x - .3, e.y - .1, z, .6, .2, .75, [150, 150, 156]); this.cube(e.x - .06, e.y - .1, z + .75, .12, .2, .35, [150, 150, 156]); this.cube(e.x - .2, e.y - .1, z + .88, .4, .2, .1, [150, 150, 156]);
    }
  };
  S.overlay = function () {
    var ctx = this.ctx, t = this.t, self = this, D = this.DPR;
    // selection boxes
    this.boxes.forEach(function (b) {
      if (b.a <= 0) return;
      var xs = [b.x0, b.x1 + 1], ys = [b.y0, b.y1 + 1], zs = [b.z0, b.z1 + 1];
      ctx.save(); ctx.globalAlpha = b.a; ctx.strokeStyle = b.c; ctx.lineWidth = 2 * D; ctx.setLineDash([6 * D, 5 * D]); ctx.lineDashOffset = -t / 35; ctx.shadowColor = b.c; ctx.shadowBlur = 7 * D;
      for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) for (var k = 0; k < 2; k++) {
        var p = self.P(xs[i], ys[j], zs[k]);
        [[1 - i, j, k, i === 0], [i, 1 - j, k, j === 0], [i, j, 1 - k, k === 0]].forEach(function (q) { if (!q[3]) return; var r = self.P(xs[q[0]], ys[q[1]], zs[q[2]]); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(r[0], r[1]); ctx.stroke(); });
      }
      ctx.restore();
    });
    // x-ray outlines
    if (this.xray) {
      ctx.save(); ctx.shadowColor = "#4ee8f0"; ctx.shadowBlur = 10 * D; var pa = .5 + .4 * Math.sin(t / 200);
      for (var key in this.blocks) { var b = this.blocks[key]; if (b.k === "ore" || b.k === "iron") { var f = this.faces(b.x, b.y, b.z, 1, 1, 1); ["top", "left", "right"].forEach(function (n) { self.poly(f[n], null, "rgba(78,232,240," + pa + ")", 1.6 * D); }); } }
      ctx.restore();
    }
    // marks (X / ? / ring pulse)
    this.marks.forEach(function (m) {
      if (m.a <= 0) return; var p = self.P(m.x + .5, m.y + .5, m.z + .5), s = self.W * .45; ctx.save(); ctx.globalAlpha = m.a;
      if (m.text === "x") { ctx.strokeStyle = m.c; ctx.lineWidth = 4 * D; ctx.beginPath(); ctx.moveTo(p[0] - s, p[1] - s); ctx.lineTo(p[0] + s, p[1] + s); ctx.moveTo(p[0] + s, p[1] - s); ctx.lineTo(p[0] - s, p[1] + s); ctx.stroke(); }
      else if (m.text === "ping") { m.t = (m.t + self.dt / 900) % 1; ctx.strokeStyle = m.c; ctx.lineWidth = 3 * D; ctx.globalAlpha = m.a * (1 - m.t); ctx.beginPath(); ctx.ellipse(p[0], p[1], s * (1 + m.t * 2), s * (1 + m.t * 2) / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.fillStyle = m.c; ctx.font = "700 " + (self.W * .9) + "px JetBrains Mono, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(m.text, p[0], p[1]); }
      ctx.restore();
    });
    // eye / cursor / bubbles / labels
    this.ents.forEach(function (e) {
      if (e.type === "eye") { var p = self.P(e.x, e.y, e.z + 2.6 + Math.sin(t / 300) * .15), r = self.W * .55; ctx.save(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(p[0], p[1], r * 1.4, r, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#4ee8f0"; ctx.beginPath(); ctx.arc(p[0], p[1], r * .62, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(p[0], p[1], r * .3, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      if (e.type === "cursor") { var c = self.P(e.x, e.y, e.z), u = self.W * .9; ctx.save(); ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5 * D; ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + u); ctx.lineTo(c[0] + u * .28, c[1] + u * .74); ctx.lineTo(c[0] + u * .5, c[1] + u * 1.1); ctx.lineTo(c[0] + u * .62, c[1] + u * 1.02); ctx.lineTo(c[0] + u * .42, c[1] + u * .68); ctx.lineTo(c[0] + u * .78, c[1] + u * .66); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
      if (e.bubble) { var bp = self.P(e.x, e.y, e.z + (e.type === "player" ? 2.3 : 1.5)); self.pill(bp[0], bp[1], e.bubble, e.bubbleC || "#ffcc4d"); }
      if (e.label && e.type !== "bot") { var lp2 = self.P(e.x, e.y, e.z + (e.type === "flag" ? 1.85 : e.type === "player" || e.type === "mob" ? 2.1 : 1.2)); self.pill(lp2[0], lp2[1], e.label, e.labelC || "#efeadf", e.a); }
    });
    this.labels.forEach(function (l) { if (l.a > 0) { var p = self.P(l.x + .5, l.y + .5, l.z); self.pill(p[0], p[1], l.text, l.c, l.a); } });
    // particles
    this.parts.forEach(function (p) { var q = self.P(p.wx, p.wy, p.wz), s = p.s * self.W; ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.fillRect(q[0] - s / 2, q[1] - s / 2, s, s); });
    ctx.globalAlpha = 1;
    if (this.flashA > 0) { ctx.fillStyle = this.flashC; ctx.globalAlpha = this.flashA; ctx.fillRect(0, 0, this.cv.width, this.cv.height); ctx.globalAlpha = 1; this.flashA = Math.max(0, this.flashA - this.dt / 500); }
  };
  S.pill = function (x, y, text, c, a) {
    var ctx = this.ctx, D = this.DPR, fs = Math.max(10, this.W * .5);
    ctx.save(); ctx.globalAlpha = a == null ? 1 : a; ctx.font = "600 " + fs + "px JetBrains Mono, Consolas, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var w = ctx.measureText(text).width + fs * 1.1, h = fs * 1.7;
    ctx.fillStyle = "rgba(8,8,10,.85)"; ctx.strokeStyle = c; ctx.lineWidth = 1.2 * D;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); else ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c; ctx.fillText(text, x, y + D * .5); ctx.restore();
  };
  S.drawTile = function (x, y, tt, s) {
    var f = this.faces(x, y, s - 1, 1, 1, 1).top, ctx = this.ctx;
    if (tt.small) { var m = .36, pts = [fpt(f, m, m), fpt(f, 1 - m, m), fpt(f, 1 - m, 1 - m), fpt(f, m, 1 - m)]; this.poly(pts, tt.c); }
    else { ctx.globalAlpha = tt.a; this.poly(f, tt.c); ctx.globalAlpha = 1; }
  };
  S.drawCrop = function (x, y, cr, s) {
    var ctx = this.ctx, base = this.P(x + .5, y + .5, s), W = this.W, st = cr.s, h = (.25 + st * .22) * W, col = st >= 3 ? "#e8c34a" : st === 2 ? "#9acd4a" : "#5fae3a";
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2.2 * this.DPR;
    for (var i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(base[0] + i * W * .16, base[1] + Math.abs(i) * W * .04); ctx.lineTo(base[0] + i * W * .2, base[1] - h + Math.abs(i) * W * .05); ctx.stroke(); }
    if (st >= 3) { ctx.fillStyle = "#f2d16b"; for (var j = -2; j <= 2; j++) ctx.fillRect(base[0] + j * W * .2 - W * .05, base[1] - h - W * .08, W * .1, W * .16); }
    ctx.restore();
  };
  S.draw = function () {
    var ctx = this.ctx, self = this, items = [], k;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    for (k in this.blocks) { var b = this.blocks[k]; items.push([b.x + b.y + b.z, 0, b]); }
    for (k in this.tints) { var p = k.split(","), tx = +p[0], ty = +p[1], s = this.surf(tx, ty); items.push([tx + ty + s - .55, 1, this.tints[k], tx, ty, s]); }
    for (k in this.crops) { var p2 = k.split(","), cx = +p2[0], cy = +p2[1], s2 = this.surf(cx, cy); items.push([cx + cy + s2 - .2, 2, this.crops[k], cx, cy, s2]); }
    if (this.fog) for (var fx = 0; fx < this.N; fx++) for (var fy = 0; fy < this.N; fy++) { var fa = this.fog[fx][fy]; if (fa > .01) items.push([fx + fy + this.ground - .45, 3, fa, fx, fy]); }
    this.beacons.forEach(function (bc) { items.push([bc.x + bc.y + self.surf(bc.x, bc.y) + .2, 4, bc]); });
    this.ents.forEach(function (e) { items.push([e.x - .5 + e.y - .5 + e.z + .3, 5, e]); });
    items.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it[1] === 0) this.drawBlock(it[2]);
      else if (it[1] === 1) this.drawTile(it[3], it[4], it[2], it[5]);
      else if (it[1] === 2) this.drawCrop(it[3], it[4], it[2], it[5]);
      else if (it[1] === 3) { ctx.globalAlpha = it[2] * .82; this.poly(this.faces(it[3], it[4], this.ground - 1, 1, 1, 1).top, "#07070a", "rgba(0,0,0,.4)"); ctx.globalAlpha = 1; }
      else if (it[1] === 4) this.drawBeacon(it[2]);
      else this.drawEnt(it[2]);
    }
    if (this.chunks) {
      ctx.save(); ctx.strokeStyle = "rgba(78,232,240," + (this.chunks.a || .45) + ")"; ctx.lineWidth = 1.4 * this.DPR; ctx.setLineDash([4 * this.DPR, 4 * this.DPR]);
      for (var c = 0; c <= this.N; c += 3) { var a1 = this.P(c, 0, this.ground), a2 = this.P(c, this.N, this.ground), b1 = this.P(0, c, this.ground), b2 = this.P(this.N, c, this.ground); ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.moveTo(b1[0], b1[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke(); }
      ctx.restore();
    }
    this.overlay();
  };
  S.drawBeacon = function (bc) {
    if (bc.a <= 0) return;
    var s = this.surf(bc.x, bc.y), ctx = this.ctx, base = this.P(bc.x + .5, bc.y + .5, s), top = this.P(bc.x + .5, bc.y + .5, this.Z + 1), w = this.W * .32, t = (this.t / 900) % 1;
    ctx.save(); ctx.globalAlpha = bc.a;
    var g = ctx.createLinearGradient(0, base[1], 0, top[1]); g.addColorStop(0, bc.c); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.globalAlpha = bc.a * .55; ctx.fillRect(base[0] - w / 2, top[1], w, base[1] - top[1]);
    ctx.globalAlpha = bc.a * (1 - t); ctx.strokeStyle = bc.c; ctx.lineWidth = 2.5 * this.DPR; ctx.beginPath(); ctx.ellipse(base[0], base[1], this.W * (.4 + t), this.W * (.4 + t) / 2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };
  S.update = function (dt) {
    var self = this;
    this.ents.forEach(function (e) {
      if (e.hov) { var kk = Math.min(1, dt / 110); e.x += (e.hov[0] - e.x) * kk; e.y += (e.hov[1] - e.y) * kk; e.z += (e.hov[2] - e.z) * kk; }
      else if (e.fly) { e.ft += dt / 500; var tg = e.fly; e.x = lerp(e.x, tg.x, Math.min(1, e.ft * .35)); e.y = lerp(e.y, tg.y, Math.min(1, e.ft * .35)); e.z = lerp(e.z, tg.z + .4, Math.min(1, e.ft * .35)); if (e.ft > 1.6) { self.remove(e); } }
      else if (!e.air && e.type !== "eye" && e.type !== "cursor") { var fz = self.floorAt(Math.floor(e.x), Math.floor(e.y), e.z); e.z += (fz - e.z) * Math.min(1, dt / 70); }
      if (e.trail) { e.trail.push([e.x, e.y, e.z + .22]); if (e.trail.length > 6) e.trail.shift(); }
      if (e.pop != null && e.pop < 1) e.pop = Math.min(1, e.pop + dt / 350);
    });
    for (var i = this.parts.length - 1; i >= 0; i--) { var p = this.parts[i]; p.wx += p.vx; p.wy += p.vy; p.wz += p.vz; p.vz -= .006; p.life -= dt / 900; if (p.life <= 0) this.parts.splice(i, 1); }
    if (this.fog && this.B) { var bx = this.B.x, by = this.B.y, R = this.fogR || 2.4; for (var x = 0; x < this.N; x++) for (var y = 0; y < this.N; y++) if (Math.hypot(x + .5 - bx, y + .5 - by) < R) this.fog[x][y] = Math.max(0, this.fog[x][y] - dt / 260); }
    for (var k in this.crops) { var cr = this.crops[k]; if (cr.s < 3) { cr.g += dt; if (cr.g > cr.rate) { cr.g = 0; cr.s++; } } }
  };

  /* ---------------- player ---------------- */
  S.play = function (scene, cmd) {
    var self = this; this.cmd = cmd;
    this.co = (function* () {
      while (true) {
        self.clear(); self.B = null; self.chat.innerHTML = "";
        yield* scene(self);
        yield* self.wait(1900);
      }
    })();
  };
  S.frame = function (dt) {
    this.dt = dt; this.t += dt;
    if (this.co) this.co.next();
    this.update(dt); this.draw();
  };

  /* =====================================================================
     SCENES
     ===================================================================== */
  var SC = {};
  function walkTo(S, e, to) { var r = S.route(S.tile(e), to); S.dots(r); return S.walk(e, r); }
  function fogAll(S, keepR) { S.fog = []; for (var x = 0; x < S.N; x++) { S.fog.push([]); for (var y = 0; y < S.N; y++) S.fog[x].push(1); } S.fogR = keepR || 2.4; }
  function house(x0, y0) {
    var L = [];
    for (var x = 0; x < 5; x++) for (var y = 0; y < 5; y++) L.push([x0 + x, y0 + y, 3, "cobble"]);
    for (var z = 4; z <= 5; z++) for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) {
      if (x > 0 && x < 4 && y > 0 && y < 4) continue;
      if (x === 2 && y === 4) continue;
      L.push([x0 + x, y0 + y, z, (z === 5 && (x === 2 || y === 2)) ? "glass" : (x === 0 || x === 4) && (y === 0 || y === 4) ? "log" : "plank"]);
    }
    for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) L.push([x0 + x, y0 + y, 6, "log"]);
    return L;
  }
  function* buildList(S, L, ms) { for (var i = 0; i < L.length; i++) { var q = L[i]; S.hover(S.B, q[0], q[1], q[2] + 1.6); var g = S.get(q[0], q[1], q[2]); if (g && g.ghost) S.del(q[0], q[1], q[2]); yield* S.put(q[0], q[1], q[2], q[3], ms || 55); } }
  function* digList(S, L, ms) { for (var i = 0; i < L.length; i++) { var q = L[i]; S.hover(S.B, q[0], q[1], q[2] + 1.8); yield* S.dig(q[0], q[1], q[2], ms || 70); } }
  function region(x0, y0, z0, x1, y1, z1, snake) {
    var L = [];
    for (var z = z1; z >= z0; z--) for (var y = y0; y <= y1; y++) { var row = []; for (var x = x0; x <= x1; x++) row.push([x, y, z]); if (snake && (y - y0) % 2) row.reverse(); L = L.concat(row); }
    return L;
  }
  function hill(S, x0, y0, x1, y1, z0, z1) { for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) for (var z = z0; z <= z1; z++) S.set(x, y, z, z === z1 ? "grass" : "stone"); }

  /* ---- movement ---- */
  SC.goto = function* (S) { var B = S.bot(1, 10); yield* S.type(); S.beacon(9, 2); S.label(9, 2, 5.2, "120 70 -45", "#ff9be9"); yield* S.wait(250); yield* walkTo(S, B, [9, 2]); S.log("[Baritone] Прибыл на место"); };
  SC.gotoblock = function* (S) { S.set(9, 2, 3, "table"); S.get(9, 2, 3).hl = "#ffcc4d"; var B = S.bot(1, 10); yield* S.type(); S.log("[Baritone] Нашёл crafting_table", "dim"); yield* walkTo(S, B, [8, 2]); S.log("[Baritone] Рядом с crafting_table"); };
  SC.goal = function* (S) { S.bot(2, 9); yield* S.type(); var b = S.beacon(8, 3); S.label(8, 3, 5.2, "цель", "#ff9be9"); S.log("[Baritone] Цель: 120 70 -45"); yield* S.wait(1600); S.log("Бот стоит. Чтобы пойти: #path", "dim"); };
  SC.goalclear = function* (S) { S.bot(2, 9); var b = S.beacon(8, 3), l = S.label(8, 3, 5.2, "цель", "#ff9be9"); yield* S.wait(500); yield* S.type(); yield* S.par(S.fade(b, 600), S.fade(l, 600)); S.log("[Baritone] Цель убрана"); };
  SC.path = function* (S) { var B = S.bot(1, 10); S.beacon(9, 3); S.log("[Baritone] Цель: 9 64 3", "dim"); yield* S.wait(500); yield* S.type(); yield* walkTo(S, B, [9, 3]); S.log("[Baritone] Цель достигнута"); };
  SC.thisway = function* (S) { var B = S.bot(1, 6); yield* S.type(); for (var x = 3; x < 12; x += 2) S.tint(x, 6, "#ffcc4d", .85); S.log("[Baritone] Цель: 1000 блоков вперёд"); yield* S.type("#path"); yield* S.walk(B, S.route([1, 6], [11, 6])); S.log("…и дальше за край карты", "dim"); };
  SC.come = function* (S) { var B = S.bot(1, 10); S.add("eye", 8, 3); S.log("Камера улетела вперёд", "dim"); yield* S.wait(500); yield* S.type(); yield* walkTo(S, B, [8, 3]); S.log("[Baritone] Пришёл к камере"); };
  SC.surface = function* (S) {
    S.clear({ layers: 5 }); for (var x = 1; x <= 4; x++) { S.del(x, 11, 1); S.del(x, 11, 2); }
    var B = S.bot(1, 11, 1); S.log("Застрял в пещере…", "dim"); yield* S.wait(500); yield* S.type();
    yield* S.walk(B, [[4, 11]]);
    var steps = [[5, [2, 3]], [6, [3, 4]], [7, [4]]];
    for (var i = 0; i < steps.length; i++) { for (var j = 0; j < steps[i][1].length; j++) yield* S.dig(steps[i][0], 11, steps[i][1][j], 160); yield* S.walk(B, [[steps[i][0], 11]]); }
    yield* S.walk(B, [[8, 11], [9, 11]]); S.sparkle(B.x, B.y, B.z + 1, "#ffd84d"); S.log("[Baritone] На поверхности!");
  };
  SC.axis = function* (S) { for (var i = 0; i < 12; i++) S.tint(i, i, "#4ee8f0", .45); var B = S.bot(2, 9); yield* S.type(); S.log("[Baritone] Иду к ближайшей оси", "dim"); yield* walkTo(S, B, [9, 9]); S.sparkle(B.x, B.y, B.z + .5, "#4ee8f0"); S.log("[Baritone] На диагонали мира"); };
  SC.invert = function* (S) { var B = S.bot(5, 5); S.beacon(3, 3, "#ff5a5a"); S.label(3, 3, 5.2, "цель", "#ff5a5a"); yield* S.wait(400); yield* S.type(); S.log("[Baritone] Убегаю от цели"); yield* S.walk(B, S.route([5, 5], [11, 11]), 4.2); };
  SC.click = function* (S) {
    var B = S.bot(1, 10); yield* S.type(); var c = S.add("cursor", 11, 11, { z: 3 }); c.air = true;
    yield* S.walk(c, [[9, 3]], 10); S.mark(9, 3, 3, "#ff4fd8", "ping"); S.flash("rgba(255,255,255,.4)"); yield* S.wait(300); S.remove(c);
    S.beacon(9, 3); S.log("[Baritone] Иду туда, куда кликнул"); yield* walkTo(S, B, [9, 3]);
  };
  SC.blacklist = function* (S) {
    S.set(9, 2, 3, "table"); S.set(2, 2, 3, "table"); var B = S.bot(4, 10); S.log("#goto crafting_table", "dim");
    var r = S.route([4, 10], [8, 2]); S.dots(r); yield* S.walk(B, r.slice(0, 7)); yield* S.type();
    S.mark(9, 2, 3, "#ff5a5a", "x"); S.log("[Baritone] Этот стол больше не цель"); S.tints = {};
    yield* walkTo(S, B, [3, 2]); S.log("[Baritone] Нашёл другой");
  };
  SC.eta = function* (S) {
    var B = S.bot(1, 10); S.beacon(10, 1); var r = S.route([1, 10], [10, 1]); S.dots(r); yield* S.type();
    var line = S.log("[Baritone] ETA: …"), total = r.length / 3.6;
    yield* S.par(S.walk(B, r), (function* () { var t = 0; while (t < total * 1000) { t += S.dt; line.textContent = "[Baritone] ETA: " + Math.max(0, total - t / 1000).toFixed(1) + " сек"; yield; } })());
    S.log("[Baritone] Прибыл");
  };
  SC.elytra = function* (S) {
    S.clear({ pal: "nether" }); [[4, 5], [5, 5], [5, 6], [8, 8], [7, 3]].forEach(function (p) { S.set(p[0], p[1], 2, "lava"); });
    var B = S.bot(1, 10); S.beacon(10, 2, "#ffcc4d"); S.log("Незер. Цель далеко", "dim"); yield* S.wait(400); yield* S.type();
    B.wings = true; B.air = true; var z0 = B.z, t = 0, sx = B.x, sy = B.y;
    while (t < 1) { t = Math.min(1, t + S.dt / 700); B.z = z0 + t * 2.6; yield; }
    t = 0; while (t < 1) { t = Math.min(1, t + S.dt / 2200); B.x = lerp(sx, 10.5, t); B.y = lerp(sy, 2.5, t); B.z = z0 + 2.6 + Math.sin(t * Math.PI * 3) * .4; yield; }
    t = 0; while (t < 1) { t = Math.min(1, t + S.dt / 600); B.z = z0 + 2.6 * (1 - t); yield; }
    B.air = false; B.wings = false; S.log("[Baritone] Приземлился у цели");
  };

  /* ---- mining ---- */
  function cave(S) { S.clear({ layers: 5 }); for (var x = 0; x <= 2; x++) { S.del(x, 11, 1); S.del(x, 11, 2); } return S.bot(1, 11, 1); }
  function* tunnelTo(S, B, x0, x1) { for (var x = x0; x <= x1; x++) { yield* S.dig(x, 11, 2, 120); yield* S.dig(x, 11, 1, 120); yield* S.walk(B, [[x, 11]]); } }
  SC.mine = function* (S, big) {
    var B = cave(S); S.set(6, 11, 1, "ore"); S.set(9, 10, 2, "ore"); S.set(10, 11, 1, "iron"); S.xray = true;
    yield* S.type(); var cnt = S.log("[Baritone] Добыто: 0"), n = 0;
    function* take(x, y, z) { var b = S.get(x, y, z); yield* S.dig(x, y, z, 200); S.collect(b); n += big ? 9 + Math.floor(Math.random() * 6) : 1; if (big && n > 64) n = 64; cnt.textContent = "[Baritone] Добыто: " + n + (big ? "/64" : ""); }
    yield* tunnelTo(S, B, 3, 5); yield* take(6, 11, 1); yield* S.dig(6, 11, 2, 120); yield* S.walk(B, [[6, 11]]);
    yield* tunnelTo(S, B, 7, 9); yield* take(9, 10, 2); yield* take(10, 11, 1);
    if (big) { for (var i = 0; i < 3 && n < 64; i++) { n = Math.min(64, n + 10); cnt.textContent = "[Baritone] Добыто: " + n + "/64"; yield* S.wait(250); } cnt.textContent = "[Baritone] Добыто: 64/64"; S.log("[Baritone] Готово, 64 штуки"); }
  };
  SC.mine64 = function* (S) { yield* SC.mine(S, true); };
  SC.tunnel = function* (S) {
    hill(S, 4, 6, 11, 9, 3, 5); S.set(8, 9, 2, "lava"); var B = S.bot(1, 9); yield* S.type();
    for (var x = 4; x <= 11; x++) {
      if (x === 8) { S.log("[Baritone] Лава под ногами → кладу булыжник", "warn"); S.del(8, 9, 2); yield* S.put(8, 9, 2, "cobble", 220); }
      yield* S.dig(x, 9, 4, 110); yield* S.dig(x, 9, 3, 110); yield* S.walk(B, [[x, 9]]);
    }
    S.log("[Baritone] Туннель готов");
  };
  SC.tunnel3 = function* (S) {
    hill(S, 4, 6, 11, 10, 3, 6); var B = S.bot(1, 10); yield* S.type(); S.log("[Baritone] Коридор 3×2", "dim");
    for (var x = 4; x <= 11; x++) { for (var z = 5; z >= 3; z--) { yield* S.dig(x, 9, z, 55); yield* S.dig(x, 10, z, 55); } yield* S.walk(B, [[x, 10]]); }
    S.log("[Baritone] Готово: 3 в высоту, 2 в ширину");
  };
  SC.find = function* (S) {
    var ores = [[3, 4, 0], [8, 6, 1], [6, 9, 0], [10, 2, 1]]; ores.forEach(function (o) { S.set(o[0], o[1], o[2], "ore"); }); S.bot(1, 10); yield* S.type();
    S.xray = true;
    for (var i = 0; i < ores.length; i++) { var o = ores[i]; S.label(o[0], o[1], 4.3, (o[0] * 7 - 30) + " " + (o[2] + 9) + " " + (o[1] * 5 - 12), "#4ee8f0"); S.mark(o[0], o[1], 3, "#4ee8f0", "ping"); yield* S.wait(450); }
    S.log("[Baritone] Найдено в памяти: " + ores.length);
  };

  /* ---- selection ---- */
  function corner(S, x, y, n) { var c = n === 1 ? "#7ddc5a" : "#ffcc4d"; S.beacon(x, y, c); return S.label(x, y, 4.6, "#sel " + n, c); }
  SC.sel1 = function* (S) { var B = S.bot(1, 10); yield* walkTo(S, B, [3, 8]); yield* S.type(); corner(S, 3, 8, 1); S.log("[Baritone] Позиция 1 задана"); };
  SC.sel2 = function* (S) {
    var B = S.bot(3, 8); corner(S, 3, 8, 1); yield* walkTo(S, B, [8, 3]); yield* S.type(); corner(S, 8, 3, 2);
    var bx = S.box(3, 8, 3, 3, 8, 3); for (var k = 1; k <= 5; k++) { bx.x1 = 3 + k; bx.y0 = 8 - k; yield* S.wait(70); } bx.x1 = 8; bx.y0 = 3; bx.z1 = 3;
    S.log("[Baritone] Выделение 6×1×6");
  };
  SC.cleararea = function* (S) {
    var B = S.bot(1, 10); S.box(3, 3, 1, 8, 8, 2); yield* S.type();
    var L = region(3, 3, 1, 8, 8, 2, true), line = S.log("[Baritone] Копаю: 0/" + L.length);
    for (var i = 0; i < L.length; i++) { var q = L[i]; S.hover(B, q[0], q[1], q[2] + 1.8); yield* S.dig(q[0], q[1], q[2], 45); line.textContent = "[Baritone] Копаю: " + (i + 1) + "/" + L.length; }
    S.log("[Baritone] Зона чистая");
  };
  SC.fill = function* (S) { var B = S.bot(1, 10); S.box(3, 3, 3, 8, 8, 4); yield* S.type(); var L = region(3, 3, 3, 8, 8, 4, true).sort(function (a, b) { return a[2] - b[2]; }); yield* buildList(S, L.map(function (q) { return [q[0], q[1], q[2], "stone"]; }), 38); S.log("[Baritone] Заполнено: 72 блока"); };
  SC.walls = function* (S) { var B = S.bot(1, 10); S.box(3, 3, 3, 8, 8, 4); yield* S.type(); var L = []; for (var z = 3; z <= 4; z++) for (var x = 3; x <= 8; x++) for (var y = 3; y <= 8; y++) if (x === 3 || x === 8 || y === 3 || y === 8) L.push([x, y, z, "cobble"]); yield* buildList(S, L, 45); S.log("[Baritone] Стены готовы"); };
  SC.shell = function* (S) {
    var B = S.bot(1, 10); S.box(3, 3, 3, 8, 8, 6); yield* S.type(); var L = [], x, y, z;
    for (x = 3; x <= 8; x++) for (y = 3; y <= 8; y++) L.push([x, y, 3, "cobble"]);
    for (z = 4; z <= 5; z++) for (x = 3; x <= 8; x++) for (y = 3; y <= 8; y++) if (x === 3 || x === 8 || y === 3 || y === 8) L.push([x, y, z, "cobble"]);
    for (x = 3; x <= 8; x++) for (y = 3; y <= 8; y++) L.push([x, y, 6, "cobble"]);
    yield* buildList(S, L, 26); S.log("[Baritone] Коробка готова. Разрез:", "dim"); yield* S.wait(400);
    for (x = 4; x <= 7; x++) for (z = 4; z <= 5; z++) { S.burst(S.get(x, 8, z), 4); S.del(x, 8, z); } S.log("Внутри пусто — полая коробка");
  };
  function round(S, kind, hollow, sphere) {
    var cx = 6, cy = 6, cz = sphere ? 5.5 : 0, r = 2.5, L = [];
    for (var z = 3; z <= (sphere ? 8 : 6); z++) for (var x = 2; x <= 10; x++) for (var y = 2; y <= 10; y++) {
      var d = sphere ? Math.hypot(x + .5 - cx, y + .5 - cy, z + .5 - cz) : Math.hypot(x + .5 - cx, y + .5 - cy);
      if (d <= r && (!hollow || d > r - 1.1)) L.push([x, y, z, kind]);
    }
    return L;
  }
  SC.sphere = function* (S) { var B = S.bot(1, 10); S.box(3, 3, 3, 8, 8, 7); yield* S.type(); yield* buildList(S, round(S, "wool", false, true).filter(function (q) { return q[2] <= 7; }), 30); S.log("[Baritone] Шар готов"); };
  SC.cyl = function* (S) { var B = S.bot(1, 10); S.box(3, 3, 3, 8, 8, 6); yield* S.type(); yield* buildList(S, round(S, "stone", false, false), 28); S.log("[Baritone] Цилиндр по оси y"); };
  SC.replace = function* (S) {
    for (var x = 3; x <= 8; x++) for (var y = 3; y <= 8; y++) S.set(x, y, 2, "stone");
    var B = S.bot(1, 10); S.box(3, 3, 2, 8, 8, 2); yield* S.type(); var L = region(3, 3, 2, 8, 8, 2, true);
    for (var i = 0; i < L.length; i++) { var q = L[i]; S.hover(B, q[0], q[1], 4.4); yield* S.dig(q[0], q[1], 2, 40); yield* S.put(q[0], q[1], 2, "dirt", 50); }
    S.log("[Baritone] stone → dirt: 36");
  };
  function tower(S, x0, y0, ghost) { var L = []; for (var z = 3; z <= 5; z++) for (var x = 0; x < 2; x++) for (var y = 0; y < 2; y++) L.push([x0 + x, y0 + y, z, z === 5 ? "plank" : "cobble"]); L.forEach(function (q) { S.set(q[0], q[1], q[2], q[3], { ghost: !!ghost }); }); return L; }
  SC.copy = function* (S) {
    var L = tower(S, 3, 4); S.bot(1, 10); S.box(3, 4, 3, 4, 5, 5); yield* S.type();
    L.forEach(function (q) { S.get(q[0], q[1], q[2]).flash = 1; }); yield* S.wait(400);
    tower(S, 8, 4, true); S.label(8, 4, 6.4, "в буфере", "#ff9be9"); S.log("[Baritone] Скопировано: 12 блоков");
  };
  SC.paste = function* (S) {
    tower(S, 3, 4); var G = tower(S, 7, 5, true); var B = S.bot(1, 10); S.label(7, 5, 6.4, "из буфера", "#ff9be9"); yield* S.type();
    yield* buildList(S, G, 70); S.log("[Baritone] Вставлено");
  };
  function* growBox(S, b, prop, to, ms) { var from = b[prop], steps = Math.abs(to - from); for (var i = 1; i <= steps; i++) { b[prop] = from + Math.sign(to - from) * i; yield* S.wait(ms || 160); } }
  SC.expand = function* (S) { S.bot(1, 10); var b = S.box(3, 3, 3, 8, 8, 3); yield* S.wait(300); yield* S.type(); yield* growBox(S, b, "z1", 7); S.log("[Baritone] Выделение выросло вверх"); };
  SC.contract = function* (S) { S.bot(1, 10); var b = S.box(3, 3, 3, 8, 8, 7); yield* S.wait(300); yield* S.type(); yield* growBox(S, b, "z1", 4); S.log("[Baritone] Выделение сжалось"); };
  SC.shift = function* (S) { S.bot(1, 10); var b = S.box(2, 6, 3, 5, 9, 4); yield* S.wait(300); yield* S.type(); for (var i = 0; i < 3; i++) { b.y0--; b.y1--; yield* S.wait(220); } S.log("[Baritone] Сдвинуто на 3 к северу"); };
  SC.selundo = function* (S) { S.bot(1, 10); corner(S, 3, 8, 1); var c2 = S.beacons.length; var l2 = corner(S, 8, 3, 2); var bb = S.beacons[c2]; var b = S.box(3, 3, 3, 8, 8, 3); yield* S.wait(400); yield* S.type(); yield* S.par(S.fade(b, 500), S.fade(bb, 500), S.fade(l2, 500)); S.log("[Baritone] Отменено: позиция 2"); };
  SC.selclear = function* (S) { S.bot(1, 10); var a = S.box(2, 2, 3, 5, 5, 4), b = S.box(7, 6, 3, 10, 9, 5, "#4ee8f0"); yield* S.wait(400); yield* S.type(); yield* S.par(S.fade(a, 500), S.fade(b, 500)); S.log("[Baritone] Выделения убраны"); };

  /* ---- building ---- */
  function ghostHouse(S, x0, y0) { var L = house(x0, y0); L.forEach(function (q) { S.set(q[0], q[1], q[2], q[3], { ghost: true }); }); return L; }
  SC.build = function* (S, at, who) {
    var B = S.bot(1, 10), L = ghostHouse(S, 4, 3);
    if (at) { S.beacon(4, 3, "#7ddc5a"); S.label(4, 3, 7.5, "x y z", "#7ddc5a"); }
    yield* S.type(); S.log("[Baritone] " + (who || "house.schematic") + ": " + L.length + " блоков");
    yield* buildList(S, L, 34); S.log("[Baritone] Построено");
  };
  SC.buildat = function* (S) { yield* SC.build(S, true); };
  SC.schematica = function* (S) { yield* SC.build(S, false, "Schematica"); };
  SC.litematica = function* (S) {
    var B = S.bot(1, 10), L = ghostHouse(S, 4, 3); S.box(4, 3, 3, 8, 7, 6);
    var extra = [[6, 5, 3], [6, 5, 4], [5, 4, 3]]; extra.forEach(function (q) { S.del(q[0], q[1], q[2]); S.set(q[0], q[1], q[2], "dirt", { hl: "#ff5a5a" }); });
    yield* S.type(); S.log("[Baritone] Litematica: лишних 3, поставить " + L.length);
    yield* digList(S, extra.slice().reverse(), 160); L = ghostHouse(S, 4, 3); yield* buildList(S, L, 34); S.log("[Baritone] Схема достроена");
  };
  function farmland(S) { for (var x = 3; x <= 9; x++) for (var y = 4; y <= 7; y++) { S.set(x, y, 2, "farmland"); S.crops[x + "," + y] = { s: 1 + ((x * 3 + y) % 3), g: Math.random() * 900, rate: 900 + Math.random() * 700 }; } }
  SC.farm = function* (S, ring) {
    farmland(S); var B = S.bot(2, 4); if (ring) { B.ring = 4.2; B.ringC = "rgba(78,232,240,.8)"; }
    yield* S.type(); var n = 0, line = S.log("[Baritone] Собрано: 0");
    var path = []; for (var y = 4; y <= 7; y++) { var row = []; for (var x = 3; x <= 9; x++) row.push([x, y]); if (y % 2) row.reverse(); path = path.concat(row); }
    for (var i = 0; i < path.length; i++) {
      yield* S.walk(B, [path[i]], 4.5); var k = path[i][0] + "," + path[i][1], cr = S.crops[k];
      if (cr && cr.s >= 3) { S.sparkle(path[i][0] + .5, path[i][1] + .5, 3.4, "#f2d16b", 8); cr.s = 0; cr.g = 0; n++; line.textContent = "[Baritone] Собрано: " + n + " · пересажено: " + n; yield* S.wait(120); }
    }
    if (ring) B.ring = 0;
  };
  SC.farm50 = function* (S) { yield* SC.farm(S, true); };

  /* ---- follow ---- */
  SC.followp = function* (S) {
    var P = S.add("player", 6, 6, { label: "Друг" }), B = S.bot(1, 10); yield* S.type(); S.log("[Baritone] Следую за Друг");
    yield* S.par(S.walk(P, S.chain([[6, 6], [9, 6], [9, 2], [4, 2], [4, 5]]), 2.6), S.chase(B, P, 1.4, 8200));
  };
  SC.followps = function* (S) {
    var P = S.add("player", 4, 4, { label: "Игрок 1" }), Q = S.add("player", 8, 8, { label: "Игрок 2", c: [234, 88, 12] }), B = S.bot(1, 10);
    yield* S.type(); S.log("[Baritone] Следую за ближайшим игроком");
    function near() { return Math.hypot(P.x - B.x, P.y - B.y) < Math.hypot(Q.x - B.x, Q.y - B.y) ? P : Q; }
    yield* S.par(S.walk(P, S.chain([[4, 4], [2, 4], [2, 2], [6, 2]]), 2.2), S.walk(Q, S.chain([[8, 8], [10, 8], [10, 4], [8, 4]]), 2.4), S.chase(B, near, 1.4, 7000));
  };
  function wander(S, e, pts, sp) { return S.walk(e, S.chain(pts), sp || 2); }
  SC.followpig = function* (S) { var pig = S.add("pig", 6, 5, { label: "pig" }), B = S.bot(1, 10); yield* S.type(); S.log("[Baritone] Следую за свиньёй"); yield* S.par(wander(S, pig, [[6, 5], [9, 5], [9, 8], [7, 8], [7, 3], [4, 3]]), S.chase(B, pig, 1.3, 9000)); };
  SC.followents = function* (S) {
    var pig = S.add("pig", 4, 3), mob = S.add("mob", 9, 7), B = S.bot(1, 10); yield* S.type(); S.log("[Baritone] Следую за любыми существами");
    function near() { return Math.hypot(pig.x - B.x, pig.y - B.y) < Math.hypot(mob.x - B.x, mob.y - B.y) ? pig : mob; }
    yield* S.par(wander(S, pig, [[4, 3], [7, 3], [7, 5]], 1.6), wander(S, mob, [[9, 7], [9, 10], [6, 10]], 1.8), S.chase(B, near, 1.3, 7500));
  };

  /* ---- explore ---- */
  SC.explore = function* (S, center, filter) {
    fogAll(S); S.chunks = { a: .35 }; var B = S.bot(1, 10); yield* S.type(); var line = S.log("[Baritone] Новых чанков: 0"), seen = 0;
    var pts = center ? [[1, 10], [4, 8], [4, 4], [8, 4], [8, 8], [5, 10], [10, 10], [10, 1], [1, 1]] : [[1, 10], [10, 10], [10, 7], [1, 7], [1, 4], [10, 4], [10, 1], [1, 1]];
    if (center) S.beacon(6, 6, "#4ee8f0");
    if (filter) { pts = [[1, 10], [4, 10], [4, 4], [10, 4], [10, 1]]; [[3, 9], [3, 3], [9, 3], [9, 0]].forEach(function (c) { for (var x = c[0]; x < c[0] + 3; x++) for (var y = c[1]; y < c[1] + 3; y++) S.tint(x, y, "#4ee8f0", .25); }); }
    var r = S.chain(pts);
    yield* S.par(S.walk(B, r, 5), (function* () { while (true) { var c = 0; for (var x = 0; x < 12; x += 3) for (var y = 0; y < 12; y += 3) if (S.fog[x + 1][y + 1] < .5) c++; if (c !== seen) { seen = c; line.textContent = "[Baritone] Новых чанков: " + c; } if (S.B && Math.floor(S.B.x) === r[r.length - 1][0] && Math.floor(S.B.y) === r[r.length - 1][1]) return; yield; } })());
  };
  SC.explorexz = function* (S) { yield* SC.explore(S, true); };
  SC.explorefilter = function* (S) { yield* SC.explore(S, false, true); };

  /* ---- waypoints ---- */
  SC.wpsave = function* (S) { var B = S.bot(1, 10); yield* walkTo(S, B, [6, 6]); yield* S.type(); var f = S.flag(5, 6, "дом"); f.pop = 0; S.sparkle(5.5, 6.5, 4, "#ff4fd8"); S.log("[Baritone] Точка «дом» сохранена"); };
  SC.wplist = function* (S) { S.flag(2, 3, "дом"); S.flag(9, 4, "шахта", [78, 232, 240]); S.add("grave", 7, 9, { label: "death" }); S.bot(1, 10); yield* S.type(); S.log("[Baritone] user: дом (2 64 3)"); yield* S.wait(250); S.log("[Baritone] user: шахта (9 64 4)"); yield* S.wait(250); S.log("[Baritone] death: смерть (7 64 9)"); };
  SC.wpgoto = function* (S) { S.flag(9, 3, "дом"); var B = S.bot(1, 10); yield* S.type(); yield* walkTo(S, B, [8, 3]); S.log("[Baritone] Дома"); };
  SC.wpgoal = function* (S) { S.flag(9, 3, "дом"); var B = S.bot(1, 10); yield* S.type(); S.beacon(9, 3); S.log("[Baritone] Цель: дом"); yield* S.wait(500); yield* S.type("#path"); yield* walkTo(S, B, [8, 3]); };
  SC.wpdeath = function* (S) { S.add("grave", 9, 4, { label: "смерть" }); var B = S.bot(1, 10); yield* S.type(); S.beacon(9, 4, "#ff5a5a"); S.log("[Baritone] Цель: место смерти"); yield* S.type("#path"); yield* walkTo(S, B, [8, 4]); S.log("[Baritone] Вещи где-то здесь"); };
  SC.wpinfo = function* (S) { S.flag(6, 5, "дом"); S.bot(1, 10); yield* S.type(); S.label(6, 5, 2.6, "user · 120 70 -45", "#ffcc4d"); S.log("[Baritone] дом: user, 120 70 -45"); };
  SC.wpdelete = function* (S) { var f = S.flag(6, 5, "дом"); S.bot(1, 10); yield* S.wait(300); yield* S.type(); S.sparkle(6.5, 5.5, 4, "#ff4fd8", 18); S.remove(f); S.log("[Baritone] Удалена. Вернуть: #wp restore 1"); };
  SC.wpclear = function* (S) { var fs = [S.flag(3, 3, "a"), S.flag(7, 4, "b"), S.flag(5, 8, "c")]; S.bot(1, 10); yield* S.wait(300); yield* S.type(); for (var i = 0; i < fs.length; i++) { S.sparkle(fs[i].x, fs[i].y, 4, "#ff4fd8", 14); S.remove(fs[i]); yield* S.wait(250); } S.log("[Baritone] Удалено точек user: 3"); };
  SC.sethome = function* (S) { var B = S.bot(1, 10); yield* walkTo(S, B, [5, 6]); yield* S.type(); var f = S.flag(4, 6, "home", [125, 220, 90]); f.pop = 0; S.sparkle(4.5, 6.5, 4, "#7ddc5a"); S.log("[Baritone] home сохранён"); };
  SC.home = function* (S) { S.flag(9, 3, "home", [125, 220, 90]); var B = S.bot(1, 10); yield* S.type(); yield* walkTo(S, B, [8, 3]); S.log("[Baritone] Дома"); };

  /* ---- control ---- */
  function* busyDig(S, B, from, to) { var L = region(4, 4, 1, 8, 7, 2, true).slice(from, to); for (var i = 0; i < L.length; i++) { var q = L[i]; S.hover(B, q[0], q[1], q[2] + 1.8); yield* S.dig(q[0], q[1], q[2], 90); } }
  SC.stop = function* (S, force) {
    var B = S.bot(1, 10), bc = S.beacon(10, 2); S.log("#goto 10 64 2", "dim"); var r = S.route([1, 10], [10, 2]); S.dots(r);
    yield* S.par(S.walk(B, r), (function* () { yield* S.wait(1300); yield* S.type(); B.halt = true; S.tints = {}; if (force) S.flash("rgba(255,90,90,.6)"); yield* S.fade(bc, 300); S.log(force ? "[Baritone] Принудительно отменено" : "[Baritone] Остановлено"); })());
  };
  SC.forcecancel = function* (S) { yield* SC.stop(S, true); };
  SC.pause = function* (S) {
    var B = S.bot(1, 10); S.box(4, 4, 1, 8, 7, 2); S.log("[Baritone] Копаю зону…", "dim");
    yield* S.par(busyDig(S, B, 0, 40), (function* () { yield* S.wait(1500); yield* S.type(); S.hold = true; B.paused = true; B.bubble = "⏸ пауза"; S.log("[Baritone] Пауза"); yield* S.wait(1800); S.log("Ждёт #resume", "dim"); yield* S.wait(800); S.stopAll = true; })());
  };
  SC.resume = function* (S) {
    var B = S.bot(5, 5); S.box(4, 4, 1, 8, 7, 2); S.hold = true; B.paused = true; B.bubble = "⏸ пауза"; S.log("[Baritone] Пауза", "dim");
    yield* S.par(busyDig(S, B, 0, 24), (function* () { yield* S.wait(900); yield* S.type(); S.hold = false; B.paused = false; B.bubble = null; S.log("[Baritone] Продолжаю"); })());
  };
  SC.paused = function* (S) { var B = S.bot(5, 6); B.paused = true; B.bubble = "⏸"; S.box(4, 4, 1, 8, 7, 2); yield* S.wait(300); yield* S.type(); S.log("[Baritone] Пауза: да"); };
  SC.proc = function* (S) { var B = S.bot(1, 10); S.box(4, 4, 1, 8, 7, 2); yield* S.par(busyDig(S, B, 0, 30), (function* () { yield* S.wait(1000); yield* S.type(); S.log("[Baritone] Процесс: Builder · расчистка 9/40"); })()); };
  SC.help = function* (S) { S.bot(5, 6); yield* S.type(); var L = ["help  set  goal  goto  path", "mine  tunnel  sel  build", "follow  explore  farm  wp", "stop  pause  resume  …"]; for (var i = 0; i < L.length; i++) { S.log("[Baritone] " + L[i]); yield* S.wait(200); } };
  SC.version = function* (S) { var B = S.bot(5, 6); yield* S.type(); S.log("[Baritone] Baritone v1.17.0"); S.sparkle(B.x, B.y, B.z + 1, "#ff4fd8"); };

  /* ---- settings ---- */
  SC.nobreak = function* (S) {
    for (var y = 1; y <= 9; y++) for (var z = 3; z <= 4; z++) S.set(6, y, z, "stone", { hl: z === 4 && y === 5 ? "#ff5a5a" : null });
    var B = S.bot(1, 5); S.beacon(10, 5); yield* S.type(); S.mark(6, 5, 5, "#ff5a5a", "x"); S.log("[Baritone] Ломать нельзя → обхожу стену");
    var r = S.chain([[1, 5], [5, 5], [5, 10], [7, 10], [7, 5], [10, 5]]); S.dots(r); yield* S.walk(B, r);
  };
  SC.noplace = function* (S) {
    for (var y = 0; y <= 8; y++) for (var z = 0; z <= 2; z++) S.del(6, y, z);
    var B = S.bot(1, 4); S.beacon(10, 4); yield* S.type(); S.label(6, 4, 1.5, "мост нельзя", "#ff5a5a"); S.log("[Baritone] Ставить нельзя → в обход");
    var r = S.chain([[1, 4], [5, 4], [5, 10], [7, 10], [7, 4], [10, 4]]); S.dots(r); yield* S.walk(B, r);
  };
  SC.sprint = function* (S) {
    var B = S.bot(1, 8), G = S.add("bot", 1, 4); G.ghostSlow = true; S.label(1, 4, 4.8, "шаг", "#aaa598"); S.label(1, 8, 4.8, "бег", "#ff9be9");
    yield* S.type(); B.trail = []; yield* S.par(S.walk(B, S.route([1, 8], [11, 8]), 7.5), S.walk(G, S.route([1, 4], [11, 4]), 3)); B.trail = null; S.log("[Baritone] Бег включён");
  };
  SC.parkour = function* (S) { for (var y = 0; y < 12; y++) for (var z = 0; z <= 2; z++) S.del(6, y, z); var B = S.bot(1, 6); S.beacon(10, 6); yield* S.type(); yield* S.walk(B, S.route([1, 6], [5, 6])); yield* S.jump(B, [7, 6], 1.3); S.log("[Baritone] Перепрыгнул яму"); yield* S.walk(B, S.route([7, 6], [10, 6])); };
  SC.parkourplace = function* (S) {
    for (var y = 0; y < 12; y++) for (var x = 5; x <= 7; x++) for (var z = 0; z <= 2; z++) S.del(x, y, z);
    var B = S.bot(1, 6); S.beacon(10, 6); yield* S.type(); yield* S.walk(B, S.route([1, 6], [4, 6]));
    var placed = false; B.onJump = function (t) { if (t > .45 && !placed) { placed = true; S.set(6, 6, 2, "cobble").flash = 1; } };
    yield* S.jump(B, [6, 6], 1.4); B.onJump = null; yield* S.jump(B, [8, 6], 1.2); S.log("[Baritone] Прыжок + блок в воздухе"); yield* S.walk(B, S.route([8, 6], [10, 6]));
  };
  SC.legit = function* (S) {
    S.clear({ layers: 5 }); for (var x = 0; x <= 7; x++) { S.del(x, 11, 1); S.del(x, 11, 2); }
    S.set(5, 11, 3, "ore"); S.set(9, 10, 1, "ore"); S.mark(9, 10, 2.5, "#4ee8f0", "?");
    var B = S.bot(1, 11, 1); yield* S.type(); S.log("[Baritone] Видна 1 руда, вторая скрыта", "dim");
    yield* S.walk(B, [[5, 11]]); var b = S.get(5, 11, 3); yield* S.dig(5, 11, 3, 260); S.collect(b); S.log("[Baritone] Взял только видимую");
  };
  SC.avoid = function* (S) { var m = S.add("mob", 6, 5); m.ring = 1.9; m.ringC = "rgba(255,90,90,.85)"; var B = S.bot(1, 5); S.beacon(10, 5); yield* S.type(); S.log("[Baritone] Монстр на пути → обхожу"); var r = S.chain([[1, 5], [3, 5], [3, 9], [9, 9], [9, 5], [10, 5]]); S.dots(r); yield* S.walk(B, r); };
  SC.backfill = function* (S) {
    hill(S, 4, 6, 11, 9, 3, 5); var B = S.bot(1, 9); yield* S.type(); S.log("[Baritone] Засыпаю туннель за собой", "dim");
    for (var x = 4; x <= 11; x++) { yield* S.dig(x, 9, 4, 100); yield* S.dig(x, 9, 3, 100); yield* S.walk(B, [[x, 9]]); if (x >= 6) { yield* S.put(x - 2, 9, 3, "stone", 90); yield* S.put(x - 2, 9, 4, "stone", 90); } }
  };
  SC.layers = function* (S) {
    var B = S.bot(1, 10); S.box(4, 4, 3, 7, 7, 5); yield* S.type();
    for (var z = 3; z <= 5; z++) { S.log("[Baritone] Слой " + (z - 2) + "/3"); var L = []; for (var x = 4; x <= 7; x++) for (var y = 4; y <= 7; y++) L.push([x, y, z, "plank"]); yield* buildList(S, L, 40); }
  };
  SC.followradius = function* (S) { var P = S.add("player", 6, 6, { label: "Друг" }); P.ring = 3; P.ringC = "rgba(78,232,240,.7)"; var B = S.bot(1, 10); yield* S.type(); S.log("[Baritone] Держусь в 3 блоках"); yield* S.par(S.walk(P, S.chain([[6, 6], [9, 6], [9, 3], [5, 3]]), 2.4), S.chase(B, P, 3, 6500)); };
  SC.throwaway = function* (S) {
    for (var y = 0; y < 12; y++) for (var x = 5; x <= 7; x++) for (var z = 0; z <= 2; z++) S.del(x, y, z);
    var B = S.bot(1, 6); S.beacon(10, 6); yield* S.type(); yield* S.walk(B, S.route([1, 6], [4, 6]));
    var kinds = ["dirt", "cobble", "dirt"];
    for (var x2 = 5; x2 <= 7; x2++) { yield* S.put(x2, 6, 2, kinds[x2 - 5], 220); S.log("[Baritone] Трачу: " + (kinds[x2 - 5] === "dirt" ? "dirt" : "cobblestone"), "dim"); yield* S.walk(B, [[x2, 6]]); }
    yield* S.walk(B, S.route([7, 6], [10, 6])); S.log("[Baritone] Мост готов");
  };
  SC.avoidchest = function* (S) {
    hill(S, 4, 6, 11, 9, 3, 5); S.del(7, 9, 3); S.set(7, 9, 3, "chest", { hl: "#7ddc5a" }); S.label(7, 9, 6.6, "сундук не трогаю", "#7ddc5a");
    var B = S.bot(1, 9); yield* S.type();
    for (var x = 4; x <= 6; x++) { yield* S.dig(x, 9, 4, 100); yield* S.dig(x, 9, 3, 100); yield* S.walk(B, [[x, 9]]); }
    yield* S.dig(6, 9, 5, 100); yield* S.dig(7, 9, 4, 100); yield* S.dig(7, 9, 5, 100); yield* S.walk(B, [[7, 9]]);
    yield* S.dig(8, 9, 5, 100); yield* S.dig(8, 9, 4, 100); yield* S.dig(8, 9, 3, 100); yield* S.walk(B, [[8, 9]]);
    for (x = 9; x <= 11; x++) { yield* S.dig(x, 9, 4, 100); yield* S.dig(x, 9, 3, 100); yield* S.walk(B, [[x, 9]]); }
    S.log("[Baritone] Прошёл над сундуком");
  };
  SC.scanitems = function* (S) {
    var its = [[4, 8], [7, 9], [9, 5], [6, 3], [3, 4]].map(function (p) { return S.add("item", p[0], p[1], { k: ["ore", "iron", "dirt", "ore", "cobble"][p[0] % 5] }); });
    var B = S.bot(1, 10); yield* S.type(); var line = S.log("[Baritone] Подобрано: 0/5");
    for (var i = 0; i < its.length; i++) { yield* S.walk(B, S.route(S.tile(B), S.tile(its[i]))); its[i].fly = B; its[i].ft = 0; line.textContent = "[Baritone] Подобрано: " + (i + 1) + "/5"; }
  };
  SC.cached = function* (S) {
    S.bot(5, 6); yield* S.type(); S.chunks = { a: .55 }; var cs = ["#4ee8f0", "#ff4fd8", "#7ddc5a", "#ffcc4d"];
    for (var cx = 0; cx < 12; cx += 3) for (var cy = 0; cy < 12; cy += 3) { for (var x = cx; x < cx + 3; x++) for (var y = cy; y < cy + 3; y++) S.tint(x, y, cs[(cx + cy) / 3 % 4], .28); yield* S.wait(70); }
    S.log("[Baritone] Показываю запомненные чанки");
  };
  function* sayList(S, L) { for (var i = 0; i < L.length; i++) { S.log(L[i]); yield* S.wait(220); } }
  SC.modified = function* (S) { S.bot(5, 6); yield* S.type(); yield* sayList(S, ["[Baritone] allowSprint: true", "[Baritone] legitMine: true", "[Baritone] avoidance: true"]); };
  SC.setreset = function* (S) { var B = S.bot(5, 6); yield* S.type(); S.sparkle(B.x, B.y, B.z + 1, "#4ee8f0"); S.log("[Baritone] allowSprint → по умолчанию"); };
  SC.reset = function* (S) { var B = S.bot(5, 6); yield* S.type(); S.flash("rgba(255,255,255,.5)"); S.sparkle(B.x, B.y, B.z + 1, "#ff4fd8", 24); S.log("[Baritone] Все настройки сброшены"); };

  /* ---- tech ---- */
  function* wave(S, c) { S.chunks = { a: .5 }; for (var d = 0; d < 24; d++) { for (var x = 0; x < 12; x++) { var y = d - x; if (y >= 0 && y < 12) S.tint(x, y, c, .45); var y2 = d - 3 - x; if (y2 >= 0 && y2 < 12) S.untint(x, y2); } yield* S.wait(45); } S.tints = {}; }
  SC.repack = function* (S) { S.bot(5, 6); yield* S.type(); yield* wave(S, "#4ee8f0"); S.log("[Baritone] Чанки вокруг запомнены заново"); };
  SC.reloadall = function* (S) { S.bot(5, 6); yield* S.type(); yield* wave(S, "#ff4fd8"); S.log("[Baritone] Память мира перезагружена"); };
  SC.saveall = function* (S) { S.bot(5, 6); yield* S.type(); yield* wave(S, "#7ddc5a"); S.log("[Baritone] Память мира сохранена"); };
  SC.renderfix = function* (S) {
    S.bot(5, 6); var keys = Object.keys(S.blocks), t = 0;
    S.log("Чанки глючат…", "dim");
    while (t < 1300) { t += S.dt; if (Math.random() < .5) { var b = S.blocks[keys[Math.floor(Math.random() * keys.length)]]; if (b.z === 2) b.hide = !b.hide; } yield; }
    yield* S.type(); for (var k in S.blocks) if (S.blocks[k].hide) { S.blocks[k].hide = false; S.blocks[k].flash = 1; }
    S.log("[Baritone] Отрисовка исправлена");
  };
  SC.gc = function* (S) { S.bot(5, 6); yield* S.type(); var l = S.log("[Baritone] Память: 2.1 ГБ"); for (var m = 21; m >= 14; m--) { l.textContent = "[Baritone] Память: " + (m / 10).toFixed(1) + " ГБ"; yield* S.wait(110); } S.log("[Baritone] Освобождено 0.7 ГБ"); };
  SC.fallback = function* (S) { S.bot(5, 6); yield* S.type(); S.log("[Baritone] OK"); };

  window.BaricomSim = { Sim: Sim, scenes: SC };

  /* =====================================================================
     UI glue
     ===================================================================== */
  var screen = document.getElementById("screen"), cv = document.getElementById("simcv"), chat = document.getElementById("simchat");
  if (!screen || !cv || !cv.getContext) return;
  var sim = new Sim(cv, chat); window.__sim = sim;
  var title = document.getElementById("scrCmd"), desc = document.getElementById("scrDesc"), idx = document.getElementById("scrIdx");
  var rows = [].slice.call(document.querySelectorAll(".crow[data-scene]")), cur = null;
  var mobile = window.matchMedia("(max-width: 900px)");
  var backdrop = document.getElementById("scrBack");

  function visibleRows() { return rows.filter(function (r) { return !r.hidden && !r.parentNode.hidden; }); }
  function select(row, open) {
    if (!row) return;
    if (cur) cur.classList.remove("on");
    cur = row; row.classList.add("on");
    var sc = SC[row.dataset.scene] || SC.fallback;
    title.textContent = row.dataset.demo; desc.textContent = row.querySelector("p").firstChild.textContent;
    var vr = visibleRows(); idx.textContent = (vr.indexOf(row) + 1) + " / " + vr.length;
    sim.resize(); sim.play(sc, row.dataset.demo);
    if (open && mobile.matches) { screen.classList.add("open"); if (backdrop) backdrop.hidden = false; document.documentElement.classList.add("sheet-open"); }
    if (reduce) { for (var i = 0; i < 400; i++) sim.frame(16); }
  }
  function close() { screen.classList.remove("open"); if (backdrop) backdrop.hidden = true; document.documentElement.classList.remove("sheet-open"); }
  rows.forEach(function (r) {
    r.addEventListener("click", function (e) { if (e.target.closest(".copy")) return; select(r, true); });
    r.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(r, true); } });
  });
  document.getElementById("scrReplay").addEventListener("click", function () { select(cur); });
  document.getElementById("scrPrev").addEventListener("click", function () { var v = visibleRows(), i = v.indexOf(cur); select(v[(i - 1 + v.length) % v.length]); });
  document.getElementById("scrNext").addEventListener("click", function () { var v = visibleRows(), i = v.indexOf(cur); select(v[(i + 1) % v.length]); });
  document.getElementById("scrClose").addEventListener("click", close);
  if (backdrop) backdrop.addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  [].forEach.call(document.querySelectorAll(".feat[data-cmd]"), function (f) {
    f.addEventListener("click", function () { var r = rows.filter(function (x) { return x.dataset.cmd === f.dataset.cmd; })[0]; setTimeout(function () { select(r, true); }, 30); });
  });

  var running = false, last = 0, vis = false;
  function loop(t) { if (!running) return; var dt = Math.min(48, t - (last || t)); last = t; sim.frame(dt); requestAnimationFrame(loop); }
  function check() { var should = !reduce && !document.hidden && (vis || screen.classList.contains("open")); if (should && !running) { running = true; last = 0; requestAnimationFrame(loop); } else if (!should) running = false; }
  if (window.IntersectionObserver) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; check(); }).observe(screen); else vis = true;
  document.addEventListener("visibilitychange", check);
  new MutationObserver(check).observe(screen, { attributes: true, attributeFilter: ["class"] });
  if (window.ResizeObserver) new ResizeObserver(function () { sim.resize(); }).observe(cv);
  select(rows.filter(function (r) { return r.dataset.scene === "goto"; })[0] || rows[0], false);
  check();
})();
