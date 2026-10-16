// ===== Ellipso engine: physics, x2 orbs, procedural levels =====
var ENGINE = (function () {
  "use strict";
  const TAU = Math.PI * 2;
  const SPEED = 340, DT = 1 / 240, BALL_R = 4, WALL_W = 7, MAX_AGE = 10, MAX_BALLS = 32;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function foci(rx, ry) { const c = Math.sqrt(Math.max(0, ry * ry - rx * rx)); return [{ x: 0, y: -c }, { x: 0, y: c }]; }
  function wallsAt(L, t) {
    return L.walls.map((w) => {
      if (w.rot) {
        const r = w.rot, a = r.a0 + r.speed * t, h = r.len / 2, ca = Math.cos(a) * h, sa = Math.sin(a) * h;
        return { x1: r.cx - ca, y1: r.cy - sa, x2: r.cx + ca, y2: r.cy + sa, rot: r };
      }
      if (w.slide) {
        const s = w.slide, o = Math.sin(t * s.speed + s.ph) * s.amp;
        return { x1: w.x1 + s.dx * o, y1: w.y1 + s.dy * o, x2: w.x2 + s.dx * o, y2: w.y2 + s.dy * o, slide: s };
      }
      return w;
    });
  }
  function moving(L) { return L.walls.some((w) => w.rot || w.slide); }
  function ptSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t * dx - px, qy = ay + t * dy - py;
    return Math.sqrt(qx * qx + qy * qy);
  }
  function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1x = bx - ax, d1y = by - ay, d2x = dx - cx, d2y = dy - cy;
    const den = d1x * d2y - d1y * d2x;
    if (den !== 0) {
      const s = ((cx - ax) * d2y - (cy - ay) * d2x) / den, u = ((cx - ax) * d1y - (cy - ay) * d1x) / den;
      if (s >= 0 && s <= 1 && u >= 0 && u <= 1) return 0;
    }
    return Math.min(ptSeg(ax, ay, cx, cy, dx, dy), ptSeg(bx, by, cx, cy, dx, dy), ptSeg(cx, cy, ax, ay, bx, by), ptSeg(dx, dy, ax, ay, bx, by));
  }
  function rayEllipse(px, py, ux, uy, rx, ry) {
    const A = (ux * ux) / (rx * rx) + (uy * uy) / (ry * ry), B = 2 * ((px * ux) / (rx * rx) + (py * uy) / (ry * ry)), C = (px * px) / (rx * rx) + (py * py) / (ry * ry) - 1;
    return (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
  }
  function raySeg(px, py, ux, uy, w) {
    const ex = w.x2 - w.x1, ey = w.y2 - w.y1, dx = w.x1 - px, dy = w.y1 - py;
    const det = -ux * ey + ex * uy;
    if (Math.abs(det) < 1e-9) return Infinity;
    const t = (-dx * ey + ex * dy) / det, s = (ux * dy - uy * dx) / det;
    return t > 0 && s >= -0.03 && s <= 1.03 ? t : Infinity;
  }
  function rayCircle(px, py, ux, uy, cx, cy, r) {
    const fx = px - cx, fy = py - cy, b = fx * ux + fy * uy, c = fx * fx + fy * fy - r * r, disc = b * b - c;
    if (disc < 0) return Infinity;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? t : Infinity;
  }
  function inside(L, x, y, k) { return (x * x) / (L.rx * L.rx) + (y * y) / (L.ry * L.ry) < (k || 1); }

  function makeBall(x, y, ang) {
    return { x, y, vx: Math.cos(ang) * SPEED, vy: Math.sin(ang) * SPEED, bounces: 0, used: 0, state: "live", age: 0, path: [{ x, y }], why: "", gen: 0 };
  }
  function newSim(L, ang, t0, balls) {
    return { L, t: t0 || 0, balls: balls || [makeBall(L.start.x, L.start.y, ang)], hits: 0, fail: null, splits: 0, done: false };
  }
  function split(S, b, i, born, ev) {
    const L = S.L, o = L.orbs[i], a = Math.atan2(b.vy, b.vx);
    b.state = "split"; b.x = o.x; b.y = o.y; b.path.push({ x: o.x, y: o.y });
    for (const s of [-1, 1]) {
      const c = makeBall(o.x, o.y, a + s * L.spread);
      c.used = b.used | (1 << i); c.bounces = b.bounces; c.age = b.age; c.gen = b.gen + 1; c.hue = b.hue;
      born.push(c);
    }
    S.splits++;
    if (ev) ev("split", b, o.x, o.y, o);
  }
  function stepBall(S, b, walls, dt, ev, born) {
    const L = S.L, rx2 = L.rx * L.rx, ry2 = L.ry * L.ry, px = b.x, py = b.y;
    const dx = b.vx * dt, dy = b.vy * dt;
    let ex = px + dx, ey = py + dy, hit = false, tt = 1;
    if ((ex * ex) / rx2 + (ey * ey) / ry2 >= 1) {
      const A = (dx * dx) / rx2 + (dy * dy) / ry2, B = 2 * ((px * dx) / rx2 + (py * dy) / ry2), C = (px * px) / rx2 + (py * py) / ry2 - 1;
      tt = (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
      tt = Math.max(0, Math.min(1, tt));
      ex = px + dx * tt; ey = py + dy * tt; hit = true;
    }
    if (L.orbs) for (let i = 0; i < L.orbs.length; i++) {
      if (b.used & (1 << i)) continue;
      const o = L.orbs[i];
      if (ptSeg(o.x, o.y, px, py, ex, ey) < o.r + BALL_R && S.balls.length + born.length < MAX_BALLS) { split(S, b, i, born, ev); return; }
    }
    if (ev && L.gems) for (const g of L.gems) if (!g.taken && ptSeg(g.x, g.y, px, py, ex, ey) < g.r + BALL_R) ev("gem", b, g.x, g.y, g);
    if (ptSeg(L.target.x, L.target.y, px, py, ex, ey) < L.tr) {
      b.state = "hit"; b.x = L.target.x; b.y = L.target.y; b.path.push({ x: b.x, y: b.y }); S.hits++;
      if (ev) ev("hit", b, b.x, b.y); return;
    }
    if (L.holes) for (const h of L.holes) {
      if (ptSeg(h.x, h.y, px, py, ex, ey) < h.r) { b.state = "dead"; b.why = "hole"; b.x = h.x; b.y = h.y; b.path.push({ x: h.x, y: h.y }); if (ev) ev("hole", b, h.x, h.y); return; }
    }
    for (const w of walls) {
      if (segSeg(px, py, ex, ey, w.x1, w.y1, w.x2, w.y2) < WALL_W / 2 + BALL_R) {
        b.state = "dead"; b.why = "wall"; b.x = ex; b.y = ey; b.path.push({ x: ex, y: ey });
        if (ev) ev("wall", b, ex, ey); return;
      }
    }
    if (hit) {
      b.path.push({ x: ex, y: ey });
      if (!b.used && !L.noFall) { // touched the fence before any x2 point: the ball falls
        b.state = "fall"; b.why = "fall"; b.x = ex; b.y = ey; S.fail = "fall";
        if (ev) ev("fall", b, ex, ey); return;
      }
      b.bounces++;
      if (b.bounces > L.maxB) { b.state = "dead"; b.why = "bounces"; b.x = ex; b.y = ey; if (ev) ev("over", b, ex, ey); return; }
      let nx = ex / rx2, ny = ey / ry2; const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
      const dot = b.vx * nx + b.vy * ny;
      b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
      const rem = 1 - tt;
      b.x = ex * 0.9995 + b.vx * dt * rem; b.y = ey * 0.9995 + b.vy * dt * rem;
      if (ev) ev("bounce", b, ex, ey);
    } else { b.x = ex; b.y = ey; }
    b.age += dt;
    if (b.age > MAX_AGE) { b.state = "dead"; b.why = "lost"; b.path.push({ x: b.x, y: b.y }); if (ev) ev("lost", b, b.x, b.y); }
  }
  function stepSim(S, dt, ev) {
    if (S.done) return;
    const walls = wallsAt(S.L, S.t); S.t += dt;
    const born = [];
    for (const b of S.balls) { if (b.state === "live") stepBall(S, b, walls, dt, ev, born); if (S.fail) break; }
    for (const c of born) S.balls.push(c);
    if (S.fail || S.balls.every((b) => b.state !== "live")) S.done = true;
  }
  function simulate(L, ang, t0, dt) {
    const S = newSim(L, ang, t0);
    dt = dt || DT;
    while (!S.done) stepSim(S, dt, null);
    return S;
  }

  // ---- solver ----
  // first thing a straight shot meets: only shots that reach an x2 point first can win
  function firstIsOrb(L, a, t0) {
    const ux = Math.cos(a), uy = Math.sin(a), sx = L.start.x, sy = L.start.y;
    let tO = Infinity;
    for (const o of L.orbs) tO = Math.min(tO, rayCircle(sx, sy, ux, uy, o.x, o.y, o.r + BALL_R));
    if (tO === Infinity) return false;
    if (rayEllipse(sx, sy, ux, uy, L.rx, L.ry) < tO) return false;
    if (rayCircle(sx, sy, ux, uy, L.target.x, L.target.y, L.tr) < tO) return false;
    for (const h of L.holes || []) if (rayCircle(sx, sy, ux, uy, h.x, h.y, h.r) < tO) return false;
    for (const w of wallsAt(L, t0)) if (raySeg(sx, sy, ux, uy, w) < tO) return false;
    return true;
  }
  function solve(L, N, dt) {
    N = N || 720; dt = dt || 1 / 75;
    const times = moving(L) ? [0, 1.1, 2.3] : [0];
    let ok = 0, thr = 0; const good = [];
    for (const t0 of times) for (let k = 0; k < N; k++) {
      const a = ((k + 0.5) / N) * TAU;
      if (!firstIsOrb(L, a, t0)) continue;
      const S = simulate(L, a, t0, dt);
      if (S.fail === "fall" && S.splits === 0) continue;
      thr++;
      if (!S.fail && S.hits >= L.need) { ok++; if (t0 === 0) good.push(a); }
    }
    // okPer = winning directions per 360 deg, per start time (in half-degree units when N=720)
    return { f: thr ? ok / thr : 0, okPer: ok / times.length, ok, thr, good, N };
  }

  // ---- level generation ----
  // tutorial level: always the same lesson, but its layout varies with the game's seed
  function fixedLevelOne(seed) {
    const r = mulberry32(mixSeed(seed, 1) + 777);
    const rx = 185 + Math.round(r() * 30), ry = 300, F = foci(rx, ry);
    let best = null;
    for (let at = 0; at < 12; at++) {
      const sx = -(90 + r() * 50), sy = 20 + r() * 90, ox = 70 + r() * 60, oy = -60 + r() * 140;
      const L = { n: 1, type: "tir", rx, ry, start: { x: sx, y: sy }, target: F[1], targetIdx: 1, maxB: 3, need: 2, spread: 0.14, tr: 18,
        orbs: [{ x: F[0].x, y: F[0].y, r: 15, focus: true }, { x: ox, y: oy, r: 15 }], hidden: false,
        walls: [], holes: [], gems: [], features: ["orb", "focus"] };
      const sol = solve(L); L.f = sol.f; L.okPer = sol.okPer;
      if (sol.ok > 0 && (!best || Math.abs(L.f - 0.45) < Math.abs(best.f - 0.45))) best = L;
      if (L.f > 0.3 && L.f < 0.65) break;
    }
    return best;
  }
  function mixSeed(seed, n) { return ((seed >>> 0) ^ Math.imul(n, 2654435761)) >>> 0; }
  // mirror a level left/right and/or top/bottom: the ellipse is symmetric, so solvability is unchanged
  function mirror(L, fx, fy) {
    if (!fx && !fy) return L;
    const sx = fx ? -1 : 1, sy = fy ? -1 : 1;
    const P = (p) => { if (p) { p.x *= sx; p.y *= sy; } };
    [L.start, L.target, L.other].forEach(P);
    (L.orbs || []).forEach(P); (L.gems || []).forEach(P); (L.holes || []).forEach(P);
    for (const w of L.walls) {
      if (w.rot) {
        w.rot.cx *= sx; w.rot.cy *= sy;
        if (fx) w.rot.a0 = Math.PI - w.rot.a0;
        if (fy) w.rot.a0 = -w.rot.a0;
        if (fx !== fy) w.rot.speed = -w.rot.speed;
      } else {
        w.x1 *= sx; w.x2 *= sx; w.y1 *= sy; w.y2 *= sy;
        if (w.slide) { w.slide.dx *= sx; w.slide.dy *= sy; }
      }
    }
    if (fy) L.targetIdx = 1 - L.targetIdx;
    return L;
  }
  function genLevel(n, seed) {
    seed = seed >>> 0;
    const r = mulberry32(mixSeed(seed, n) + 4242);
    const L = n === 1 ? fixedLevelOne(seed) : genRaw(n, seed);
    mirror(L, r() < 0.5, n !== 1 && r() < 0.5);
    L.seed = seed;
    return L;
  }
  function randomInside(r, L, k, ok) {
    for (let i = 0; i < 300; i++) {
      const a = r() * TAU, s = Math.sqrt(r()) * k, x = Math.cos(a) * L.rx * s, y = Math.sin(a) * L.ry * s;
      if (ok(x, y)) return { x, y };
    }
    return null;
  }
  function genBonus(n, seed) {
    const r = mulberry32(mixSeed(seed, n) + 99);
    const rx = Math.round(150 + r() * 70), ry = 300, F = foci(rx, ry), ti = r() < 0.5 ? 1 : 0;
    const L = { n, type: "salve", rx, ry, target: F[ti], targetIdx: ti, other: F[1 - ti], maxB: 1, tr: 22, noFall: true,
      hidden: n >= 15, walls: [], holes: [], orbs: [], gems: [], balls: 64, need: 0, spread: 0, features: ["bonus"] };
    if (n >= 20) { const y = (r() < 0.5 ? -1 : 1) * 40; L.walls.push({ x1: -25, y1: y, x2: 25, y2: y }); }
    L.start = { x: 0, y: -Math.sign(L.target.y) * ry * 0.2 };
    if (L.hidden) L.features.push("hidden");
    return L;
  }
  function band(n) {
    const d = n - 1;
    return { hi: Math.max(0.22, 0.98 * Math.pow(0.955, d)), lo: Math.max(0.05, 0.5 * Math.pow(0.93, d)), minOk: n < 10 ? 6 : n < 25 ? 4 : n < 50 ? 3 : 2 };
  }
  function genRaw(n, seed) {
    if (n % 5 === 0) return genBonus(n, seed);
    const d = n - 1, B = band(n), T0 = Date.now();
    let best = null, bestScore = Infinity;
    for (let at = 0; at < 90; at++) {
      if (best && Date.now() - T0 > 450) break;
      const r = mulberry32(mixSeed(seed, n) + at * 104729 + 13);
      const rx = Math.round(150 + r() * 75), ry = 300, F = foci(rx, ry);
      const ti = r() < 0.5 ? 1 : 0, target = F[ti], other = F[1 - ti];
      const L = { n, type: "tir", rx, ry, target, targetIdx: ti, tr: Math.max(11, 18 - d * 0.1), walls: [], holes: [], orbs: [], gems: [], features: [] };
      // rules
      L.maxB = n < 6 ? 3 : n < 14 ? (r() < 0.7 ? 3 : 2) : r() < 0.4 ? 3 : r() < 0.7 ? 2 : 1;
      L.need = n < 6 ? 2 : n < 14 ? (r() < 0.35 ? 3 : 2) : r() < 0.3 ? 4 : r() < 0.55 ? 3 : 2;
      L.spread = 0.12 + Math.min(0.16, d * 0.005) + r() * 0.05;
      L.hidden = n >= 9 && r() < Math.min(0.6, 0.25 + (n - 9) * 0.03);
      const nRot = n >= 7 && r() < Math.min(0.45, 0.2 + (n - 7) * 0.02) ? (n > 30 && r() < 0.3 ? 2 : 1) : 0;
      const nSlide = n >= 11 && r() < Math.min(0.5, 0.25 + (n - 11) * 0.02) ? (n > 35 && r() < 0.3 ? 2 : 1) : 0;
      const nHole = n >= 16 && r() < Math.min(0.6, 0.25 + (n - 16) * 0.02) ? (n > 30 && r() < 0.4 ? 2 : 1) : 0;
      L.timer = n >= 21 && r() < Math.min(0.5, 0.2 + (n - 21) * 0.02) ? Math.max(4, Math.round(10 - (n - 21) * 0.08)) : 0;
      const hard = (L.hidden ? 1 : 0) + (nRot ? 1 : 0) + (nSlide ? 1 : 0) + (nHole ? 1 : 0) + (L.timer ? 1 : 0) + (L.maxB === 1 ? 1 : 0) + (L.need >= 3 ? 1 : 0);
      if (hard > 1 + Math.floor(n / 7)) continue;
      // start + orbs
      const far = (p, q, m) => Math.hypot(p.x - q.x, p.y - q.y) > m;
      const start = randomInside(r, L, 0.78, (x, y) => far({ x, y }, target, 160) && far({ x, y }, other, 50));
      if (!start) continue;
      L.start = start;
      const orbR = Math.max(8, 14 - d * 0.1);
      const pFocus = n <= 4 ? 1 : Math.max(0.2, 1 - (n - 4) * 0.035);
      let o1 = r() < pFocus ? { x: other.x, y: other.y, r: orbR, focus: true }
        : (() => { const p = randomInside(r, L, 0.75, (x, y) => far({ x, y }, start, 70) && far({ x, y }, target, 80)); return p && { x: p.x, y: p.y, r: orbR }; })();
      if (!o1) continue;
      let p2 = null;
      if (L.need >= 3) { // place the 2nd x2 point on the route of a duplicated ball so 3+ balls are reachable
        const a0 = Math.atan2(o1.y - start.y, o1.x - start.x) + (r() - 0.5) * 0.05;
        const T = Object.assign({}, L, { orbs: [o1], need: 99, walls: [], holes: [] });
        const S0 = simulate(T, a0, 0, 1 / 120);
        const kids = S0.balls.filter((b) => b.gen === 1 && b.state === "hit");
        if (kids.length) {
          const path = kids[Math.floor(r() * kids.length)].path, k = Math.min(path.length - 1, 1 + Math.floor(r() * (path.length - 1)));
          const q0 = path[k - 1], q1 = path[k], u = 0.25 + r() * 0.5, c = { x: q0.x + (q1.x - q0.x) * u, y: q0.y + (q1.y - q0.y) * u };
          if (far(c, start, 60) && far(c, target, 70) && far(c, o1, 70)) p2 = c;
        }
      }
      if (!p2) p2 = randomInside(r, L, 0.75, (x, y) => far({ x, y }, start, 70) && far({ x, y }, target, 80) && far({ x, y }, o1, 90));
      if (!p2) continue;
      L.orbs = [o1, { x: p2.x, y: p2.y, r: orbR }];
      if (r() < 0.5) L.orbs.reverse();
      const keyPts = [start, target].concat(L.orbs);
      const segClear = (x1, y1, x2, y2, m) => keyPts.every((p) => ptSeg(p.x, p.y, x1, y1, x2, y2) > m);
      const nWalls = Math.min(6, Math.floor(d / 5) + (n === 2 || r() < 0.5 ? 1 : 0));
      for (let i = 0; i < nWalls + nSlide; i++) {
        for (let tries = 0; tries < 30; tries++) {
          const c = randomInside(r, L, 0.8, () => true), a = r() * Math.PI, len = 40 + r() * (40 + Math.min(130, d * 4));
          const x1 = c.x - (Math.cos(a) * len) / 2, y1 = c.y - (Math.sin(a) * len) / 2, x2 = c.x + (Math.cos(a) * len) / 2, y2 = c.y + (Math.sin(a) * len) / 2;
          if (!inside(L, x1, y1, 0.9) || !inside(L, x2, y2, 0.9)) continue;
          const w = { x1, y1, x2, y2 };
          if (i >= nWalls) {
            const amp = 25 + r() * 35;
            w.slide = { dx: -Math.sin(a), dy: Math.cos(a), amp, speed: (0.8 + r() * Math.min(1.2, d * 0.02)) * (r() < 0.5 ? -1 : 1), ph: r() * TAU };
            const ox = w.slide.dx * amp, oy = w.slide.dy * amp;
            if (!inside(L, x1 + ox, y1 + oy, 0.95) || !inside(L, x2 + ox, y2 + oy, 0.95) || !inside(L, x1 - ox, y1 - oy, 0.95) || !inside(L, x2 - ox, y2 - oy, 0.95)) continue;
            if (!segClear(x1 + ox, y1 + oy, x2 + ox, y2 + oy, 28) || !segClear(x1 - ox, y1 - oy, x2 - ox, y2 - oy, 28) || !segClear(x1, y1, x2, y2, 28)) continue;
          } else if (!segClear(x1, y1, x2, y2, 28)) continue;
          L.walls.push(w); break;
        }
      }
      for (let i = 0; i < nRot; i++) {
        for (let tries = 0; tries < 30; tries++) {
          const c = randomInside(r, L, 0.5, () => true), len = 80 + r() * Math.min(160, 60 + d * 3);
          if (!inside(L, c.x + len / 2, c.y, 0.97) || !inside(L, c.x, c.y + len / 2, 0.97) || !inside(L, c.x - len / 2, c.y, 0.97) || !inside(L, c.x, c.y - len / 2, 0.97)) continue;
          if (!keyPts.every((p) => Math.hypot(c.x - p.x, c.y - p.y) > len / 2 + 24)) continue;
          L.walls.push({ rot: { cx: c.x, cy: c.y, len, speed: (0.6 + r() * Math.min(1.3, 0.2 + d * 0.03)) * (r() < 0.5 ? -1 : 1), a0: r() * TAU } }); break;
        }
      }
      for (let i = 0; i < nHole; i++) {
        const hr = 14 + r() * 8;
        const p = randomInside(r, L, 0.7, (x, y) => keyPts.every((q) => Math.hypot(x - q.x, y - q.y) > hr + 45) && L.holes.every((h) => Math.hypot(x - h.x, y - h.y) > 80));
        if (p) L.holes.push({ x: p.x, y: p.y, r: hr });
      }
      const q = solve(L, 180, 1 / 50);
      if (q.ok === 0 || (best && (q.f > B.hi + 0.25 || q.f < B.lo - 0.2))) continue;
      const res = solve(L, 720);
      if (res.okPer < 2) continue;
      L.f = res.f; L.okPer = res.okPer; L._good = res.good;
      let sc = res.f > B.hi ? res.f - B.hi : res.f < B.lo ? (B.lo - res.f) * 2 : 0;
      if (res.okPer < B.minOk) sc += (B.minOk - res.okPer) * 0.05;
      if (sc < bestScore) { best = L; bestScore = sc; }
      if (sc === 0) break;
    }
    if (!best) { const alt = genRaw(n, seed + 1); alt.n = n; return alt; } // extremely unlikely fallback: borrow a layout
    const L = best; L.n = n;
    L.features.push("orb");
    if (L.orbs.some((o) => o.focus)) L.features.push("focus");
    if (L.hidden) L.features.push("hidden");
    if (L.walls.some((w) => w.rot)) L.features.push("rot");
    if (L.walls.some((w) => w.slide)) L.features.push("slide");
    if (L.holes.length) L.features.push("hole");
    if (L.timer) L.features.push("timer");
    if (L.need >= 3) L.features.push("need" + L.need);
    if (L.maxB < 3) L.features.push("fence" + L.maxB);
    // gems along a winning path
    const r = mulberry32(mixSeed(seed, n) + 31337), good = L._good || [];
    const nG = n >= 3 ? (r() < 0.6 ? 1 : 0) + (n >= 12 && r() < 0.35 ? 1 : 0) : 0;
    for (let i = 0; i < nG && good.length; i++) {
      const S = simulate(L, good[Math.floor(r() * good.length)], 0, 1 / 240);
      const winners = S.balls.filter((b) => b.state === "hit");
      if (!winners.length) continue;
      const path = winners[Math.floor(r() * winners.length)].path;
      const k = 1 + Math.floor(r() * (path.length - 2));
      const p0 = path[Math.max(0, k - 1)], p1 = path[k], u = 0.3 + r() * 0.4;
      const g = { x: p0.x + (p1.x - p0.x) * u, y: p0.y + (p1.y - p0.y) * u, r: 9, taken: false };
      const pts = [L.start, L.target].concat(L.orbs, L.gems);
      if (pts.every((q) => Math.hypot(q.x - g.x, q.y - g.y) > 45)) L.gems.push(g);
    }
    if (L.gems.length) L.features.push("gem");
    delete L._good;
    return L;
  }

  return { TAU, SPEED, DT, BALL_R, WALL_W, MAX_AGE, mulberry32, foci, wallsAt, moving, ptSeg, rayEllipse, raySeg, rayCircle, inside, makeBall, newSim, stepSim, simulate, solve, genLevel, band };
})();
if (typeof module !== "undefined") module.exports = ENGINE;
