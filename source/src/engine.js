// ===== Ellipso engine: physics, x2 orbs, procedural levels =====
var ENGINE = (function () {
  "use strict";
  const TAU = Math.PI * 2;
  const SPEED = 340, DT = 1 / 240, BALL_R = 4, WALL_W = 7, MAX_AGE = 10, MAX_BALLS = 160;

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
  function moving(L) { return L.walls.some((w) => w.rot || w.slide) || (L.orbs || []).some((o) => o.move); }
  function orbsAt(L, t) {
    return (L.orbs || []).map((o) => {
      if (!o.move) return o;
      const m = o.move, k = Math.sin(t * m.speed + m.ph);
      return { x: o.x + m.ax * k, y: o.y + m.ay * k, r: o.r, focus: o.focus, move: m };
    });
  }
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
    const L = S.L, o = S.orbs[i], a = Math.atan2(b.vy, b.vx);
    b.state = "split"; b.x = o.x; b.y = o.y; b.path.push({ x: o.x, y: o.y });
    const m = o.m || 2; // x2, x3, x4…: the ball becomes m balls fanned out around its direction
    const offs = m === 2 ? [-1, 1] : Array.from({ length: m }, (_, j) => -1 + (2 * j) / (m - 1));
    for (const s of offs) {
      const c = makeBall(o.x, o.y, a + s * L.spread);
      c.used = b.used | (1 << i); c.bounces = b.bounces; c.age = b.age; c.gen = b.gen + 1; c.hue = b.hue;
      born.push(c);
    }
    S.splits++;
    if (ev) ev("split", b, o.x, o.y, o);
  }
  function stepBall(S, b, walls, dt, ev, born) {
    if (b.age > MAX_AGE) { b.state = "dead"; b.why = "lost"; b.path.push({ x: b.x, y: b.y }); if (ev) ev("lost", b, b.x, b.y); return; }
    const L = S.L, rx2 = L.rx * L.rx, ry2 = L.ry * L.ry, px = b.x, py = b.y;
    const dx = b.vx * dt, dy = b.vy * dt;
    let ex = px + dx, ey = py + dy, hit = false, tt = 1;
    if ((ex * ex) / rx2 + (ey * ey) / ry2 >= 1) {
      const A = (dx * dx) / rx2 + (dy * dy) / ry2, B = 2 * ((px * dx) / rx2 + (py * dy) / ry2), C = (px * px) / rx2 + (py * py) / ry2 - 1;
      tt = (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
      tt = Math.max(0, Math.min(1, tt));
      ex = px + dx * tt; ey = py + dy * tt; hit = true;
    }
    if (S.orbs) for (let i = 0; i < S.orbs.length; i++) {
      if (b.used & (1 << i)) continue;
      const o = S.orbs[i];
      if (ptSeg(o.x, o.y, px, py, ex, ey) < o.r + BALL_R && S.balls.length + born.length + (o.m || 2) <= MAX_BALLS) { split(S, b, i, born, ev); return; }
    }
    if (L.portals && !(b.pcool > 0)) for (const P of L.portals) {
      for (const [a, z] of [[P.a, P.b], [P.b, P.a]]) {
        if (ptSeg(a.x, a.y, px, py, ex, ey) < P.r) {
          b.path.push({ x: a.x, y: a.y }); b.path.push({ x: NaN, y: NaN }); b.path.push({ x: z.x, y: z.y });
          b.x = z.x; b.y = z.y; b.pcool = 0.25; b.age += dt;
          if (ev) ev("portal", b, a.x, a.y, z); return;
        }
      }
    }
    if (b.pcool > 0) b.pcool -= dt;
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
        if (w.bump) { // bumper: reflects the ball, does not count as a fence contact
          let nx = -(w.y2 - w.y1), ny = w.x2 - w.x1; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
          const dot = b.vx * nx + b.vy * ny; b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
          b.path.push({ x: px, y: py }); b.x = px; b.y = py; b.age += dt;
          if (ev) ev("bump", b, px, py); return;
        }
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
    const walls = wallsAt(S.L, S.t); S.orbs = orbsAt(S.L, S.t); S.t += dt;
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
    for (const o of orbsAt(L, t0)) tO = Math.min(tO, rayCircle(sx, sy, ux, uy, o.x, o.y, o.r + BALL_R + (o.move ? 30 : 0)));
    let tX = Infinity; // bumpers and portals redirect the ball: let the full simulation decide
    for (const w of wallsAt(L, t0)) if (w.bump) tX = Math.min(tX, raySeg(sx, sy, ux, uy, w));
    for (const P of L.portals || []) tX = Math.min(tX, rayCircle(sx, sy, ux, uy, P.a.x, P.a.y, P.r), rayCircle(sx, sy, ux, uy, P.b.x, P.b.y, P.r));
    if (tX < tO && tX < rayEllipse(sx, sy, ux, uy, L.rx, L.ry)) return true;
    if (tO === Infinity) return false;
    if (rayEllipse(sx, sy, ux, uy, L.rx, L.ry) < tO) return false;
    if (rayCircle(sx, sy, ux, uy, L.target.x, L.target.y, L.tr) < tO) return false;
    for (const h of L.holes || []) if (rayCircle(sx, sy, ux, uy, h.x, h.y, h.r) < tO) return false;
    for (const w of wallsAt(L, t0)) if (!w.bump && raySeg(sx, sy, ux, uy, w) < tO) return false;
    return true;
  }
  function solve(L, N, dt) {
    N = N || 720; dt = dt || 1 / 75;
    const times = moving(L) ? [0, 1.1, 2.3] : [0];
    let ok = 0, thr = 0, maxHits = 0, bestAng = null; const good = [], hits = [];
    for (const t0 of times) for (let k = 0; k < N; k++) {
      const a = ((k + 0.5) / N) * TAU;
      if (!firstIsOrb(L, a, t0)) continue;
      const S = simulate(L, a, t0, dt);
      if (S.fail === "fall" && S.splits === 0) continue;
      thr++;
      const h = S.fail ? 0 : S.hits; hits.push(h);
      if (h > maxHits && t0 === 0) { maxHits = h; bestAng = a; }
      if (h >= L.need) { ok++; if (t0 === 0) good.push(a); }
    }
    // okPer = winning directions per 360 deg, per start time (in half-degree units when N=720)
    return { f: thr ? ok / thr : 0, okPer: ok / times.length, ok, thr, good, N, maxHits, bestAng, hits, nTimes: times.length };
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
    (L.orbs || []).forEach((o) => { P(o); if (o.move) { o.move.ax *= sx; o.move.ay *= sy; } });
    (L.gems || []).forEach(P); (L.holes || []).forEach(P); (L.fog || []).forEach(P);
    (L.portals || []).forEach((q) => { P(q.a); P(q.b); });
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
    if (L.bestAng != null) { if (fx) L.bestAng = Math.PI - L.bestAng; if (fy) L.bestAng = -L.bestAng; }
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
  const THEMES = ["or", "galaxie", "glace", "feu", "arcenciel", "jungle"];
  function genBonus(n, seed) {
    const r = mulberry32(mixSeed(seed, n) + 99);
    const k = Math.floor(n / 5), theme = THEMES[(k + (seed % THEMES.length)) % THEMES.length];
    const rx = Math.round(120 + r() * 110), ry = 300, F = foci(rx, ry), ti = r() < 0.5 ? 1 : 0;
    const L = { n, type: "salve", theme, rx, ry, target: F[ti], targetIdx: ti, other: F[1 - ti], maxB: 1, tr: 22, noFall: true,
      hidden: n >= 15 && r() < 0.5, walls: [], holes: [], orbs: [], gems: [], balls: 48 + Math.min(40, k * 4), need: 0, spread: 0, features: ["bonus"] };
    const ng = 3 + Math.floor(r() * 4); // crystals placed on the paths of a perfect salvo
    for (let i = 0; i < ng; i++) {
      const a = r() * TAU, u = rayEllipse(L.other.x, L.other.y, Math.cos(a), Math.sin(a), rx, ry);
      const P = { x: L.other.x + Math.cos(a) * u, y: L.other.y + Math.sin(a) * u }, w = 0.25 + r() * 0.5;
      const g = r() < 0.5 ? { x: L.other.x + (P.x - L.other.x) * w, y: L.other.y + (P.y - L.other.y) * w } : { x: P.x + (L.target.x - P.x) * w, y: P.y + (L.target.y - P.y) * w };
      if ([L.target, L.other].concat(L.gems).every((q) => Math.hypot(q.x - g.x, q.y - g.y) > 40)) L.gems.push({ x: g.x, y: g.y, r: 9, taken: false });
    }
    if (n >= 20) { const y = (r() < 0.5 ? -1 : 1) * 40; L.walls.push({ x1: -25, y1: y, x2: 25, y2: y }); }
    L.start = { x: 0, y: -Math.sign(L.target.y) * ry * 0.2 };
    if (L.hidden) L.features.push("hidden");
    return L;
  }
  function band(n) {
    const d = n - 1;
    return { hi: Math.max(0.22, 0.98 * Math.pow(0.955, d)), lo: Math.max(0.05, 0.5 * Math.pow(0.93, d)), minOk: n < 10 ? 6 : n < 25 ? 4 : n < 50 ? 3 : 2 };
  }
  // ---- cascade levels: x2 -> x3 -> x4 ... chained in a line, the last multiplier sits on the free focus,
  // so every ball it produces bounces once and converges on the target (the focal property, at scale)
  function genCascade(n, seed, opts) {
    opts = opts || {};
    const d = n - 1, T0 = Date.now();
    let best = null, bestScore = Infinity;
    for (let at = 0; at < 60; at++) {
      if (best && Date.now() - T0 > 500) break;
      const r = mulberry32(mixSeed(seed, n) + at * 7919 + 555);
      const rx = Math.round(155 + r() * 70), ry = 300, F = foci(rx, ry), ti = r() < 0.5 ? 1 : 0, target = F[ti], other = F[1 - ti];
      const L = { n, type: "tir", cascade: true, rx, ry, target, targetIdx: ti, walls: [], holes: [], orbs: [], gems: [], features: [], hidden: false };
      const depth = opts.depth || (n < 6 ? 2 : n < 14 ? (r() < 0.55 ? 3 : 2) : n < 30 ? (r() < 0.6 ? 3 : r() < 0.5 ? 4 : 2) : r() < 0.5 ? 4 : 3);
      const mults = [];
      for (let k = 0; k < depth; k++) mults.push(k === depth - 1 ? 3 + Math.floor(r() * (opts.big ? 3 : 2)) : 2 + Math.floor(r() * 2));
      if (depth >= 4) mults[0] = 2;
      while (mults.reduce((a, b) => a * b, 1) > 140) mults[mults.indexOf(Math.max(...mults.slice(0, -1)))]--;
      L.spread = 0.05 + r() * 0.02;
      L.maxB = opts.big ? 3 : n < 10 ? 3 : r() < 0.6 ? 3 : 2;
      L.tr = 18;
      const orbR = Math.max(13, 17 - d * 0.05);
      // build the chain backwards from the free focus
      const chain = new Array(depth);
      chain[depth - 1] = { x: other.x, y: other.y, r: orbR + 2, m: mults[depth - 1], focus: true };
      let pos = chain[depth - 1], th = r() * TAU, ok = true;
      const far = (p, q, m) => Math.hypot(p.x - q.x, p.y - q.y) > m;
      for (let k = depth - 2; k >= 0 && ok; k--) {
        let placed = false;
        for (let tries = 0; tries < 25 && !placed; tries++) {
          const t = tries ? r() * TAU : th, dist = 85 + r() * 55;
          const q = { x: pos.x - Math.cos(t) * dist, y: pos.y - Math.sin(t) * dist };
          if (!inside(L, q.x, q.y, 0.78) || !far(q, target, 70) || !chain.every((o) => !o || far(q, o, 70))) continue;
          const m = mults[k], offs = m === 2 ? [-1, 1] : Array.from({ length: m }, (_, j) => -1 + (2 * j) / (m - 1));
          const off = offs[Math.floor(r() * offs.length)] * L.spread; // which fan member continues the chain
          chain[k] = { x: q.x, y: q.y, r: orbR, m };
          th = t - off; pos = chain[k]; placed = true;
        }
        if (!placed) ok = false;
      }
      if (!ok) continue;
      let start = null;
      for (let tries = 0; tries < 20 && !start; tries++) {
        const dist = 75 + r() * 70, q = { x: pos.x - Math.cos(th) * dist, y: pos.y - Math.sin(th) * dist };
        if (inside(L, q.x, q.y, 0.85) && far(q, target, 120) && chain.every((o) => far(q, o, 60))) start = q;
        else th += (r() - 0.5) * 0.02;
      }
      if (!start) continue;
      L.start = start; L.orbs = chain.slice();
      // optional decoy x2 elsewhere
      if (n >= 6 && r() < 0.5) {
        const p = randomInside(r, L, 0.75, (x, y) => far({ x, y }, start, 70) && far({ x, y }, target, 70) && chain.every((o) => far({ x, y }, o, 70)));
        if (p) L.orbs.push({ x: p.x, y: p.y, r: orbR, m: 2 });
      }
      // obstacles kept clear of the designed line
      const line = [start].concat(chain);
      const clearOf = (x1, y1, x2, y2, m) => line.every((p) => ptSeg(p.x, p.y, x1, y1, x2, y2) > m) && ptSeg(target.x, target.y, x1, y1, x2, y2) > m
        && line.every((p, i) => i === 0 || segSeg(line[i - 1].x, line[i - 1].y, p.x, p.y, x1, y1, x2, y2) > m);
      const nWalls = opts.big ? 0 : Math.min(5, Math.floor(d / 5) + (r() < 0.4 ? 1 : 0));
      for (let i = 0; i < nWalls; i++) for (let tries = 0; tries < 30; tries++) {
        const c = randomInside(r, L, 0.8, () => true), a = r() * Math.PI, len = 40 + r() * (40 + Math.min(110, d * 4));
        const x1 = c.x - (Math.cos(a) * len) / 2, y1 = c.y - (Math.sin(a) * len) / 2, x2 = c.x + (Math.cos(a) * len) / 2, y2 = c.y + (Math.sin(a) * len) / 2;
        if (!inside(L, x1, y1, 0.9) || !inside(L, x2, y2, 0.9) || !clearOf(x1, y1, x2, y2, 28)) continue;
        const w = { x1, y1, x2, y2 };
        if (n >= 8 && r() < 0.3) w.bump = true;
        L.walls.push(w); break;
      }
      if (!opts.big && n >= 9 && r() < Math.min(0.4, 0.15 + (n - 9) * 0.015)) for (let tries = 0; tries < 30; tries++) {
        const c = randomInside(r, L, 0.55, () => true), len = 70 + r() * 90;
        if ([[1, 0], [0, 1], [-1, 0], [0, -1]].some(([u, v]) => !inside(L, c.x + (u * len) / 2, c.y + (v * len) / 2, 0.95))) continue;
        if (!line.concat([target]).every((p) => Math.hypot(c.x - p.x, c.y - p.y) > len / 2 + 22)) continue;
        L.walls.push({ rot: { cx: c.x, cy: c.y, len, speed: (0.5 + r() * 0.8) * (r() < 0.5 ? -1 : 1), a0: r() * TAU } }); break;
      }
      if (!opts.big && n >= 16 && r() < 0.35) {
        const hr = 14 + r() * 6, p = randomInside(r, L, 0.7, (x, y) => line.concat([target]).every((q) => Math.hypot(x - q.x, y - q.y) > hr + 45) && line.every((q, i) => i === 0 || ptSeg(x, y, line[i - 1].x, line[i - 1].y, q.x, q.y) > hr + 25));
        if (p) L.holes.push({ x: p.x, y: p.y, r: hr });
      }
      // measure: best possible number of balls, and how forgiving the aim is
      L.need = 1;
      const res = solve(L, 720);
      const top = res.maxHits;
      if (top < chain[depth - 1].m + 1) continue;
      L.need = Math.max(2, Math.round(top * (opts.big ? 0.3 : n < 6 ? 0.3 : 0.4)));
      L.star2 = Math.max(L.need + 1, Math.round(top * 0.7)); L.star3 = Math.max(L.star2 + 1, top);
      const ok2 = res.hits.filter((h) => h >= L.need).length;
      L.f = res.thr ? ok2 / res.thr : 0; L.okPer = ok2 / res.nTimes; L.bestAng = res.bestAng; L.maxHits = top; L.mults = mults;
      L._good = res.good.length ? res.good : [res.bestAng];
      const prod = mults.reduce((x, y) => x * y, 1);
      const sc = (L.okPer < 3 ? 3 - L.okPer : 0) + Math.max(0, 0.6 - top / prod) * 6 + (opts.big ? -top / 100 : 0);
      if (!best || sc < bestScore) { best = L; bestScore = sc; }
      if (sc <= 0 && !opts.big) break;
    }
    return best;
  }
  // showcase levels for the demo mode: long chains, no obstacles, the biggest convergence we can build
  function genDemo(n, seed) {
    const L = genCascade(n, seed, { depth: n % 3 === 0 ? 3 : 4, big: true });
    if (!L) return null;
    const r = mulberry32(mixSeed(seed, n) + 99);
    mirror(L, r() < 0.5, r() < 0.5);
    L.n = n; L.demo = true; L.features = ["cascade"]; delete L._good;
    return L;
  }
  function genRaw(n, seed) {
    if (n % 5 === 0) return genBonus(n, seed);
    if (n >= 2) {
      const rc = mulberry32(mixSeed(seed, n) + 2024);
      if (n === 2 || rc() < (n < 8 ? 0.7 : 0.6)) {
        const C = genCascade(n, seed);
        if (C) { finishLevel(C, n, seed); return C; }
      }
    }
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
      const nBump = n >= 8 && r() < Math.min(0.5, 0.25 + (n - 8) * 0.02) ? (n > 25 && r() < 0.4 ? 2 : 1) : 0;
      const nPortal = n >= 18 && r() < Math.min(0.45, 0.25 + (n - 18) * 0.015) ? 1 : 0;
      const moveOrb = n >= 24 && r() < Math.min(0.45, 0.2 + (n - 24) * 0.015);
      const nFog = n >= 28 && r() < Math.min(0.45, 0.2 + (n - 28) * 0.015) ? (n > 45 && r() < 0.4 ? 2 : 1) : 0;
      const hard = (L.hidden ? 1 : 0) + (nRot ? 1 : 0) + (nSlide ? 1 : 0) + (nHole ? 1 : 0) + (L.timer ? 1 : 0) + (L.maxB === 1 ? 1 : 0) + (L.need >= 3 ? 1 : 0)
        + (nPortal ? 1 : 0) + (moveOrb ? 1 : 0) + (nFog ? 1 : 0);
      if (hard > 1 + Math.floor(n / 7)) continue;
      // start + orbs
      const far = (p, q, m) => Math.hypot(p.x - q.x, p.y - q.y) > m;
      const start = randomInside(r, L, 0.78, (x, y) => far({ x, y }, target, 160) && far({ x, y }, other, 50));
      if (!start) continue;
      L.start = start;
      const orbR = Math.max(8, 14 - d * 0.1);
      // never put a x2 point on a focus when foci are hidden: it would give their position away
      const pFocus = L.hidden ? 0 : n <= 4 ? 1 : Math.max(0.2, 1 - (n - 4) * 0.035);
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
      if (moveOrb) { // the non-focus x2 point drifts back and forth
        const o = L.orbs[1], a = r() * TAU, amp = 22 + r() * 22;
        if (inside(L, o.x + Math.cos(a) * amp, o.y + Math.sin(a) * amp, 0.85) && inside(L, o.x - Math.cos(a) * amp, o.y - Math.sin(a) * amp, 0.85))
          o.move = { ax: Math.cos(a) * amp, ay: Math.sin(a) * amp, speed: 0.9 + r() * 0.8, ph: r() * TAU };
      }
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
      for (let i = 0; i < nBump; i++) {
        for (let tries = 0; tries < 30; tries++) {
          const c = randomInside(r, L, 0.75, () => true), a = r() * Math.PI, len = 45 + r() * 50;
          const x1 = c.x - (Math.cos(a) * len) / 2, y1 = c.y - (Math.sin(a) * len) / 2, x2 = c.x + (Math.cos(a) * len) / 2, y2 = c.y + (Math.sin(a) * len) / 2;
          if (!inside(L, x1, y1, 0.9) || !inside(L, x2, y2, 0.9) || !segClear(x1, y1, x2, y2, 30)) continue;
          L.walls.push({ x1, y1, x2, y2, bump: true }); break;
        }
      }
      for (let i = 0; i < nPortal; i++) {
        const pr = 13;
        const ok = (x, y) => keyPts.every((q) => Math.hypot(x - q.x, y - q.y) > 55) && L.walls.every((w) => w.rot || ptSeg(x, y, w.x1, w.y1, w.x2, w.y2) > 30);
        const a = randomInside(r, L, 0.72, ok); if (!a) continue;
        const b = randomInside(r, L, 0.72, (x, y) => ok(x, y) && Math.hypot(x - a.x, y - a.y) > 170); if (!b) continue;
        L.portals = [{ a, b, r: pr }];
      }
      for (let i = 0; i < nFog; i++) {
        const p = randomInside(r, L, 0.6, (x, y) => Math.hypot(x - target.x, y - target.y) > 70 && Math.hypot(x - start.x, y - start.y) > 70);
        if (p) (L.fog = L.fog || []).push({ x: p.x, y: p.y, r: 45 + r() * 30 });
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
    finishLevel(L, n, seed);
    return L;
  }
  function finishLevel(L, n, seed) {
    if (L.cascade) L.features.push("cascade"); else L.features.push("orb");
    if (L.orbs.some((o) => o.focus)) L.features.push("focus");
    if (L.hidden) L.features.push("hidden");
    if (L.walls.some((w) => w.rot)) L.features.push("rot");
    if (L.walls.some((w) => w.slide)) L.features.push("slide");
    if (L.holes.length) L.features.push("hole");
    if (L.timer) L.features.push("timer");
    if (L.need >= 3) L.features.push("need" + L.need);
    if (L.maxB < 3) L.features.push("fence" + L.maxB);
    if (L.walls.some((w) => w.bump)) L.features.push("bump");
    if (L.portals && L.portals.length) L.features.push("portal");
    if (L.orbs.some((o) => o.move)) L.features.push("moveorb");
    if (L.fog && L.fog.length) L.features.push("fog");
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
  }

  return { genCascade, genDemo, MAX_BALLS, TAU, SPEED, DT, BALL_R, WALL_W, MAX_AGE, THEMES, mulberry32, foci, wallsAt, orbsAt, moving, ptSeg, rayEllipse, raySeg, rayCircle, inside, makeBall, newSim, stepSim, simulate, solve, genLevel, band };
})();
if (typeof module !== "undefined") module.exports = ENGINE;
