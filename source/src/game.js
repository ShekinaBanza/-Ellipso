(function () {
  "use strict";
  const E = ENGINE, TAU = E.TAU;
  const CFG = window.ELLIPSO_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const fmt = (v) => Math.round(v).toLocaleString("fr-FR");

  // ---------------- storage ----------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ellipso." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("ellipso." + k, JSON.stringify(v)); } catch (e) {} },
  };

  // ---------------- audio (synthesised) ----------------
  const Snd = {
    ctx: null, master: null, on: store.get("sound", true), lastTick: 0,
    init() {
      if (!this.ctx) {
        try { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination); } catch (e) { this.ctx = null; }
      }
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    },
    tone(freq, dur, type, vol, slide, delay) {
      if (!this.on || !this.ctx) return;
      try {
        const t = this.ctx.currentTime + (delay || 0), o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.03);
      } catch (e) {}
    },
    shoot() { this.tone(380, 0.16, "triangle", 0.18, 2.2); },
    bounce(i) { this.tone(587 * Math.pow(1.335, Math.min(i, 3)), 0.1, "sine", 0.16); },
    split(g) { this.tone(700 * Math.pow(1.5, g), 0.18, "square", 0.08, 1.6); this.tone(1400 * Math.pow(1.5, g), 0.12, "sine", 0.1, 1.3, 0.04); },
    hit(k) { this.tone(784 * Math.pow(1.122, k), 0.22, "triangle", 0.2); },
    win(combo) { const base = 523 * Math.pow(1.0595, Math.min(combo, 12)); [1, 1.26, 1.5, 2].forEach((m, i) => this.tone(base * m, 0.32, "triangle", 0.2, 1, i * 0.065)); },
    wall() { this.tone(140, 0.25, "square", 0.1, 0.45); },
    fall() { this.tone(500, 0.6, "sawtooth", 0.12, 0.2); },
    fail() { this.tone(330, 0.4, "sawtooth", 0.08, 0.5); },
    gem() { this.tone(1568, 0.14, "sine", 0.16, 1.4); this.tone(2349, 0.12, "sine", 0.1, 1, 0.06); },
    click() { this.tone(1200, 0.03, "sine", 0.05); },
    tick(k) { const now = performance.now(); if (now - this.lastTick < 45) return; this.lastTick = now; this.tone(440 * Math.pow(1.0595, k % 24), 0.1, "triangle", 0.12); },
    perfect() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, "triangle", 0.18, 1, i * 0.08)); },
    beep() { this.tone(880, 0.08, "square", 0.06); },
  };
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

  // ---------------- ads ----------------
  let adShowing = false;
  function pauseAudio() { try { Snd.ctx && Snd.ctx.suspend(); } catch (e) {} }
  function resumeAudio() { try { Snd.ctx && Snd.on && Snd.ctx.resume(); } catch (e) {} }
  const Ads = {
    real: !!(CFG.adClient && typeof window.adBreak === "function"), ready: false,
    init() { if (this.real && !this.ready) { this.ready = true; try { window.adConfig({ preloadAdBreaks: "on", sound: Snd.on ? "on" : "off" }); } catch (e) { this.real = false; } } },
    interstitial(name, done) {
      if (!this.real) return done();
      let called = false; const fin = () => { if (!called) { called = true; adShowing = false; resumeAudio(); done(); } };
      try { window.adBreak({ type: "next", name, beforeAd: () => { adShowing = true; pauseAudio(); }, afterAd: resumeAudio, adBreakDone: fin }); } catch (e) { fin(); }
      setTimeout(() => { if (!called && !adShowing) fin(); }, 4000);
    },
    rewarded(name, onReward, onCancel) {
      if (!this.real) return demoAd(onReward);
      let shown = false, rewarded = false;
      try {
        window.adBreak({
          type: "reward", name,
          beforeAd: () => { adShowing = true; pauseAudio(); }, afterAd: () => { adShowing = false; resumeAudio(); },
          beforeReward: (showAdFn) => { shown = true; showAdFn(); },
          adDismissed: () => {}, adViewed: () => { rewarded = true; },
          adBreakDone: () => {
            if (rewarded) onReward();
            else if (!shown) { toast("Pas de pub disponible pour l'instant : c'est offert !"); onReward(); }
            else { toast("Regarde la pub jusqu'au bout pour la récompense."); onCancel && onCancel(); }
          },
        });
      } catch (e) { onReward(); }
    },
  };
  function demoAd(onReward) {
    const ov = $("ad"), bar = $("adBar"), btn = $("bAdClose");
    ov.hidden = false; btn.disabled = true; btn.innerHTML = 'Patiente… <span id="adSec">3</span>';
    const t0 = performance.now(), dur = 3000;
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / dur);
      bar.style.width = (p * 100).toFixed(1) + "%";
      const s = $("adSec"); if (s) s.textContent = Math.ceil((1 - p) * 3);
      if (p < 1) requestAnimationFrame(tick); else { btn.disabled = false; btn.textContent = "RÉCUPÉRER LA RÉCOMPENSE"; }
    };
    tick();
    btn.onclick = () => { ov.hidden = true; onReward(); };
  }
  function fillBanners() {
    document.querySelectorAll("[data-banner]").forEach((el) => {
      if (el.dataset.done) return; el.dataset.done = "1";
      if (CFG.adClient && CFG.bannerSlot) {
        el.innerHTML = '<ins class="adsbygoogle" style="display:inline-block;width:320px;height:50px" data-ad-client="' + CFG.adClient + '" data-ad-slot="' + CFG.bannerSlot + '"></ins>';
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      } else el.innerHTML = '<div class="demo">ESPACE PUBLICITAIRE · 320 × 50</div>';
    });
  }

  let toastT = 0;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2400); }

  // ---------------- levels ----------------
  // each game has its own seed: levels differ from one game to the next, but stay identical while retrying
  function newSeed() { let v = 0; try { const a = new Uint32Array(1); crypto.getRandomValues(a); v = a[0]; } catch (e) { v = (Math.random() * 4294967296) >>> 0; } return v || 1; }
  let seed = store.get("seed", 0) >>> 0; if (!seed) { seed = newSeed(); store.set("seed", seed); }
  const gameCode = () => seed.toString(36).toUpperCase().padStart(6, "0").slice(-6);
  const cache = new Map();
  function getLevel(n) { const k = seed + ":" + n; if (!cache.has(k)) cache.set(k, E.genLevel(n, seed)); return JSON.parse(JSON.stringify(cache.get(k))); }
  const NEWS = {
    orb: ["Points ×2", "Ta balle doit traverser un point ×2 avant de toucher la clôture : elle se divise en deux. Si elle touche la clôture avant, elle tombe et le niveau recommence. Mets 2 balles dans la cible pour passer."],
    focus: ["Le secret des foyers", "Un point ×2 posé sur un foyer est spécial : les deux balles qui en sortent rebondissent et filent toutes les deux vers l'autre foyer, là où est la cible."],
    fence2: ["Clôture fragile", "Ici, chaque balle ne peut toucher la clôture que 2 fois. Au 3e contact, elle disparaît."],
    fence1: ["Un seul rebond", "Chaque balle ne peut toucher la clôture qu'une seule fois. Pas le droit à l'erreur."],
    need3: ["Trois balles", "Il faut 3 balles dans la cible : une des deux balles dupliquées doit passer par le deuxième point ×2."],
    need4: ["Quatre balles", "Il faut 4 balles dans la cible : les deux balles dupliquées doivent repasser par un point ×2."],
    hidden: ["Foyers cachés", "Les foyers ne sont plus affichés. La cible est sur l'un d'eux. L'autre est à la même distance du centre, de l'autre côté."],
    rot: ["Mur tournant", "Un mur tourne sur lui-même. Vise, puis attends le bon moment pour tirer."],
    slide: ["Mur glissant", "Ce mur avance et recule. Observe son rythme avant de tirer."],
    hole: ["Trou noir", "Une balle qui passe sur un trou noir disparaît. Contourne-le."],
    timer: ["Chrono", "Tu as quelques secondes pour tirer. Si le temps s'écoule, le niveau recommence."],
    gem: ["Cristaux", "Fais passer une balle sur un cristal pour gagner 50 points de plus."],
    bonus: ["Niveau bonus", "Place la source et lâche une salve de balles. Chaque balle dans la cible rapporte des points. Ce niveau ne peut pas être raté."],
  };
  let seen = store.get("seen2", []);
  let newsQueue = [];

  // ---------------- state ----------------
  const G = {
    screen: "menu", n: store.get("level", 1), L: null, S: null, points: store.get("points", 0), combo: 0, tries: 0, cleared: 0,
    phase: "aim", ghost: null, ang: 0, time: 0, phaseT: 0, src: null, aiming: false, dragging: false, fast: false,
    revealed: false, paused: false, fade: 0, dispRx: 200, hue: 190, timeLeft: 0, failWhy: "",
  };
  let parts = [], rings = [], pops = [], shake = 0, flash = 0;
  let view = { s: 1, cx: 0, cy: 0 };
  let W = 0, H = 0, DPR = 1;
  const cv = $("cv"), ctx = cv.getContext("2d");
  const save = () => { store.set("points", G.points); store.set("level", G.n); const b = store.get("bestLevel", 1); if (G.n > b) store.set("bestLevel", G.n); };
  function hueFor(n) { let h = (192 + (seed % 7) * 41 + (n - 1) * 29) % 360; if (h > 318 || h < 18) h = (h + 60) % 360; return h; }
  const skipCost = () => 150 + 15 * G.n;

  // ---------------- layout ----------------
  function resize() { DPR = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); layout(); }
  function layout() {
    const rx = G.screen === "play" && G.L ? G.L.rx : 190, ry = 300;
    let top = 20, bot = 20;
    if (G.screen === "play") {
      const ht = document.querySelector(".hud-top").getBoundingClientRect(), hb = document.querySelector(".hud-bottom").getBoundingClientRect();
      top = ht.bottom + 4; bot = H - hb.top + 4;
    }
    const avH = Math.max(120, H - top - bot);
    view.s = Math.min((W - 20) / (2 * rx + 24), avH / (2 * ry + 24));
    view.cx = W / 2; view.cy = top + avH / 2;
  }
  const toWorld = (e) => ({ x: (e.clientX - view.cx) / view.s, y: (e.clientY - view.cy) / view.s });

  // ---------------- HUD ----------------
  function comboMult() { return 1 + 0.25 * Math.min(Math.max(0, G.combo - 1), 8); }
  function renderHUD() {
    const L = G.L;
    $("hLvl").textContent = G.n;
    $("hScore").textContent = fmt(G.points);
    const c = $("hCombo"); if (G.combo > 1) { c.hidden = false; c.textContent = "COMBO ×" + String(comboMult()).replace(".", ","); } else c.hidden = true;
    const hits = G.S ? G.S.hits : 0;
    $("hNeed").hidden = L.type === "salve";
    $("hNeedTxt").textContent = Math.min(hits, 99) + "/" + L.need;
    $("hNeed").classList.toggle("ok", hits >= L.need && L.need > 0);
    const chips = [];
    if (L.type === "salve") chips.push(["BONUS", "gold"]);
    else {
      chips.push(["Clôture : " + L.maxB + " contact" + (L.maxB > 1 ? "s" : "") + " max", L.maxB < 3 ? "hot" : ""]);
      if (L.hidden && !G.revealed) chips.push(["Foyers cachés", "hot"]);
      if (L.walls.some((w) => w.rot)) chips.push(["Mur tournant", "hot"]);
      if (L.walls.some((w) => w.slide)) chips.push(["Mur glissant", "hot"]);
      if (L.holes && L.holes.length) chips.push(["Trou noir", "hot"]);
      if (L.timer) chips.push(["Chrono " + L.timer + " s", "hot"]);
    }
    $("hChips").innerHTML = chips.map(([t, k]) => '<span class="chip ' + k + '">' + t + "</span>").join("");
    const aim = G.phase === "aim";
    $("bHint").hidden = !(L.hidden && !G.revealed && aim);
    $("bSalvo").hidden = !(L.type === "salve" && aim);
    $("aimRow").hidden = !(L.type === "tir" && aim);
    updateHelp();
  }
  let aimInfo = { kind: "none" };
  function updateHelp() {
    const h = $("hHelp"), L = G.L; h.classList.remove("good", "bad");
    if (L.type === "salve") { h.textContent = "Glisse pour placer la source, puis lance la salve"; return; }
    if (G.phase === "fly") { h.textContent = "Maintiens le doigt pour accélérer"; return; }
    if (G.phase !== "aim") { h.textContent = ""; return; }
    if (aimInfo.kind === "orb") { h.textContent = "Tir correct : la balle passe par un point ×2"; h.classList.add("good"); }
    else if (aimInfo.kind === "fence") { h.textContent = "Attention : la balle touchera la clôture sans ×2 et tombera"; h.classList.add("bad"); }
    else if (aimInfo.kind === "wall" || aimInfo.kind === "hole") { h.textContent = "Attention : obstacle sur la trajectoire"; h.classList.add("bad"); }
    else if (aimInfo.kind === "target") { h.textContent = "Une seule balle ne suffit pas : passe par un point ×2"; h.classList.add("bad"); }
    else h.textContent = "Glisse pour viser · relâche pour tirer";
  }
  function bumpScore() { const b = $("hScore"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }

  // ---------------- screens ----------------
  function showScreen(name) {
    G.screen = name;
    $("menu").hidden = name !== "menu";
    $("hud").hidden = name !== "play";
    layout();
  }
  function renderMenu() {
    const best = store.get("bestLevel", 1);
    $("mBest").innerHTML = best > 1 ? "Record : <b>niveau " + best + "</b> · <b>" + fmt(G.points) + "</b> points" : "Des niveaux à l'infini. Jusqu'où iras-tu ?";
    $("bPlaySub").textContent = G.n > 1 ? "Reprendre au niveau " + G.n : "Niveau 1";
    $("bRestart1").hidden = false;
    $("bRestart1").textContent = G.n > 1 ? "Nouvelle partie : de nouveaux niveaux depuis le 1" : "Nouvelle partie : changer de niveaux";
    $("bSound").textContent = "Son : " + (Snd.on ? "oui" : "non");
    fillBanners();
  }

  // ---------------- flow ----------------
  function play(from) {
    Snd.init(); Ads.init();
    G.n = from; G.combo = 0; save();
    showScreen("play"); startLevel(true);
  }
  function startLevel(fresh) {
    const prevL = G.L, L = getLevel(G.n);
    if (!fresh && prevL && prevL.n === L.n && prevL.gems) L.gems.forEach((g, i) => { if (prevL.gems[i] && prevL.gems[i].taken) g.taken = true; });
    G.L = L; G.S = null; G.revealed = fresh ? false : G.revealed; G.ghost = fresh ? null : G.ghost;
    if (fresh) G.tries = 0;
    G.phase = "aim"; G.phaseT = 0; G.time = 0; G.fade = fresh ? 0 : 1; G.fast = false; G.timeLeft = L.timer || 0;
    G.hue = hueFor(G.n);
    if (L.type === "salve") G.src = { x: L.start.x, y: L.start.y };
    else if (fresh) { const o = L.orbs[1] || L.orbs[0]; G.ang = Math.atan2(o.y - L.start.y, o.x - L.start.x) + 0.35; }
    if (fresh) { parts = []; rings = []; pops = []; pops.push({ text: L.type === "salve" ? "BONUS" : "NIVEAU " + G.n, x: 0, y: -40, life: 1.1, max: 1.1, size: 34, color: "#ffffff", big: true }); }
    renderHUD(); layout();
    if (fresh) {
      newsQueue = L.features.filter((f) => NEWS[f] && !seen.includes(f));
      if (newsQueue.length) showNews();
      setTimeout(() => getLevel(G.n + 1), 500);
    }
  }
  function showNews() {
    const key = newsQueue.shift(); if (!key) { G.paused = false; return; }
    G.paused = true; seen.push(key); store.set("seen2", seen);
    $("nTitle").textContent = NEWS[key][0]; $("nText").textContent = NEWS[key][1]; $("news").hidden = false;
  }
  function validSrc(p) {
    const L = G.L;
    if (!E.inside(L, p.x, p.y, 0.88)) return false;
    if (Math.hypot(p.x - L.target.x, p.y - L.target.y) < 45) return false;
    for (const w of E.wallsAt(L, G.time)) if (E.ptSeg(p.x, p.y, w.x1, w.y1, w.x2, w.y2) < 12) return false;
    return true;
  }
  function fire() {
    if (G.phase !== "aim" || G.L.type !== "tir" || G.paused || G.screen !== "play") return;
    Snd.init();
    G.tries++; G.ghost = null;
    G.S = E.newSim(G.L, G.ang, G.time);
    G.S.balls[0].hue = G.hue; G.S.balls[0].trail = [];
    G.phase = "fly"; G.phaseT = 0; Snd.shoot(); renderHUD();
  }
  function fireSalvo() {
    if (G.phase !== "aim" || G.L.type !== "salve" || G.paused) return;
    if (!validSrc(G.src)) { toast("Trop près de la cible, d'un mur ou du bord"); return; }
    Snd.init(); Snd.shoot();
    const L = G.L; L.start = { x: G.src.x, y: G.src.y };
    const balls = [];
    for (let i = 0; i < L.balls; i++) { const b = E.makeBall(G.src.x, G.src.y, (i / L.balls) * TAU + 0.031); b.hue = (i / L.balls) * 360; b.trail = []; balls.push(b); }
    G.S = E.newSim(L, 0, G.time, balls);
    G.phase = "fly"; G.phaseT = 0; renderHUD();
  }
  function onEvent(type, b, x, y, g) {
    const salvo = G.L.type === "salve";
    if (type === "bounce") {
      if (!salvo) { Snd.bounce(b.bounces - 1); burst(x, y, 6, b.hue, 90, 0.35, 2); rings.push({ x, y, r: 4, life: 0.35, max: 0.35, hue: b.hue }); }
      else if (Math.random() < 0.15) burst(x, y, 2, b.hue, 60, 0.3, 1.5);
    } else if (type === "split") {
      Snd.split(b.gen); buzz(12);
      burst(x, y, 26, 275, 200, 0.6, 2.4); rings.push({ x, y, r: 6, life: 0.5, max: 0.5, hue: 275, big: true });
      pops.push({ text: "×2", x, y: y - 18, life: 0.8, max: 0.8, size: 20, color: "#c9b8ff" });
    } else if (type === "gem") {
      g.taken = true; G.points += 50; bumpScore(); Snd.gem(); buzz(15);
      burst(x, y, 22, 165, 160, 0.6, 2.5); pops.push({ text: "+50", x, y: y - 10, life: 0.9, max: 0.9, size: 18, color: "#3fe0c5" });
    } else if (type === "hit") {
      if (salvo) { Snd.tick(G.S.hits); burst(x, y, 3, b.hue, 140, 0.5, 2); }
      else {
        Snd.hit(G.S.hits); buzz(20); burst(x, y, 24, 48, 200, 0.6, 2.6); rings.push({ x, y, r: 4, life: 0.5, max: 0.5, hue: 48, big: true });
        pops.push({ text: G.S.hits + "/" + G.L.need, x: x + 30, y: y - 20, life: 0.9, max: 0.9, size: 18, color: G.S.hits >= G.L.need ? "#ffd25a" : "#ffffff" });
        renderHUD();
      }
    } else if (type === "wall") { burst(x, y, salvo ? 3 : 16, 340, 130, 0.45, 2); if (!salvo) { Snd.wall(); shake = Math.max(shake, 6); } }
    else if (type === "hole") { burst(x, y, 20, 270, 60, 0.6, 2); if (!salvo) Snd.wall(); }
    else if (type === "fall") {
      burst(x, y, 30, 350, 150, 0.7, 2.4); Snd.fall(); shake = 14; buzz([30, 40, 30]);
      pops.push({ text: "CHUTE !", x: x * 0.6, y: y * 0.6, life: 1.1, max: 1.1, size: 28, color: "#ff4766", big: true });
    } else if ((type === "over" || type === "lost") && !salvo) burst(x, y, 10, 220, 70, 0.4, 1.6);
  }
  function endFlight() {
    const S = G.S, L = G.L;
    if (L.type === "salve") return salvoEnd();
    if (S.fail === "fall") return failLevel("fall");
    if (S.hits >= L.need) return win();
    failLevel("short");
  }
  function win() {
    const L = G.L, S = G.S, first = G.tries === 1;
    G.combo = first ? G.combo + 1 : 0;
    const extra = Math.max(0, S.hits - L.need);
    const pts = Math.round((40 + 5 * G.n + 20 * S.hits + 30 * extra) * (first ? comboMult() : 1));
    G.points += pts; G.cleared++; bumpScore();
    const t = L.target;
    burst(t.x, t.y, 70, -1, 260, 1.0, 3); rings.push({ x: t.x, y: t.y, r: 6, life: 0.7, max: 0.7, hue: 48, big: true });
    flash = 0.35; Snd.win(G.combo); buzz(40);
    const word = extra > 0 ? "INCROYABLE !" : first ? (G.combo > 1 ? "COMBO ×" + String(comboMult()).replace(".", ",") : "PARFAIT !") : G.tries === 2 ? "BRAVO !" : "ENFIN !";
    pops.push({ text: word, x: 0, y: -60, life: 1.3, max: 1.3, size: 34, color: first ? "#ffd25a" : "#ffffff", big: true });
    pops.push({ text: "+" + pts, x: 0, y: -15, life: 1.2, max: 1.2, size: 22, color: "#ffffff", big: true });
    G.phase = "clear"; G.phaseT = 0; renderHUD();
  }
  function failLevel(why) {
    G.combo = 0; G.failWhy = why; Snd.fail();
    const S = G.S;
    if (S) { const b = S.balls[0]; G.ghost = b.path.slice(); if (b.state === "live") G.ghost.push({ x: b.x, y: b.y }); }
    if (why === "short") { shake = Math.max(shake, 8); pops.push({ text: "RATÉ", x: 0, y: -40, life: 1, max: 1, size: 30, color: "#ff4766", big: true }); }
    if (why === "time") { shake = 8; pops.push({ text: "TEMPS ÉCOULÉ", x: 0, y: -40, life: 1, max: 1, size: 26, color: "#ff4766", big: true }); }
    G.phase = "failed"; G.phaseT = 0; renderHUD();
  }
  function showFailCard() {
    const L = G.L, S = G.S, cost = skipCost();
    $("fEyebrow").textContent = "NIVEAU " + G.n + " · ESSAI " + G.tries;
    const titles = { fall: "La balle est tombée", short: "Pas assez de balles", time: "Trop tard !" };
    $("fTitle").textContent = titles[G.failWhy] || "Raté !";
    $("fText").textContent = G.failWhy === "fall" ? "Elle a touché la clôture avant de traverser un point ×2. Le niveau recommence."
      : G.failWhy === "time" ? "Le chrono est arrivé à zéro avant ton tir. Le niveau recommence."
      : "Il fallait " + L.need + " balles dans la cible, tu en as mis " + (S ? S.hits : 0) + ". Le niveau recommence.";
    $("bSkipPts").textContent = "Passer le niveau · " + fmt(cost) + " points";
    $("bSkipPts").disabled = G.points < cost;
    $("fail").hidden = false; G.paused = true; fillBanners();
  }
  function retry() { $("fail").hidden = true; G.paused = false; startLevel(false); }
  function salvoEnd() {
    const L = G.L, n = L.balls, pct = G.S.hits / n;
    let pts = G.S.hits * 5;
    const perfect = pct >= 0.9;
    if (perfect) { pts += 300; Snd.perfect(); flash = 0.4; } else Snd.win(0);
    G.points += pts; G.cleared++; bumpScore();
    pops.push({ text: Math.round(pct * 100) + " %", x: 0, y: -70, life: 1.6, max: 1.6, size: 44, color: perfect ? "#ffd25a" : "#ffffff", big: true });
    pops.push({ text: (perfect ? "PARFAIT ! +" : "+") + pts, x: 0, y: -20, life: 1.6, max: 1.6, size: 20, color: "#ffffff", big: true });
    G.phase = "clear"; G.phaseT = -0.4; renderHUD();
  }
  function advance(skipped) {
    G.n++; save();
    const go = () => startLevel(true);
    if (!skipped && Ads.real && G.cleared > 0 && G.cleared % 4 === 0) { G.paused = true; Ads.interstitial("niveau_" + G.n, () => { G.paused = false; go(); }); }
    else go();
  }

  // ---------------- particles ----------------
  function burst(x, y, n, hue, sp, life, size) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), max: life, hue: hue < 0 ? Math.random() * 360 : hue + (Math.random() - 0.5) * 30, size: size * (0.6 + Math.random() * 0.8) });
    }
    if (parts.length > 900) parts.splice(0, parts.length - 900);
  }

  // ---------------- attract mode ----------------
  const D = { rx: 190, ry: 300, maxB: 99, tr: 0, target: { x: 1e6, y: 1e6 }, walls: [], orbs: [], holes: [], noFall: true };
  let demo = { S: null, t: 3, k: 0 };
  function demoStep(dt) {
    demo.t += dt;
    if (demo.t > 3.4) {
      demo.t = 0; const F = E.foci(D.rx, D.ry), s = F[demo.k % 2]; demo.k++;
      const balls = [], n = 72;
      for (let i = 0; i < n; i++) { const b = E.makeBall(s.x, s.y, (i / n) * TAU + 0.02); b.hue = (i / n) * 360; b.trail = []; balls.push(b); }
      demo.S = E.newSim(D, 0, 0, balls);
    }
    if (!demo.S) return;
    for (let k = 0; k < Math.round(dt / E.DT); k++) { demo.S.done = false; E.stepSim(demo.S, E.DT, null); }
    for (const b of demo.S.balls) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 16) b.trail.shift(); }
  }

  // ---------------- input ----------------
  cv.addEventListener("pointerdown", (e) => {
    Snd.init();
    if (G.screen !== "play" || G.paused) return;
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    const p = toWorld(e);
    if (G.phase === "aim") {
      if (G.L.type === "tir") { G.aiming = true; G.ang = Math.atan2(p.y - G.L.start.y, p.x - G.L.start.x); }
      else { G.dragging = true; if (validSrc(p)) G.src = p; }
    } else if (G.phase === "fly") G.fast = true;
    else if (G.phase === "clear" && G.phaseT > 0.45) advance(false);
  });
  cv.addEventListener("pointermove", (e) => {
    if (G.screen !== "play" || G.paused) return;
    const p = toWorld(e);
    if (G.phase === "aim" && G.L.type === "tir" && G.aiming) G.ang = Math.atan2(p.y - G.L.start.y, p.x - G.L.start.x);
    else if (G.dragging && validSrc(p)) G.src = p;
  });
  const up = () => { if (G.aiming) { G.aiming = false; fire(); } G.dragging = false; G.fast = false; };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", () => { G.aiming = false; G.dragging = false; G.fast = false; });
  // precise aiming buttons with auto-repeat
  function holdBtn(el, fn) {
    let t1 = 0, t2 = 0;
    const stop = () => { clearTimeout(t1); clearInterval(t2); };
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); fn(); t1 = setTimeout(() => { t2 = setInterval(fn, 45); }, 320); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((k) => el.addEventListener(k, stop));
  }
  const nudge = (deg) => { if (G.phase === "aim" && !G.paused) { G.ang += (deg * Math.PI) / 180; Snd.click(); } };
  holdBtn($("bLeft"), () => nudge(-0.2));
  holdBtn($("bRight"), () => nudge(0.2));
  $("bFire").onclick = fire;
  window.addEventListener("keydown", (e) => {
    if (G.screen !== "play" || G.paused) return;
    if (G.L.type === "tir" && G.phase === "aim") {
      const d = e.shiftKey ? 2 : 0.2;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { nudge(-d); e.preventDefault(); }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { nudge(d); e.preventDefault(); }
      if (e.key === " " || e.key === "Enter") { fire(); e.preventDefault(); }
    } else if (G.L.type === "salve" && G.phase === "aim") {
      const d = e.shiftKey ? 10 : 2, m = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (m) { const p = { x: G.src.x + m[0], y: G.src.y + m[1] }; if (validSrc(p)) G.src = p; e.preventDefault(); }
      if (e.key === " " || e.key === "Enter") { fireSalvo(); e.preventDefault(); }
    } else if (G.phase === "clear" && (e.key === " " || e.key === "Enter") && G.phaseT > 0.45) advance(false);
    if (e.key === "Escape" || e.key === "p") pauseGame();
  });

  // ---------------- buttons ----------------
  function pauseGame() { if (G.screen !== "play" || G.paused) return; G.paused = true; $("pTitle").textContent = "Niveau " + G.n; $("pCode").textContent = "Partie n° " + gameCode() + " · niveaux uniques à cette partie"; $("bPauseSound").textContent = "Son : " + (Snd.on ? "oui" : "non"); $("pause").hidden = false; }
  function setSound(on) { Snd.on = on; store.set("sound", on); if (on) Snd.init(); $("bSound").textContent = "Son : " + (on ? "oui" : "non"); $("bPauseSound").textContent = "Son : " + (on ? "oui" : "non"); }
  $("bPlay").onclick = () => play(G.n);
  $("bRestart1").onclick = () => { seed = newSeed(); store.set("seed", seed); cache.clear(); G.combo = 0; play(1); toast("Nouvelle partie n° " + gameCode()); };
  $("bSound").onclick = () => setSound(!Snd.on);
  $("bPauseSound").onclick = () => setSound(!Snd.on);
  $("bHow").onclick = () => { $("how").hidden = false; };
  $("bHowOk").onclick = () => { $("how").hidden = true; };
  $("bPause").onclick = pauseGame;
  $("bResume").onclick = () => { $("pause").hidden = true; G.paused = false; };
  $("bQuit").onclick = () => { $("pause").hidden = true; G.paused = false; save(); showScreen("menu"); renderMenu(); };
  $("bNewsOk").onclick = () => { $("news").hidden = true; showNews(); };
  $("bSalvo").onclick = fireSalvo;
  $("bHint").onclick = () => { G.paused = true; Ads.rewarded("voir_foyers", () => { G.paused = false; G.revealed = true; renderHUD(); toast("Foyers révélés !"); }, () => { G.paused = false; }); };
  $("bRetry").onclick = retry;
  $("bSkipAd").onclick = () => Ads.rewarded("passer_niveau", () => { $("fail").hidden = true; G.paused = false; toast("Niveau passé !"); advance(true); });
  $("bSkipPts").onclick = () => {
    const cost = skipCost(); if (G.points < cost) return;
    G.points -= cost; $("fail").hidden = true; G.paused = false; toast("Niveau passé : −" + fmt(cost) + " points"); advance(true);
  };
  $("bShare").onclick = async () => {
    const text = "Je suis au niveau " + G.n + " sur Ellipso avec " + fmt(G.points) + " points. Tu fais mieux ?";
    const url = /^https?:/.test(location.href) ? location.href.split("#")[0] : "";
    try { if (navigator.share) { await navigator.share({ title: "Ellipso", text, url: url || undefined }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text + (url ? " " + url : "")); toast("Copié, colle-le où tu veux !"); } catch (e) { toast(text); }
  };
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("bInstall").hidden = false; });
  $("bInstall").onclick = async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; $("bInstall").hidden = true; };
  document.addEventListener("visibilitychange", () => { if (document.hidden) { pauseGame(); pauseAudio(); save(); } else resumeAudio(); });
  window.addEventListener("pagehide", save);
  window.addEventListener("resize", resize);

  // ---------------- aim analysis (what the shot meets first) ----------------
  function analyseAim() {
    const L = G.L, st = L.start, ux = Math.cos(G.ang), uy = Math.sin(G.ang);
    let best = { kind: "fence", t: E.rayEllipse(st.x, st.y, ux, uy, L.rx, L.ry) };
    const consider = (kind, t, extra) => { if (t < best.t) best = Object.assign({ kind, t }, extra); };
    L.orbs.forEach((o, i) => consider("orb", E.rayCircle(st.x, st.y, ux, uy, o.x, o.y, o.r + E.BALL_R), { i }));
    consider("target", E.rayCircle(st.x, st.y, ux, uy, L.target.x, L.target.y, L.tr));
    for (const h of L.holes || []) consider("hole", E.rayCircle(st.x, st.y, ux, uy, h.x, h.y, h.r));
    for (const w of E.wallsAt(L, G.time)) consider("wall", E.raySeg(st.x, st.y, ux, uy, w));
    best.x = st.x + ux * best.t; best.y = st.y + uy * best.t; best.ux = ux; best.uy = uy;
    return best;
  }

  // ---------------- update ----------------
  function update(dt) {
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt; }
    parts = parts.filter((p) => p.life > 0);
    for (const r of rings) { r.life -= dt; r.r += (r.big ? 160 : 70) * dt; }
    rings = rings.filter((r) => r.life > 0);
    for (const p of pops) { p.life -= dt; if (!p.big) p.y -= 30 * dt; }
    pops = pops.filter((p) => p.life > 0);
    shake *= Math.pow(0.002, dt); flash = Math.max(0, flash - dt);

    if (G.screen === "menu") { demoStep(dt); return; }
    if (G.screen !== "play" || G.paused) return;
    const L = G.L;
    G.dispRx += (L.rx - G.dispRx) * Math.min(1, dt * 7);
    G.fade = Math.min(1, G.fade + dt * 2.5);
    G.phaseT += dt;
    if (G.phase === "aim" && L.type === "tir") {
      const prev = aimInfo.kind; aimInfo = analyseAim(); if (aimInfo.kind !== prev) updateHelp();
      if (L.timer) {
        const before = Math.ceil(G.timeLeft); G.timeLeft -= dt;
        if (Math.ceil(G.timeLeft) !== before && G.timeLeft <= 3 && G.timeLeft > 0) Snd.beep();
        if (G.timeLeft <= 0) { G.tries++; G.S = null; failLevel("time"); }
      }
    }
    const speed = G.phase === "fly" && G.fast ? 3 : 1;
    const steps = Math.round((dt * speed) / E.DT);
    for (let k = 0; k < steps; k++) {
      G.time += E.DT;
      if (G.phase === "fly") { E.stepSim(G.S, E.DT, onEvent); if (G.S.done) { endFlight(); break; } }
    }
    if (G.S) for (const b of G.S.balls) { if (!b.trail) b.trail = []; if (b.state === "live") { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 14) b.trail.shift(); } else if (b.trail.length) b.trail.shift(); }
    if (G.phase === "clear" && G.phaseT > 1.5) advance(false);
    else if (G.phase === "failed" && G.phaseT > 0.9) { G.phase = "failcard"; showFailCard(); }
  }

  // ---------------- draw ----------------
  const stars = (() => { const r = E.mulberry32(42), a = []; for (let i = 0; i < 110; i++) a.push({ x: r(), y: r(), s: r() * 1.4 + 0.3, p: r() * TAU }); return a; })();
  function drawBG(now) {
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.8);
    g.addColorStop(0, "hsl(" + G.hue + " 60% 11%)"); g.addColorStop(0.55, "#070c1c"); g.addColorStop(1, "#04070f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const s of stars) { ctx.globalAlpha = 0.25 + 0.35 * Math.sin(now / 900 + s.p) ** 2; ctx.fillStyle = "#cfe3ff"; ctx.fillRect(s.x * W, s.y * H, s.s, s.s); }
    ctx.globalAlpha = 1;
  }
  const X = (v) => v * view.s;
  function drawEllipse(rx, ry, hue, a) {
    ctx.save();
    const fill = ctx.createRadialGradient(0, 0, 0, 0, 0, X(ry));
    fill.addColorStop(0, "hsla(" + hue + ",80%,55%,0.07)"); fill.addColorStop(1, "hsla(" + hue + ",80%,55%,0.015)");
    ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(0, 0, X(rx), X(ry), 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = a; ctx.lineWidth = 4; ctx.strokeStyle = "hsl(" + hue + " 95% 66%)"; ctx.shadowColor = "hsl(" + hue + " 95% 60%)"; ctx.shadowBlur = 26; ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineWidth = 1.3; ctx.strokeStyle = "rgba(240,252,255,0.85)"; ctx.stroke();
    ctx.restore();
  }
  function glowDot(x, y, r, color, blur) { ctx.save(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore(); }
  function drawTrails(balls, lineAlpha) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    if (lineAlpha > 0) for (const b of balls) {
      if (!b.path) continue;
      ctx.strokeStyle = "hsla(" + b.hue + ",95%,62%," + lineAlpha + ")"; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(X(b.path[0].x), X(b.path[0].y));
      for (let k = 1; k < b.path.length; k++) ctx.lineTo(X(b.path[k].x), X(b.path[k].y));
      if (b.state === "live") ctx.lineTo(X(b.x), X(b.y));
      ctx.stroke();
    }
    for (const b of balls) {
      const t = b.trail; if (!t || t.length < 2) continue;
      for (let k = 1; k < t.length; k++) {
        const u = k / t.length;
        ctx.strokeStyle = "hsla(" + b.hue + ",100%,65%," + u * 0.9 + ")"; ctx.lineWidth = Math.max(1, X(E.BALL_R) * 1.6 * u);
        ctx.beginPath(); ctx.moveTo(X(t[k - 1].x), X(t[k - 1].y)); ctx.lineTo(X(t[k].x), X(t[k].y)); ctx.stroke();
      }
    }
    ctx.restore();
    for (const b of balls) if (b.state === "live") {
      glowDot(X(b.x), X(b.y), Math.max(3, X(E.BALL_R) * 1.15), "hsl(" + b.hue + " 100% 75%)", 14);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X(b.x), X(b.y), Math.max(1.5, X(E.BALL_R) * 0.55), 0, TAU); ctx.fill();
    }
  }
  function drawFx() {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const p of parts) { const u = Math.max(0, p.life / p.max); ctx.fillStyle = "hsla(" + p.hue + ",100%,65%," + u + ")"; ctx.beginPath(); ctx.arc(X(p.x), X(p.y), p.size * (0.4 + u * 0.6), 0, TAU); ctx.fill(); }
    for (const r of rings) { const u = r.life / r.max; ctx.strokeStyle = "hsla(" + r.hue + ",100%,70%," + u + ")"; ctx.lineWidth = r.big ? 3 : 1.5; ctx.beginPath(); ctx.arc(X(r.x), X(r.y), r.r, 0, TAU); ctx.stroke(); }
    ctx.restore();
    for (const p of pops) {
      const u = p.life / p.max, inT = Math.min(1, (p.max - p.life) / 0.18), sc = p.big ? 0.6 + 0.4 * easeBack(inT) : 1;
      ctx.save(); ctx.globalAlpha = Math.min(1, u * 2.2); ctx.translate(X(p.x), X(p.y)); ctx.scale(sc, sc);
      ctx.font = "700 " + p.size + "px Unbounded, 'Arial Black', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = p.color; ctx.shadowBlur = 18; ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }
  function easeBack(t) { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function drawOrb(o, i, now, lit) {
    const r = Math.max(9, X(o.r)), pul = 1 + 0.08 * Math.sin(now / 200 + i * 2);
    ctx.save(); ctx.translate(X(o.x), X(o.y));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4); g.addColorStop(0, lit ? "rgba(120,255,190,0.45)" : "rgba(160,130,255,0.4)"); g.addColorStop(1, "rgba(160,130,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = lit ? "#78ffbe" : "#b9a6ff"; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 16; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, r * pul, 0, TAU); ctx.stroke();
    ctx.rotate(-now / 900); ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r * pul + 5, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.rotate(now / 900);
    ctx.shadowBlur = 0; ctx.fillStyle = "#ffffff"; ctx.font = "700 " + Math.max(10, Math.round(r * 0.95)) + "px Unbounded, 'Arial Black', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("×2", 0, 1);
    ctx.restore();
  }
  function drawLevel(now) {
    const L = G.L;
    drawEllipse(G.dispRx, L.ry, G.hue, 1);
    ctx.globalAlpha = G.fade;
    const F = E.foci(L.rx, L.ry), showF = !L.hidden || G.revealed || G.phase === "clear";
    if (showF) F.forEach((f) => {
      if (Math.abs(f.y - L.target.y) < 0.01) return;
      ctx.strokeStyle = "rgba(255,210,90,0.75)"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(X(f.x), X(f.y), 6, 0, TAU); ctx.stroke();
      ctx.fillStyle = "rgba(255,210,90,0.9)"; ctx.font = "600 11px Outfit, sans-serif"; ctx.textAlign = "left"; ctx.fillText("FOYER", X(f.x) + 22, X(f.y) + 4);
    });
    for (const h of L.holes || []) {
      ctx.save(); ctx.translate(X(h.x), X(h.y)); const r = X(h.r);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6); g.addColorStop(0, "#000"); g.addColorStop(0.6, "rgba(20,0,40,0.95)"); g.addColorStop(1, "rgba(120,60,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill();
      ctx.rotate(now / 500); ctx.strokeStyle = "rgba(170,110,255,0.8)"; ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, r * (0.55 + k * 0.22), k, k + 3.6); ctx.stroke(); }
      ctx.restore();
    }
    for (const w of E.wallsAt(L, G.time)) {
      ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = w.slide ? "#ff8a3d" : "#ff4f9a"; ctx.shadowColor = w.slide ? "#ff7a20" : "#ff2f7d"; ctx.shadowBlur = 16; ctx.lineWidth = Math.max(4, X(E.WALL_W));
      ctx.beginPath(); ctx.moveTo(X(w.x1), X(w.y1)); ctx.lineTo(X(w.x2), X(w.y2)); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,230,240,0.9)"; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
      if (w.rot) glowDot(X(w.rot.cx), X(w.rot.cy), 4, "#ffffff", 10);
    }
    for (const g of L.gems || []) {
      if (g.taken) continue;
      const bob = Math.sin(now / 300 + g.x) * 2, r = Math.max(6, X(g.r));
      ctx.save(); ctx.translate(X(g.x), X(g.y) + bob); ctx.rotate(now / 900);
      ctx.fillStyle = "#3fe0c5"; ctx.shadowColor = "#3fe0c5"; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    const t = L.target, pulse = 1 + 0.1 * Math.sin(now / 220), tr = Math.max(9, X(L.tr));
    ctx.save(); ctx.translate(X(t.x), X(t.y));
    const tg = ctx.createRadialGradient(0, 0, 0, 0, 0, tr * 2.6); tg.addColorStop(0, "rgba(255,210,90,0.35)"); tg.addColorStop(1, "rgba(255,210,90,0)");
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(0, 0, tr * 2.6, 0, TAU); ctx.fill();
    ctx.rotate(now / 700); ctx.setLineDash([5, 5]); ctx.strokeStyle = "#ffd25a"; ctx.lineWidth = 2; ctx.shadowColor = "#ffd25a"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(0, 0, tr * pulse + 4, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(0, 0, tr * 0.55, 0, TAU); ctx.stroke(); ctx.fillStyle = "#fff4cc"; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
    ctx.restore();
    // orbs (a used one stays lit while balls fly)
    const used = G.S ? G.S.balls.reduce((m, b) => m | (b.state === "split" ? 0 : b.used), 0) : 0;
    L.orbs.forEach((o, i) => drawOrb(o, i, now, (G.phase === "aim" && aimInfo.kind === "orb" && aimInfo.i === i) || (used & (1 << i))));
    if (G.ghost && G.phase === "aim") {
      ctx.save(); ctx.setLineDash([3, 6]); ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1.2; ctx.beginPath();
      ctx.moveTo(X(G.ghost[0].x), X(G.ghost[0].y)); for (const p of G.ghost) ctx.lineTo(X(p.x), X(p.y)); ctx.stroke(); ctx.restore();
    }
    if (L.type === "tir") {
      const st = L.start;
      if (G.phase === "aim") drawAim(st, L, now);
      if (G.phase === "aim" || G.phase === "failed" || G.phase === "failcard") {
        glowDot(X(st.x), X(st.y), 7, "#ffffff", 18);
        if (L.timer && G.phase === "aim") {
          const u = Math.max(0, G.timeLeft / L.timer);
          ctx.save(); ctx.strokeStyle = u < 0.35 ? "#ff4766" : "#ffd25a"; ctx.lineWidth = 3; ctx.lineCap = "round";
          ctx.beginPath(); ctx.arc(X(st.x), X(st.y), 18, -Math.PI / 2, -Math.PI / 2 + TAU * u); ctx.stroke();
          ctx.fillStyle = ctx.strokeStyle; ctx.font = "700 12px Unbounded, sans-serif"; ctx.textAlign = "center"; ctx.fillText(Math.ceil(G.timeLeft) + " s", X(st.x), X(st.y) - 26);
          ctx.restore();
        } else { ctx.strokeStyle = "rgba(255,255,255," + (0.25 + 0.2 * Math.sin(now / 250)) + ")"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(st.x), X(st.y), 15 + 3 * Math.sin(now / 250), 0, TAU); ctx.stroke(); }
      } else { ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(X(st.x), X(st.y), 3, 0, TAU); ctx.fill(); }
    } else if (G.phase === "aim") {
      const ok = validSrc(G.src), c = ok ? "#ffffff" : "#ff4766";
      glowDot(X(G.src.x), X(G.src.y), 7, c, 18);
      ctx.save(); ctx.strokeStyle = c; ctx.globalAlpha = 0.4;
      for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU + now / 2000; ctx.beginPath(); ctx.moveTo(X(G.src.x) + Math.cos(an) * 12, X(G.src.y) + Math.sin(an) * 12); ctx.lineTo(X(G.src.x) + Math.cos(an) * 26, X(G.src.y) + Math.sin(an) * 26); ctx.stroke(); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (G.S) drawTrails(G.S.balls, L.type === "salve" ? 0.16 : 0.3);
  }
  function drawAim(st, L, now) {
    if (!isFinite(aimInfo.x)) aimInfo = analyseAim();
    const a = aimInfo, good = a.kind === "orb", col = good ? "120,255,190" : a.kind === "target" ? "255,210,90" : "255,90,110";
    ctx.save();
    const g = ctx.createLinearGradient(X(st.x), X(st.y), X(a.x), X(a.y)); g.addColorStop(0, "rgba(" + col + ",0.95)"); g.addColorStop(1, "rgba(" + col + ",0.35)");
    ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.setLineDash([2, 7]); ctx.lineCap = "round"; ctx.lineDashOffset = -now / 40;
    ctx.beginPath(); ctx.moveTo(X(st.x), X(st.y)); ctx.lineTo(X(a.x), X(a.y)); ctx.stroke(); ctx.setLineDash([]);
    if (good) {
      // preview the two duplicated directions (short stubs)
      const o = L.orbs[a.i], base = Math.atan2(a.uy, a.ux), len = L.n <= 4 ? 120 : 55;
      ctx.strokeStyle = "rgba(120,255,190,0.35)"; ctx.setLineDash([2, 6]);
      for (const s of [-1, 1]) { const an = base + s * L.spread; ctx.beginPath(); ctx.moveTo(X(o.x), X(o.y)); ctx.lineTo(X(o.x + Math.cos(an) * len), X(o.y + Math.sin(an) * len)); ctx.stroke(); }
    } else if (a.kind !== "target") {
      ctx.strokeStyle = "#ff4766"; ctx.lineWidth = 2.5; const k = 6;
      ctx.beginPath(); ctx.moveTo(X(a.x) - k, X(a.y) - k); ctx.lineTo(X(a.x) + k, X(a.y) + k); ctx.moveTo(X(a.x) + k, X(a.y) - k); ctx.lineTo(X(a.x) - k, X(a.y) + k); ctx.stroke();
    }
    ctx.restore();
  }
  function drawDemo() {
    drawEllipse(D.rx, D.ry, 192, 0.9);
    E.foci(D.rx, D.ry).forEach((f) => { ctx.strokeStyle = "rgba(255,210,90,0.8)"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(X(f.x), X(f.y), 7, 0, TAU); ctx.stroke(); });
    if (!demo.S) return;
    ctx.globalAlpha = Math.max(0, Math.min(1, (3.4 - demo.t) / 0.5)); drawTrails(demo.S.balls, 0); ctx.globalAlpha = 1;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { update(dt); } catch (err) { console.error(err); }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBG(now);
    ctx.save();
    ctx.translate(view.cx + (Math.random() - 0.5) * shake, view.cy + (Math.random() - 0.5) * shake);
    try { if (G.screen === "menu") drawDemo(); else if (G.L) drawLevel(now); drawFx(); } catch (err) { console.error(err); }
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = "rgba(255,245,220," + flash * 0.5 + ")"; ctx.fillRect(0, 0, W, H); }
    requestAnimationFrame(frame);
  }

  resize(); renderMenu(); showScreen("menu");
  requestAnimationFrame(frame);
  window.__ellipso = { G, E, getLevel, fire, play, advance, retry };
})();
