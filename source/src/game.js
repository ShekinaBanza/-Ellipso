(function () {
  "use strict";
  const E = ENGINE, TAU = E.TAU, C = CORE, $ = C.$, fmt = C.fmt, store = C.store, toast = C.toast;

  // ---------------- audio (synthesised) ----------------
  const Snd = {
    ctx: null, master: null, on: store.get("sound", true), lastTick: 0,
    init() {
      if (!this.ctx) { try { const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination); } catch (e) { this.ctx = null; } }
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
    bump() { this.tone(980, 0.08, "square", 0.07, 0.7); },
    portal() { this.tone(300, 0.25, "sine", 0.14, 3); },
    split(g) { this.tone(700 * Math.pow(1.5, g), 0.18, "square", 0.08, 1.6); this.tone(1400 * Math.pow(1.5, g), 0.12, "sine", 0.1, 1.3, 0.04); },
    hit(k) { this.tone(784 * Math.pow(1.122, k), 0.22, "triangle", 0.2); },
    win(combo) { const base = 523 * Math.pow(1.0595, Math.min(combo, 12)); [1, 1.26, 1.5, 2].forEach((m, i) => this.tone(base * m, 0.32, "triangle", 0.2, 1, i * 0.065)); },
    wall() { this.tone(140, 0.25, "square", 0.1, 0.45); },
    fall() { this.tone(500, 0.6, "sawtooth", 0.12, 0.2); },
    fail() { this.tone(330, 0.4, "sawtooth", 0.08, 0.5); },
    gem() { this.tone(1568, 0.14, "sine", 0.16, 1.4); this.tone(2349, 0.12, "sine", 0.1, 1, 0.06); },
    click() { this.tone(1200, 0.03, "sine", 0.05); },
    lock() { this.tone(660, 0.08, "sine", 0.12); this.tone(990, 0.12, "sine", 0.12, 1, 0.06); },
    tick(k) { const now = performance.now(); if (now - this.lastTick < 45) return; this.lastTick = now; this.tone(440 * Math.pow(1.0595, k % 24), 0.1, "triangle", 0.12); },
    perfect() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, "triangle", 0.18, 1, i * 0.08)); },
    beep() { this.tone(880, 0.08, "square", 0.06); },
    life() { [880, 1175].forEach((f, i) => this.tone(f, 0.18, "sine", 0.15, 1, i * 0.09)); },
  };
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
  function pauseAudio() { try { Snd.ctx && Snd.ctx.suspend(); } catch (e) {} }
  function resumeAudio() { try { Snd.ctx && Snd.on && Snd.ctx.resume(); } catch (e) {} }
  ADS.setHooks({ pause: () => { pauseAudio(); }, resume: () => { resumeAudio(); } });
  const cfg = () => NET.st.config;

  // ---------------- level generation in a background worker ----------------
  const Gen = (() => {
    let worker = null, nextId = 1; const waiting = new Map(), cache = new Map();
    try {
      const src = $("engine-src").textContent + "\nonmessage=function(e){var d=e.data;try{postMessage({id:d.id,L:d.demo?ENGINE.genDemo(d.n,d.seed):ENGINE.genLevel(d.n,d.seed)})}catch(err){postMessage({id:d.id,err:String(err)})}};";
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      worker.onmessage = (e) => { const w = waiting.get(e.data.id); if (!w) return; waiting.delete(e.data.id); e.data.L ? w.ok(e.data.L) : w.ko(e.data.err); };
      worker.onerror = () => { worker = null; };
    } catch (e) { worker = null; }
    function get(n, seed, demo) {
      const k = (demo ? "d" : "") + seed + ":" + n, gen = () => (demo ? E.genDemo(n, seed) : E.genLevel(n, seed));
      if (!cache.has(k)) {
        const p = worker ? new Promise((ok, ko) => { const id = nextId++; waiting.set(id, { ok, ko }); worker.postMessage({ id, n, seed, demo: !!demo }); }).catch(gen)
          : new Promise((ok) => setTimeout(() => ok(gen()), 0));
        cache.set(k, p);
        if (cache.size > 12) cache.delete(cache.keys().next().value);
      }
      return cache.get(k).then((L) => JSON.parse(JSON.stringify(L)));
    }
    return { get };
  })();

  // ---------------- seeds, modes, news ----------------
  function newSeed() { let v = 0; try { const a = new Uint32Array(1); crypto.getRandomValues(a); v = a[0]; } catch (e) { v = (Math.random() * 4294967296) >>> 0; } return v || 1; }
  let seed = store.get("seed", 0) >>> 0; if (!seed) { seed = newSeed(); store.set("seed", seed); }
  const gameCode = (s) => (s >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(-6);
  const NEWS = {
    orb: ["Points ×2", "Ta balle doit traverser un point ×2 avant de toucher la clôture : elle se divise en deux. Si elle touche la clôture avant, elle tombe et tu perds une vie. Mets 2 balles dans la cible pour passer."],
    focus: ["Le secret des foyers", "Un point ×2 posé sur un foyer est spécial : les deux balles qui en sortent rebondissent et filent toutes les deux vers l'autre foyer, là où est la cible."],
    fence2: ["Clôture fragile", "Ici, chaque balle ne peut toucher la clôture que 2 fois. Au 3e contact, elle disparaît."],
    fence1: ["Un seul rebond", "Chaque balle ne peut toucher la clôture qu'une seule fois. Pas le droit à l'erreur."],
    need3: ["Trois balles", "Il faut 3 balles dans la cible : une des deux balles dupliquées doit passer par le deuxième point ×2."],
    need4: ["Quatre balles", "Il faut 4 balles dans la cible : les deux balles dupliquées doivent repasser par un point ×2."],
    hidden: ["Foyers cachés", "Les foyers ne sont plus affichés. La cible est sur l'un d'eux. L'autre est à la même distance du centre, de l'autre côté."],
    rot: ["Mur tournant", "Un mur tourne sur lui-même. Vise, puis attends le bon moment pour tirer."],
    slide: ["Mur glissant", "Ce mur avance et recule. Observe son rythme avant de tirer."],
    hole: ["Trou noir", "Une balle qui passe sur un trou noir disparaît. Contourne-le."],
    timer: ["Chrono", "Tu as quelques secondes pour tirer. Si le temps s'écoule, tu perds une vie."],
    gem: ["Cristaux", "Fais passer une balle sur un cristal pour gagner 50 points de plus."],
    bonus: ["Niveau bonus", "Place la source et lâche une salve de balles. Chaque balle dans la cible rapporte des points, les cristaux aussi. Ce niveau ne coûte jamais de vie."],
    bump: ["Rebondisseur", "Les barres jaunes renvoient la balle comme un miroir. Ce rebond ne compte pas comme un contact avec la clôture."],
    portal: ["Portails", "Une balle qui entre dans un portail ressort par l'autre, dans la même direction."],
    moveorb: ["Point ×2 mobile", "Un des points ×2 se déplace. Tire au bon moment pour le traverser."],
    cascade: ["Cascade ×2 ×3 ×4", "Chaque point multiplie toutes les balles qui le traversent : 1 balle, puis 2, puis 6, puis 24… Le dernier point est posé sur un foyer : toutes ses balles rebondissent et convergent sur la cible. Vise la chaîne entière : la ligne verte te montre jusqu'où elle va. Plus tu mets de balles, plus tu gagnes d'étoiles."],
    fog: ["Brouillard", "Une zone de brouillard cache une partie de la table. Tes balles y passent, mais tu ne les vois plus."],
  };
  const THEMES = {
    or: { name: "OR", hue: 45, spread: 18, shape: "star" }, galaxie: { name: "GALAXIE", hue: 275, spread: 40, shape: "dot" },
    glace: { name: "GLACE", hue: 195, spread: 20, shape: "diamond" }, feu: { name: "FEU", hue: 18, spread: 22, shape: "flame" },
    arcenciel: { name: "ARC-EN-CIEL", hue: -1, spread: 360, shape: "heart" }, jungle: { name: "JUNGLE", hue: 120, spread: 30, shape: "leaf" },
  };
  let seen = store.get("seen2", []), newsQueue = [];

  // ---------------- state ----------------
  const prog = Object.assign({ level: store.get("level", 1), bestLevel: store.get("bestLevel", 1), points: store.get("points", 0), cleared: 0, fails: 0 }, store.get("progress", {}));
  const G = {
    screen: "menu", mode: "main", n: prog.level, L: null, S: null, points: prog.points, combo: 0, tries: 0, cleared: 0,
    phase: "aim", ghost: null, ang: 0, time: 0, phaseT: 0, src: null, aiming: false, dragging: false, fast: false,
    revealed: false, paused: false, fade: 0, hue: 190, timeLeft: 0, failWhy: "", locked: false,
    lives: store.get("lives", 5), lifeAt: store.get("lifeAt", 0), defi: null, dLives: 3, dPoints: 0,
    slow: 0, auto: null, demoSeed: 1, preview: null, stars: store.get("stars", 0),
  };
  let parts = [], rings = [], pops = [], shake = 0, flash = 0, view = { s: 1, cx: 0, cy: 0 }, W = 0, H = 0, DPR = 1;
  const cv = $("cv"), ctx = cv.getContext("2d");
  const curSeed = () => (G.mode === "defi" ? G.defi.seed : G.mode === "demo" ? G.demoSeed : seed);
  function saveProg() {
    if (G.mode !== "main") return;
    store.set("stars", G.stars);
    prog.level = G.n; prog.points = G.points; prog.bestLevel = Math.max(prog.bestLevel || 1, G.n);
    store.set("progress", prog); store.set("level", G.n); store.set("points", G.points); store.set("bestLevel", prog.bestLevel);
    NET.saveProgress({ level: prog.level, bestLevel: prog.bestLevel, points: prog.points, cleared: prog.cleared, fails: prog.fails });
  }
  function hueFor(n) { let h = (192 + (curSeed() % 7) * 41 + (n - 1) * 29) % 360; if (h > 318 || h < 18) h = (h + 60) % 360; return h; }
  const skipCost = () => (cfg().skipCostBase || 150) + (cfg().skipCostPerLevel || 15) * G.n;
  const refillCost = () => 200 + 10 * G.n;

  // ---------------- lives ----------------
  const livesMax = () => Math.max(1, cfg().livesMax || 5);
  const regenMs = () => Math.max(1, cfg().lifeRegenMin || 15) * 60000;
  function tickLives() {
    const max = livesMax();
    if (G.lives >= max) { if (G.lives > max) G.lives = max; G.lifeAt = 0; }
    else {
      if (!G.lifeAt) G.lifeAt = Date.now();
      const g = Math.floor((Date.now() - G.lifeAt) / regenMs());
      if (g > 0) { G.lives = Math.min(max, G.lives + g); G.lifeAt = G.lives >= max ? 0 : G.lifeAt + g * regenMs(); Snd.life(); }
    }
    store.set("lives", G.lives); store.set("lifeAt", G.lifeAt);
  }
  const nextLife = () => (G.lifeAt ? Math.max(0, regenMs() - (Date.now() - G.lifeAt)) : 0);
  const mmss = (ms) => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  function addLives(k) { G.lives = Math.min(livesMax(), G.lives + k); if (G.lives >= livesMax()) G.lifeAt = 0; tickLives(); Snd.life(); }
  const curLives = () => (G.mode === "defi" ? G.dLives : G.mode === "demo" ? 1 : G.lives);
  const curMax = () => (G.mode === "defi" ? 3 : G.mode === "demo" ? 0 : livesMax());
  function heartsHTML(n, max, lostIdx) { let h = ""; for (let i = 0; i < max; i++) h += '<i class="' + (i < n ? "on" : "") + (i === lostIdx ? " lost" : "") + '"></i>'; return h; }

  // ---------------- layout ----------------
  function resize() { DPR = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); layout(); }
  function layout() {
    const rx = G.screen === "play" && G.L ? G.L.rx : 190, ry = 300;
    let top = 20, bot = 20;
    if (G.screen === "play") { const ht = document.querySelector(".hud-top").getBoundingClientRect(), hb = document.querySelector(".hud-bottom").getBoundingClientRect(); top = ht.bottom + 4; bot = H - hb.top + 4; }
    const avH = Math.max(120, H - top - bot);
    view.s = Math.min((W - 20) / (2 * rx + 24), avH / (2 * ry + 24)); view.cx = W / 2; view.cy = top + avH / 2;
  }
  const toWorld = (e) => ({ x: (e.clientX - view.cx) / view.s, y: (e.clientY - view.cy) / view.s });

  // ---------------- HUD ----------------
  const comboMult = () => 1 + 0.25 * Math.min(Math.max(0, G.combo - 1), 8);
  let shownLives = -1;
  function renderHUD() {
    const L = G.L; if (!L) return;
    $("hLvlLbl").textContent = G.mode === "defi" ? "DÉFI · NIV." : G.mode === "demo" ? "DÉMO" : "NIVEAU";
    $("hLvl").textContent = G.n;
    $("hScore").textContent = fmt(G.mode === "defi" ? G.dPoints : G.mode === "demo" ? (G.S ? G.S.balls.filter((b) => b.state === "live" || b.state === "hit").length : 1) : G.points);
    document.querySelector(".lbl-pts").textContent = G.mode === "demo" ? "BALLES" : "POINTS";
    const lv = curLives();
    $("hLives").innerHTML = heartsHTML(lv, curMax(), shownLives > lv ? lv : -1); shownLives = lv;
    const c = $("hCombo"); if (G.combo > 1) { c.hidden = false; c.textContent = "COMBO ×" + String(comboMult()).replace(".", ","); } else c.hidden = true;
    const hits = G.S ? G.S.hits : 0;
    $("hNeed").hidden = L.type === "salve"; $("hNeedTxt").textContent = G.mode === "demo" ? String(hits) : Math.min(hits, 999) + "/" + L.need; $("hNeed").classList.toggle("ok", hits >= L.need && L.need > 0);
    const chips = [];
    if (L.type === "salve") chips.push(["BONUS · " + (THEMES[L.theme] || THEMES.or).name, "gold"]);
    else if (G.mode === "demo") chips.push(["CASCADE " + (L.mults || []).map((m) => "×" + m).join(" → "), "gold"]);
    else {
      if (L.star3) chips.push(["★ " + L.need + " · ★★ " + L.star2 + " · ★★★ " + L.star3 + " balles", "gold"]);
      chips.push(["Clôture : " + L.maxB + " contact" + (L.maxB > 1 ? "s" : "") + " max", L.maxB < 3 ? "hot" : ""]);
      if (L.hidden && !G.revealed) chips.push(["Foyers cachés", "hot"]);
      if (L.walls.some((w) => w.rot)) chips.push(["Mur tournant", "hot"]);
      if (L.walls.some((w) => w.slide)) chips.push(["Mur glissant", "hot"]);
      if (L.walls.some((w) => w.bump)) chips.push(["Rebondisseur", ""]);
      if (L.holes && L.holes.length) chips.push(["Trou noir", "hot"]);
      if (L.portals && L.portals.length) chips.push(["Portails", ""]);
      if (L.orbs.some((o) => o.move)) chips.push(["×2 mobile", "hot"]);
      if (L.fog && L.fog.length) chips.push(["Brouillard", "hot"]);
      if (L.timer) chips.push(["Chrono " + L.timer + " s", "hot"]);
    }
    $("hChips").innerHTML = chips.map(([t, k]) => '<span class="chip ' + k + '">' + t + "</span>").join("");
    const aim = G.phase === "aim";
    $("bHint").hidden = !(L.hidden && !G.revealed && aim);
    $("bSalvo").hidden = !(L.type === "salve" && aim);
    $("aimRow").hidden = !(L.type === "tir" && aim) || G.mode === "demo";
    $("bExitDemo").hidden = G.mode !== "demo";
    updateHelp();
  }
  let aimInfo = { kind: "none" };
  function updateHelp() {
    const h = $("hHelp"), L = G.L; h.classList.remove("good", "bad");
    if (L.type === "salve") { h.textContent = G.locked ? "Source calée pile sur le foyer !" : "Glisse pour placer la source, puis lance la salve"; if (G.locked) h.classList.add("good"); return; }
    if (G.mode === "demo") { h.textContent = demoCaption(); h.classList.add("good"); return; }
    if (G.phase === "fly") { const n = G.S ? G.S.balls.filter((b) => b.state === "live").length : 0; h.textContent = n > 1 ? n + " balles en jeu · maintiens pour accélérer" : "Maintiens le doigt pour accélérer"; return; }
    if (G.phase !== "aim") { h.textContent = ""; return; }
    const k = aimInfo.kind, pv = G.preview;
    if (k === "orb" && pv && pv.chain.length) { h.textContent = "Chaîne : " + pv.chain.map((m) => "×" + m).join(" → ") + " · " + pv.count + " balles" + (pv.focus ? " vers le foyer" : ""); h.classList.add("good"); }
    else if (k === "orb") { h.textContent = "Tir correct : la balle passe par un point ×2"; h.classList.add("good"); }
    else if (k === "fence") { h.textContent = "Attention : la balle touchera la clôture sans ×2 et tombera"; h.classList.add("bad"); }
    else if (k === "wall" || k === "hole") { h.textContent = "Attention : obstacle sur la trajectoire"; h.classList.add("bad"); }
    else if (k === "bump" || k === "portal") h.textContent = k === "bump" ? "La balle va rebondir sur la barre jaune" : "La balle va passer par un portail";
    else if (k === "target") { h.textContent = "Une seule balle ne suffit pas : passe par un point ×2"; h.classList.add("bad"); }
    else h.textContent = "Glisse pour viser · relâche pour tirer";
  }
  function bumpScore() { const b = $("hScore"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }

  // ---------------- screens ----------------
  const modalsOpen = () => ["news", "fail", "pause", "comm", "ad", "defiCard", "dover", "gift", "how", "loading"].some((id) => !$(id).hidden);
  function showScreen(name) { G.screen = name; $("menu").hidden = name !== "menu"; $("hud").hidden = name !== "play"; layout(); }
  function renderMenu() {
    tickLives();
    const best = prog.bestLevel || 1;
    $("mBest").innerHTML = best > 1 ? "Record : <b>niveau " + best + "</b> · <b>" + fmt(G.points) + "</b> points" : "Des niveaux à l'infini, différents pour chaque partie.";
    $("bPlaySub").textContent = G.n > 1 ? "Reprendre au niveau " + G.n : "Niveau 1";
    $("bRestart1").textContent = G.n > 1 ? "Nouvelle partie (nouveaux niveaux depuis le 1)" : "Nouvelle partie (changer de niveaux)";
    $("bSound").textContent = "Son : " + (Snd.on ? "oui" : "non");
    const ann = (cfg().announcement || "").trim(); $("mAnnounce").hidden = !ann; $("mAnnounce").textContent = ann;
    $("mLives").innerHTML = '<div class="lives">' + heartsHTML(G.lives, livesMax()) + "</div>" + (G.lives < livesMax() ? "<span>Prochaine vie dans " + mmss(nextLife()) + "</span>" : "<span>Vies au maximum</span>");
    document.querySelectorAll("[data-banner]").forEach((el) => { if (!el.closest("[hidden]")) ADS.banner(el); });
  }

  // ---------------- flow ----------------
  function play(from) {
    Snd.init(); NET.stat("games");
    G.mode = "main"; G.n = from; G.combo = 0; saveProg();
    showScreen("play"); startLevel(true);
  }
  function startDefi(ch) {
    Snd.init(); NET.stat("games");
    G.mode = "defi"; G.defi = ch; G.dLives = 3; G.dPoints = 0; G.n = 1; G.combo = 0; shownLives = -1;
    COMMUNITY.rememberDefi(ch);
    showScreen("play"); startLevel(true);
  }
  function startDemo() {
    Snd.init();
    G.mode = "demo"; G.demoSeed = newSeed(); G.n = 1; G.combo = 0;
    showScreen("play"); startLevel(true);
  }
  let loadToken = 0;
  async function startLevel(fresh) {
    const token = ++loadToken, n = G.n, sd = curSeed(), demo = G.mode === "demo";
    let L;
    const t = setTimeout(() => { if (token === loadToken) $("loading").hidden = false; }, 120);
    try { L = await Gen.get(n, sd, demo); } finally { clearTimeout(t); $("loading").hidden = true; }
    if (!L) { G.n++; return startLevel(fresh); }
    if (token !== loadToken || G.n !== n) return;
    const prevL = G.L;
    if (!fresh && prevL && prevL.n === L.n && prevL.gems) L.gems.forEach((g, i) => { if (prevL.gems[i] && prevL.gems[i].taken) g.taken = true; });
    G.L = L; G.S = null; if (fresh) { G.revealed = false; G.ghost = null; G.tries = 0; }
    G.phase = "aim"; G.phaseT = 0; G.time = 0; G.fade = fresh ? 0 : 1; G.fast = false; G.timeLeft = L.timer || 0; G.locked = false; G.slow = 0; G.preview = null;
    G.auto = demo && L.bestAng != null ? { t: -0.9, dur: 1.6 } : null;
    G.hue = L.type === "salve" ? ((THEMES[L.theme] || THEMES.or).hue + 360) % 360 : hueFor(G.n);
    if (L.type === "salve") { G.src = { x: L.start.x, y: L.start.y }; }
    else if (fresh) { const o = L.orbs[1] || L.orbs[0]; G.ang = Math.atan2(o.y - L.start.y, o.x - L.start.x) + 0.35; }
    if (demo) G.ang = L.bestAng + (G.n % 2 ? 0.9 : -0.9);
    if (fresh) { parts = []; rings = []; pops = []; pops.push({ text: L.type === "salve" ? "BONUS " + (THEMES[L.theme] || THEMES.or).name : demo ? "1 BALLE" : (G.mode === "defi" ? "DÉFI · " : "NIVEAU ") + G.n, x: 0, y: -40, life: 1.1, max: 1.1, size: 30, color: "#ffffff", big: true }); }
    renderHUD(); layout();
    if (fresh) {
      newsQueue = demo ? [] : L.features.filter((f) => NEWS[f] && !seen.includes(f));
      if (newsQueue.length) showNews();
      Gen.get(n + 1, sd, demo); if (!demo) Gen.get(n + 2, sd);
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
  // bonus calibration: when the foci are visible, a source dropped close to the free focus snaps exactly onto it
  function placeSrc(p) {
    const L = G.L, f = L.other;
    const showF = !L.hidden || G.revealed;
    if (showF && f && Math.hypot(p.x - f.x, p.y - f.y) < 16) { const was = G.locked; G.src = { x: f.x, y: f.y }; G.locked = true; if (!was) { Snd.lock(); buzz(10); } updateHelp(); return; }
    if (!validSrc(p)) return;
    G.src = p; if (G.locked) { G.locked = false; updateHelp(); }
  }
  function canPlay() { tickLives(); return curLives() > 0; }
  // assisted aim: predict the shot up to the fence (splits included) and report the chain of multipliers it goes through
  function predict(ang) {
    const L = G.L, P = Object.assign({}, L, { maxB: 0, noFall: true, gems: null });
    const S = E.newSim(P, ang, G.time), chain = [], seenOrb = new Set();
    let focus = false, steps = 0;
    const ev = (type, b, x, y, o) => { if (type === "split") { const key = o.move || o; if (!seenOrb.has(key)) { seenOrb.add(key); chain.push(o.m || 2); } if (o.focus) focus = true; } };
    while (!S.done && steps < 900) { E.stepSim(S, 1 / 120, ev); steps++; }
    const count = S.balls.filter((b) => b.state !== "split" && b.why !== "wall" && b.why !== "hole").length;
    return { S, chain, count: S.splits ? count : 1, focus };
  }
  function magnetAim() { // nudges the angle (at most 0.6°) to the direction that keeps the longest chain
    const base = G.ang, cur = predict(base); let best = cur, bestA = base;
    for (let k = -12; k <= 12; k++) {
      if (!k) continue;
      const a = base + (k * 0.05 * Math.PI) / 180, p = predict(a);
      if (p.count > best.count || (p.count === best.count && p.chain.length > best.chain.length)) { best = p; bestA = a; }
    }
    if (bestA !== base && best.count > cur.count) { G.ang = bestA; toast("Visée aimantée : " + best.chain.map((m) => "×" + m).join(" → ") + " · " + best.count + " balles"); }
  }
  function fire() {
    if (G.phase !== "aim" || G.L.type !== "tir" || G.paused || G.screen !== "play") return;
    if (!canPlay()) { showFailCard(); return; }
    if (G.mode !== "demo") magnetAim();
    Snd.init();
    G.tries++; G.ghost = null;
    G.S = E.newSim(G.L, G.ang, G.time);
    G.S.balls[0].hue = G.hue; G.S.balls[0].trail = [];
    G.phase = "fly"; G.phaseT = 0; Snd.shoot(); renderHUD();
  }
  function fireSalvo() {
    if (G.phase !== "aim" || G.L.type !== "salve" || G.paused) return;
    if (!G.locked && !validSrc(G.src)) { toast("Trop près de la cible, d'un mur ou du bord"); return; }
    Snd.init(); Snd.shoot();
    const L = G.L, th = THEMES[L.theme] || THEMES.or; L.start = { x: G.src.x, y: G.src.y };
    const balls = [];
    for (let i = 0; i < L.balls; i++) {
      const b = E.makeBall(G.src.x, G.src.y, (i / L.balls) * TAU + 0.031);
      b.hue = th.hue < 0 ? (i / L.balls) * 360 : th.hue + Math.sin(i * 2.4) * th.spread; b.trail = []; balls.push(b);
    }
    G.S = E.newSim(L, 0, G.time, balls);
    G.phase = "fly"; G.phaseT = 0; renderHUD();
  }
  function onEvent(type, b, x, y, g) {
    const salvo = G.L.type === "salve";
    if (type === "bounce") {
      if (!salvo) { Snd.bounce(b.bounces - 1); burst(x, y, 6, b.hue, 90, 0.35, 2); rings.push({ x, y, r: 4, life: 0.35, max: 0.35, hue: b.hue }); }
      else if (Math.random() < 0.15) burst(x, y, 2, b.hue, 60, 0.3, 1.5);
    } else if (type === "bump") { if (!salvo) { Snd.bump(); burst(x, y, 8, 52, 110, 0.35, 2); } }
    else if (type === "portal") { if (!salvo) Snd.portal(); burst(x, y, 12, 210, 120, 0.45, 2); burst(g.x, g.y, 12, 30, 120, 0.45, 2); }
    else if (type === "split") {
      Snd.split(b.gen); buzz(12);
      burst(x, y, 26, 275, 200, 0.6, 2.4); rings.push({ x, y, r: 6, life: 0.5, max: 0.5, hue: 275, big: true });
      const m = g.m || 2; pops.push({ text: "×" + m, x, y: y - 20, life: 0.9, max: 0.9, size: 18 + m * 2, color: ORB_COL[m] || "#c9b8ff" });
    } else if (type === "gem") {
      g.taken = true; const v = salvo ? 20 : 50; addPoints(v); bumpScore(); Snd.gem(); buzz(15);
      burst(x, y, 22, 165, 160, 0.6, 2.5); pops.push({ text: "+" + v, x, y: y - 10, life: 0.9, max: 0.9, size: 18, color: "#3fe0c5" });
    } else if (type === "hit") {
      if (salvo) { Snd.tick(G.S.hits); burst(x, y, 3, b.hue, 140, 0.5, 2); }
      else {
        if (G.S.hits === 1 && G.S.balls.filter((q) => q.state === "live").length >= 5) G.slow = 1.1; // slow motion for the convergence
        const h = G.S.hits;
        if (h <= 6) { Snd.hit(h); buzz(20); } else Snd.tick(h);
        burst(x, y, h <= 6 ? 24 : 6, 48, 200, 0.6, 2.6); if (h <= 12) rings.push({ x, y, r: 4, life: 0.5, max: 0.5, hue: 48, big: true });
        if (h <= G.L.need || h % 5 === 0 || h === G.L.star2 || h === G.L.star3) pops.push({ text: G.mode === "demo" ? String(h) : h + "/" + G.L.need, x: x + 30, y: y - 20, life: 0.9, max: 0.9, size: 18, color: h >= G.L.need ? "#ffd25a" : "#ffffff" });
        renderHUD();
      }
    } else if (type === "wall") { burst(x, y, salvo ? 3 : 16, 340, 130, 0.45, 2); if (!salvo) { Snd.wall(); shake = Math.max(shake, 6); } }
    else if (type === "hole") { burst(x, y, 20, 270, 60, 0.6, 2); if (!salvo) Snd.wall(); }
    else if (type === "fall") {
      burst(x, y, 30, 350, 150, 0.7, 2.4); Snd.fall(); shake = 14; buzz([30, 40, 30]);
      pops.push({ text: "CHUTE !", x: x * 0.6, y: y * 0.6, life: 1.1, max: 1.1, size: 28, color: "#ff4766", big: true });
    } else if ((type === "over" || type === "lost") && !salvo) burst(x, y, 10, 220, 70, 0.4, 1.6);
  }
  function addPoints(v) { if (G.mode === "defi") G.dPoints += v; else G.points += v; }
  function endFlight() {
    const S = G.S, L = G.L;
    if (L.type === "salve") return salvoEnd();
    if (S.fail === "fall") return failLevel("fall");
    if (S.hits >= L.need) return win();
    failLevel("short");
  }
  function win() {
    const L = G.L, S = G.S, first = G.tries === 1;
    if (G.mode === "demo") { pops.push({ text: S.hits + " BALLES", x: 0, y: -60, life: 2, max: 2, size: 34, color: "#ffd25a", big: true }); pops.push({ text: "1 TIR · 1 CIBLE", x: 0, y: -18, life: 2, max: 2, size: 18, color: "#ffffff", big: true }); flash = 0.4; Snd.perfect(); G.phase = "clear"; G.phaseT = -0.8; renderHUD(); return; }
    G.combo = first ? G.combo + 1 : 0;
    const extra = Math.max(0, S.hits - L.need);
    const stars = L.star3 ? (S.hits >= L.star3 ? 3 : S.hits >= L.star2 ? 2 : 1) : first ? 3 : G.tries === 2 ? 2 : 1;
    if (G.mode === "main") G.stars += stars;
    const pts = Math.round((40 + 5 * G.n + (L.cascade ? 12 : 20) * S.hits + (L.cascade ? 0 : 30 * extra) + 50 * (stars - 1)) * (first ? comboMult() : 1));
    addPoints(pts); G.cleared++; bumpScore();
    if (G.mode === "main") { prog.cleared++; NET.levelCleared(pts); } else NET.stat("levels");
    const t = L.target;
    burst(t.x, t.y, 70, -1, 260, 1.0, 3); rings.push({ x: t.x, y: t.y, r: 6, life: 0.7, max: 0.7, hue: 48, big: true });
    flash = 0.35; Snd.win(G.combo); buzz(40);
    pops.push({ text: "★".repeat(stars) + "☆".repeat(3 - stars), x: 0, y: 28, life: 1.4, max: 1.4, size: 30, color: "#ffd25a", big: true });
    if (L.cascade) pops.push({ text: S.hits + " balles", x: 0, y: 62, life: 1.4, max: 1.4, size: 16, color: "#ffffff", big: true });
    const word = stars === 3 && L.cascade ? "CASCADE PARFAITE !" : extra > 0 && !L.cascade ? "INCROYABLE !" : first ? (G.combo > 1 ? "COMBO ×" + String(comboMult()).replace(".", ",") : "PARFAIT !") : G.tries === 2 ? "BRAVO !" : "ENFIN !";
    pops.push({ text: word, x: 0, y: -60, life: 1.3, max: 1.3, size: 34, color: first ? "#ffd25a" : "#ffffff", big: true });
    pops.push({ text: "+" + pts, x: 0, y: -15, life: 1.2, max: 1.2, size: 22, color: "#ffffff", big: true });
    G.phase = "clear"; G.phaseT = 0; renderHUD();
  }
  function failLevel(why) {
    if (G.mode === "demo") { G.phase = "aim"; G.S = null; G.auto = { t: -0.5, dur: 1 }; return; }
    G.combo = 0; G.failWhy = why; Snd.fail(); NET.stat("fails");
    if (G.mode === "defi") G.dLives = Math.max(0, G.dLives - 1);
    else { if (G.lives >= livesMax()) G.lifeAt = Date.now(); G.lives = Math.max(0, G.lives - 1); prog.fails++; tickLives(); }
    const S = G.S;
    if (S) { const b = S.balls[0]; G.ghost = b.path.slice(); if (b.state === "live") G.ghost.push({ x: b.x, y: b.y }); }
    if (why === "short") { shake = Math.max(shake, 8); pops.push({ text: "RATÉ", x: 0, y: -40, life: 1, max: 1, size: 30, color: "#ff4766", big: true }); }
    if (why === "time") { shake = 8; pops.push({ text: "TEMPS ÉCOULÉ", x: 0, y: -40, life: 1, max: 1, size: 26, color: "#ff4766", big: true }); }
    G.phase = "failed"; G.phaseT = 0; renderHUD(); saveProg();
  }
  let failTimer = 0;
  function showFailCard() {
    if (G.mode === "defi" && G.dLives <= 0) return defiOver();
    const L = G.L, S = G.S, cost = skipCost(), lv = curLives(), main = G.mode === "main";
    $("fEyebrow").textContent = (main ? "NIVEAU " : "DÉFI · NIVEAU ") + G.n + " · ESSAI " + Math.max(1, G.tries);
    const titles = { fall: "La balle est tombée", short: "Pas assez de balles", time: "Trop tard !", none: "Plus de vies" };
    $("fTitle").textContent = lv <= 0 ? "Plus de vies !" : titles[G.failWhy] || "Raté !";
    $("fText").textContent = G.failWhy === "fall" ? "Elle a touché la clôture avant de traverser un point ×2."
      : G.failWhy === "time" ? "Le chrono est arrivé à zéro avant ton tir."
      : G.failWhy === "short" ? "Il fallait " + L.need + " balles dans la cible, tu en as mis " + (S ? S.hits : 0) + "." : "";
    if (lv <= 0) $("fText").textContent += " Tes vies se rechargent toutes seules, ou récupère-les tout de suite.";
    $("fLives").innerHTML = heartsHTML(lv, curMax());
    $("bRetry").disabled = lv <= 0;
    $("bRetry").textContent = lv > 0 ? "RÉESSAYER (" + lv + " vie" + (lv > 1 ? "s" : "") + ")" : "RÉESSAYER";
    $("bLifeAd").hidden = !(main && lv < livesMax());
    $("bLifePts").hidden = !(main && lv < livesMax());
    $("bLifePts").textContent = "Remplir les vies · " + fmt(refillCost()) + " points";
    $("bLifePts").disabled = G.points < refillCost();
    $("bSkipAd").hidden = !main; $("bSkipPts").hidden = !main;
    $("bSkipPts").textContent = "Passer le niveau · " + fmt(cost) + " points"; $("bSkipPts").disabled = G.points < cost;
    $("fail").hidden = false; G.paused = true;
    ADS.banner($("fail").querySelector("[data-banner]"));
    clearInterval(failTimer);
    const upd = () => { tickLives(); const t = $("fTimer"); if (main && G.lives < livesMax()) { t.hidden = false; t.textContent = "Prochaine vie dans " + mmss(nextLife()); } else t.hidden = true;
      if (main && G.lives > 0 && $("bRetry").disabled) showFailCard(); };
    upd(); failTimer = setInterval(upd, 1000);
  }
  function closeFail() { clearInterval(failTimer); $("fail").hidden = true; G.paused = false; }
  function retry() { if (curLives() <= 0) return; closeFail(); startLevel(false); }
  function salvoEnd() {
    const L = G.L, n = L.balls, pct = G.S.hits / n;
    let pts = G.S.hits * 5;
    const perfect = pct >= 0.9;
    if (perfect) { pts += 300; Snd.perfect(); flash = 0.4; if (G.mode === "main" && G.lives < livesMax()) { addLives(1); pops.push({ text: "+1 VIE", x: 0, y: 30, life: 1.6, max: 1.6, size: 22, color: "#ff4f9a", big: true }); } else if (G.mode === "defi" && G.dLives < 3) G.dLives++; }
    else Snd.win(0);
    addPoints(pts); G.cleared++; bumpScore();
    if (G.mode === "main") { prog.cleared++; NET.levelCleared(pts); }
    pops.push({ text: Math.round(pct * 100) + " %", x: 0, y: -70, life: 1.6, max: 1.6, size: 44, color: perfect ? "#ffd25a" : "#ffffff", big: true });
    pops.push({ text: (perfect ? "PARFAIT ! +" : "+") + pts, x: 0, y: -20, life: 1.6, max: 1.6, size: 20, color: "#ffffff", big: true });
    G.phase = "clear"; G.phaseT = -0.4; renderHUD();
  }
  function advance(skipped) {
    G.n++; saveProg();
    if (G.mode === "demo") G.cleared++;
    const go = () => startLevel(true);
    const every = Math.max(1, cfg().interstitialEvery || 4);
    if (G.mode === "demo") return go();
    if (!skipped && G.cleared > 0 && G.cleared % every === 0) { G.paused = true; ADS.interstitial("niveau_" + G.n, () => { G.paused = false; go(); }); }
    else go();
  }

  // ---------------- demo captions ----------------
  function demoCaption() {
    const S = G.S, L = G.L;
    if (!S) return "Une seule balle, un seul tir. La visée passe par un point ×" + ((L.orbs[0] && L.orbs[0].m) || 2) + ".";
    const live = S.balls.filter((b) => b.state === "live").length;
    if (S.hits > 0) return "Le dernier point est sur un foyer : toutes ses balles convergent vers l'autre foyer. " + S.hits + " dans la cible !";
    if (S.splits > 0) return "Chaque point multiplie les balles qui le traversent : " + live + " balles en jeu.";
    return "La balle file vers la chaîne " + (L.mults || []).map((m) => "×" + m).join(" → ") + ".";
  }

  // ---------------- challenges ----------------
  async function defiOver() {
    G.phase = "done"; G.paused = true; clearInterval(failTimer); $("fail").hidden = true;
    const ch = G.defi, reached = G.n;
    COMMUNITY.rememberDefi(ch, reached);
    $("dTitle").textContent = "Niveau " + reached + " atteint";
    $("dText").textContent = fmt(G.dPoints) + " points. " + (NET.st.online && ch.id[0] !== "L" ? "Ton résultat est enregistré dans le classement du défi." : "Envoie le défi à tes amis pour comparer.");
    $("dRes").innerHTML = "";
    $("dover").hidden = false;
    try { await NET.postChallengeResult(ch.id, reached, G.dPoints); } catch (e) { console.warn(e); }
    COMMUNITY.showResults(ch.id, $("dRes"));
  }
  async function openDefiLink(id, s) {
    let ch = null;
    try { ch = await NET.getChallenge(id, s); } catch (e) { ch = null; }
    if (!ch) ch = { id, seed: s || 1, byPseudo: "" };
    if (!ch.seed) ch.seed = s || 1;
    $("dcTitle").textContent = ch.byPseudo ? ch.byPseudo + " te défie !" : "Un ami te défie !";
    $("dcRes").innerHTML = "";
    $("defiCard").hidden = false;
    COMMUNITY.showResults(ch.id, $("dcRes"));
    $("bDefiGo").onclick = () => { $("defiCard").hidden = true; history.replaceState(null, "", location.pathname); startDefi(ch); };
    $("bDefiLater").onclick = () => { $("defiCard").hidden = true; COMMUNITY.rememberDefi(ch); history.replaceState(null, "", location.pathname); };
  }

  // ---------------- daily gift ----------------
  const GIFTS = [100, 150, 200, 300, 400, 500, 1000];
  function maybeGift() {
    if (cfg().dailyGift === false) return;
    const t = C.today(), last = store.get("giftDay", "");
    if (last === t) return;
    const y = new Date(Date.now() - 864e5), yd = y.getFullYear() + "-" + String(y.getMonth() + 1).padStart(2, "0") + "-" + String(y.getDate()).padStart(2, "0");
    const streak = last === yd ? (store.get("giftStreak", 0) % 7) + 1 : 1, v = GIFTS[streak - 1];
    $("gTitle").textContent = "Jour " + streak + (streak === 7 ? " · GROS LOT" : "");
    $("gDays").innerHTML = GIFTS.map((g, i) => '<span class="' + (i + 1 < streak ? "done" : i + 1 === streak ? "now" : "") + '">J' + (i + 1) + "<b>" + g + "</b></span>").join("");
    $("gText").textContent = "+" + fmt(v) + " points et toutes tes vies rechargées. Reviens demain pour le jour " + ((streak % 7) + 1) + " !";
    $("gift").hidden = false;
    $("bGift").onclick = () => {
      store.set("giftDay", t); store.set("giftStreak", streak);
      G.points += v; addLives(livesMax()); saveProg(); $("gift").hidden = true; Snd.init(); Snd.perfect(); renderMenu(); toast("+" + fmt(v) + " points !");
    };
  }

  // ---------------- particles ----------------
  function burst(x, y, n, hue, sp, life, size) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), max: life, hue: hue < 0 ? Math.random() * 360 : hue + (Math.random() - 0.5) * 30, size: size * (0.6 + Math.random() * 0.8) }); }
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
    if (G.mode === "demo") { if (G.phase === "fly") G.fast = true; return; }
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    const p = toWorld(e);
    if (G.phase === "aim") { if (G.L.type === "tir") { G.aiming = true; G.ang = Math.atan2(p.y - G.L.start.y, p.x - G.L.start.x); } else { G.dragging = true; placeSrc(p); } }
    else if (G.phase === "fly") G.fast = true;
    else if (G.phase === "clear" && G.phaseT > 0.45) advance(false);
  });
  cv.addEventListener("pointermove", (e) => {
    if (G.screen !== "play" || G.paused) return;
    const p = toWorld(e);
    if (G.phase === "aim" && G.L.type === "tir" && G.aiming) G.ang = Math.atan2(p.y - G.L.start.y, p.x - G.L.start.x);
    else if (G.dragging) placeSrc(p);
  });
  cv.addEventListener("pointerup", () => { if (G.aiming) { G.aiming = false; fire(); } G.dragging = false; G.fast = false; });
  cv.addEventListener("pointercancel", () => { G.aiming = false; G.dragging = false; G.fast = false; });
  function holdBtn(el, fn) {
    let t1 = 0, t2 = 0; const stop = () => { clearTimeout(t1); clearInterval(t2); };
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); fn(); t1 = setTimeout(() => { t2 = setInterval(fn, 45); }, 320); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((k) => el.addEventListener(k, stop));
  }
  const nudge = (deg) => { if (G.phase === "aim" && !G.paused) { G.ang += (deg * Math.PI) / 180; Snd.click(); } };
  holdBtn($("bLeft"), () => nudge(-0.2)); holdBtn($("bRight"), () => nudge(0.2));
  $("bFire").onclick = fire;
  window.addEventListener("keydown", (e) => {
    if (G.screen !== "play" || G.paused || !G.L) return;
    if (G.L.type === "tir" && G.phase === "aim") {
      const d = e.shiftKey ? 2 : 0.2;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { nudge(-d); e.preventDefault(); }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { nudge(d); e.preventDefault(); }
      if (e.key === " " || e.key === "Enter") { fire(); e.preventDefault(); }
    } else if (G.L.type === "salve" && G.phase === "aim") {
      const d = e.shiftKey ? 10 : 2, m = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (m) { placeSrc({ x: G.src.x + m[0], y: G.src.y + m[1] }); e.preventDefault(); }
      if (e.key === " " || e.key === "Enter") { fireSalvo(); e.preventDefault(); }
    } else if (G.phase === "clear" && (e.key === " " || e.key === "Enter") && G.phaseT > 0.45) advance(false);
    if (e.key === "Escape" || e.key === "p") pauseGame();
  });

  // ---------------- buttons ----------------
  function pauseGame() { if (G.screen !== "play" || G.paused) return; G.paused = true; $("pTitle").textContent = (G.mode === "defi" ? "Défi · niveau " : "Niveau ") + G.n; $("pCode").textContent = "Partie n° " + gameCode(curSeed()) + " · niveaux uniques à cette partie"; $("bPauseSound").textContent = "Son : " + (Snd.on ? "oui" : "non"); $("pause").hidden = false; }
  function setSound(on) { Snd.on = on; store.set("sound", on); if (on) Snd.init(); $("bSound").textContent = "Son : " + (on ? "oui" : "non"); $("bPauseSound").textContent = "Son : " + (on ? "oui" : "non"); }
  function toMenu() { closeFail(); ["pause", "dover"].forEach((id) => ($(id).hidden = true)); G.paused = false; G.auto = null; G.mode = "main"; G.n = prog.level; G.L = null; saveProg(); showScreen("menu"); renderMenu(); }
  $("bPlay").onclick = () => { tickLives(); play(prog.level || 1); };
  $("bRestart1").onclick = () => { seed = newSeed(); store.set("seed", seed); prog.level = 1; G.combo = 0; play(1); toast("Nouvelle partie n° " + gameCode(seed)); };
  $("bSound").onclick = () => setSound(!Snd.on);
  $("bPauseSound").onclick = () => setSound(!Snd.on);
  $("bHow").onclick = () => { $("how").hidden = false; };
  $("bHowOk").onclick = () => { $("how").hidden = true; };
  $("bPause").onclick = pauseGame;
  $("bResume").onclick = () => { $("pause").hidden = true; G.paused = false; };
  $("bPauseComm").onclick = () => { $("pause").hidden = true; COMMUNITY.open("rank"); };
  $("bQuit").onclick = toMenu;
  $("bFailMenu").onclick = toMenu;
  $("bComm").onclick = () => COMMUNITY.open("rank");
  $("bDemo").onclick = startDemo;
  $("bExitDemo").onclick = toMenu;
  $("bDefi").onclick = () => COMMUNITY.open("defi");
  $("bNewsOk").onclick = () => { $("news").hidden = true; showNews(); };
  $("bSalvo").onclick = fireSalvo;
  $("bHint").onclick = () => { G.paused = true; ADS.rewarded("voir_foyers", () => { G.paused = false; G.revealed = true; renderHUD(); toast("Foyers révélés !"); }, () => { G.paused = false; }); };
  $("bRetry").onclick = retry;
  $("bLifeAd").onclick = () => ADS.rewarded("vie", () => { addLives(1); toast("+1 vie !"); showFailCard(); });
  $("bLifePts").onclick = () => { const c = refillCost(); if (G.points < c) return; G.points -= c; addLives(livesMax()); saveProg(); toast("Vies rechargées : −" + fmt(c) + " points"); showFailCard(); };
  $("bSkipAd").onclick = () => ADS.rewarded("passer_niveau", () => { closeFail(); toast("Niveau passé !"); advance(true); });
  $("bSkipPts").onclick = () => { const c = skipCost(); if (G.points < c) return; G.points -= c; closeFail(); toast("Niveau passé : −" + fmt(c) + " points"); advance(true); };
  $("bDefiShare").onclick = () => { $("dover").hidden = true; toMenu(); COMMUNITY.open("defi"); };
  $("bDefiAgain").onclick = () => { $("dover").hidden = true; G.paused = false; startDefi(G.defi); };
  $("bDefiMenu").onclick = toMenu;
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("bInstall").hidden = false; });
  $("bInstall").onclick = async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; $("bInstall").hidden = true; };
  document.addEventListener("visibilitychange", () => { if (document.hidden) { pauseGame(); pauseAudio(); saveProg(); } else { resumeAudio(); if (G.screen === "menu") renderMenu(); } });
  window.addEventListener("pagehide", saveProg);
  window.addEventListener("resize", resize);
  COMMUNITY.init({
    onOpen: () => { if (G.screen === "play") G.paused = true; },
    onClose: () => { if (G.screen === "play" && !modalsOpen()) G.paused = false; if (G.screen === "menu") renderMenu(); },
    onPlayChallenge: (ch) => startDefi(ch),
  });
  NET.on("config", (c) => { if (c.adClient && window.ellipsoLoadAdsense) window.ellipsoLoadAdsense(c); if (G.screen === "menu") renderMenu(); });
  NET.on("ads", () => { if (G.screen === "menu") renderMenu(); });
  NET.on("status", (s) => { if (s.banned) toast("Ton compte est suspendu de la communauté."); });

  // ---------------- aim analysis (what the shot meets first) ----------------
  function analyseAim() {
    const L = G.L, st = L.start, ux = Math.cos(G.ang), uy = Math.sin(G.ang);
    let best = { kind: "fence", t: E.rayEllipse(st.x, st.y, ux, uy, L.rx, L.ry) };
    const consider = (kind, t, extra) => { if (t < best.t) best = Object.assign({ kind, t }, extra); };
    E.orbsAt(L, G.time).forEach((o, i) => consider("orb", E.rayCircle(st.x, st.y, ux, uy, o.x, o.y, o.r + E.BALL_R), { i }));
    consider("target", E.rayCircle(st.x, st.y, ux, uy, L.target.x, L.target.y, L.tr));
    for (const h of L.holes || []) consider("hole", E.rayCircle(st.x, st.y, ux, uy, h.x, h.y, h.r));
    for (const P of L.portals || []) { consider("portal", E.rayCircle(st.x, st.y, ux, uy, P.a.x, P.a.y, P.r)); consider("portal", E.rayCircle(st.x, st.y, ux, uy, P.b.x, P.b.y, P.r)); }
    for (const w of E.wallsAt(L, G.time)) consider(w.bump ? "bump" : "wall", E.raySeg(st.x, st.y, ux, uy, w), w.bump ? { w } : {});
    best.x = st.x + ux * best.t; best.y = st.y + uy * best.t; best.ux = ux; best.uy = uy;
    return best;
  }

  // ---------------- update ----------------
  let lifeClock = 0;
  function update(dt) {
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt; }
    parts = parts.filter((p) => p.life > 0);
    for (const r of rings) { r.life -= dt; r.r += (r.big ? 160 : 70) * dt; }
    rings = rings.filter((r) => r.life > 0);
    for (const p of pops) { p.life -= dt; if (!p.big) p.y -= 30 * dt; }
    pops = pops.filter((p) => p.life > 0);
    shake *= Math.pow(0.002, dt); flash = Math.max(0, flash - dt);
    lifeClock += dt;
    if (lifeClock > 1) { lifeClock = 0; const before = G.lives; tickLives(); if (G.screen === "menu" && !modalsOpen()) renderMenu(); else if (G.lives !== before && G.screen === "play") renderHUD(); }
    if (G.screen === "menu") { demoStep(dt); return; }
    if (G.screen !== "play" || G.paused || !G.L) return;
    const L = G.L;
    G.fade = Math.min(1, G.fade + dt * 2.5); G.phaseT += dt;
    if (G.phase === "aim" && L.type === "tir" && G.auto && G.mode === "demo") {
      G.auto.t += dt;
      if (G.auto.t > 0) {
        if (G.auto.from == null) G.auto.from = G.ang;
        const u = Math.min(1, G.auto.t / G.auto.dur), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        G.ang = G.auto.from + (L.bestAng - G.auto.from) * e;
        if (u >= 1 && G.auto.t > G.auto.dur + 0.5) { G.auto = null; fire(); }
      }
    }
    if (G.phase === "aim" && L.type === "tir") {
      const prev = aimInfo.kind; aimInfo = analyseAim(); if (aimInfo.kind !== prev) updateHelp();
      const pvKey = G.ang.toFixed(5) + (E.moving(L) ? ":" + G.time.toFixed(2) : "");
      if (!G.preview || G.preview.key !== pvKey) { const pv = predict(G.ang); pv.key = pvKey; const changed = !G.preview || G.preview.count !== pv.count || G.preview.chain.join() !== pv.chain.join(); G.preview = pv; if (changed) updateHelp(); }
      if (L.timer) {
        const before = Math.ceil(G.timeLeft); G.timeLeft -= dt;
        if (Math.ceil(G.timeLeft) !== before && G.timeLeft <= 3 && G.timeLeft > 0) Snd.beep();
        if (G.timeLeft <= 0) { G.tries++; G.S = null; failLevel("time"); }
      }
    }
    if (G.slow > 0) G.slow -= dt;
    const scale = G.phase === "fly" ? (G.fast ? 3 : G.slow > 0 ? 0.4 : 1) : 1;
    G.simAcc = (G.simAcc || 0) + dt * scale;
    const steps = Math.floor(G.simAcc / E.DT); G.simAcc -= steps * E.DT;
    if (G.phase === "fly" && G.mode === "demo" && Math.random() < 0.2) { renderHUD(); }
    for (let k = 0; k < steps; k++) { G.time += E.DT; if (G.phase === "fly") { E.stepSim(G.S, E.DT, onEvent); if (G.S.done) { endFlight(); break; } } }
    if (G.S) for (const b of G.S.balls) { if (!b.trail) b.trail = []; if (b.state === "live") { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 14) b.trail.shift(); } else if (b.trail.length) b.trail.shift(); }
    if (G.phase === "fly" && G.S && Math.random() < 0.1) updateHelp();
    if (G.phase === "clear" && G.phaseT > (G.mode === "demo" ? 1.8 : 1.5)) advance(false);
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
  function drawEllipse(rx, ry, hue, a, rainbow, now) {
    ctx.save();
    const fill = ctx.createRadialGradient(0, 0, 0, 0, 0, X(ry));
    fill.addColorStop(0, "hsla(" + hue + ",80%,55%,0.07)"); fill.addColorStop(1, "hsla(" + hue + ",80%,55%,0.015)");
    ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(0, 0, X(rx), X(ry), 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = a; ctx.lineWidth = 4;
    if (rainbow && ctx.createConicGradient) { const cg = ctx.createConicGradient(now / 1500, 0, 0); for (let i = 0; i <= 6; i++) cg.addColorStop(i / 6, "hsl(" + i * 60 + " 95% 62%)"); ctx.strokeStyle = cg; ctx.shadowColor = "#fff"; }
    else { ctx.strokeStyle = "hsl(" + hue + " 95% 66%)"; ctx.shadowColor = "hsl(" + hue + " 95% 60%)"; }
    ctx.shadowBlur = 26; ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineWidth = 1.3; ctx.strokeStyle = "rgba(240,252,255,0.85)"; ctx.stroke();
    ctx.restore();
  }
  function glowDot(x, y, r, color, blur) { ctx.save(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore(); }
  function shapePath(shape, r, rot) {
    ctx.beginPath();
    if (shape === "star") { for (let i = 0; i < 10; i++) { const a = rot + (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); }
    else if (shape === "diamond") { ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 0.75, 0); ctx.lineTo(0, r * 1.2); ctx.lineTo(-r * 0.75, 0); ctx.closePath(); }
    else if (shape === "heart") { const s = r * 0.9; ctx.moveTo(0, s * 0.9); ctx.bezierCurveTo(-s * 1.6, -s * 0.2, -s * 0.6, -s * 1.3, 0, -s * 0.45); ctx.bezierCurveTo(s * 0.6, -s * 1.3, s * 1.6, -s * 0.2, 0, s * 0.9); }
    else if (shape === "leaf") { ctx.ellipse(0, 0, r * 1.3, r * 0.6, rot, 0, TAU); }
    else if (shape === "flame") { ctx.moveTo(0, -r * 1.5); ctx.quadraticCurveTo(r, -r * 0.2, r * 0.6, r * 0.6); ctx.quadraticCurveTo(0, r * 1.2, -r * 0.6, r * 0.6); ctx.quadraticCurveTo(-r, -r * 0.2, 0, -r * 1.5); }
    else ctx.arc(0, 0, r, 0, TAU);
  }
  function drawTrails(balls, lineAlpha, shape, now) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    if (lineAlpha > 0) for (const b of balls) {
      if (!b.path) continue;
      ctx.strokeStyle = "hsla(" + b.hue + ",95%,62%," + lineAlpha + ")"; ctx.lineWidth = 1.3; ctx.beginPath();
      let pen = false;
      for (const p of b.path) { if (isNaN(p.x)) { pen = false; continue; } if (pen) ctx.lineTo(X(p.x), X(p.y)); else { ctx.moveTo(X(p.x), X(p.y)); pen = true; } }
      if (b.state === "live" && pen) ctx.lineTo(X(b.x), X(b.y));
      ctx.stroke();
    }
    for (const b of balls) {
      const t = b.trail; if (!t || t.length < 2) continue;
      for (let k = 1; k < t.length; k++) {
        if (Math.hypot(t[k].x - t[k - 1].x, t[k].y - t[k - 1].y) > 40) continue; // portal jump
        const u = k / t.length; ctx.strokeStyle = "hsla(" + b.hue + ",100%,65%," + u * 0.9 + ")"; ctx.lineWidth = Math.max(1, X(E.BALL_R) * 1.6 * u);
        ctx.beginPath(); ctx.moveTo(X(t[k - 1].x), X(t[k - 1].y)); ctx.lineTo(X(t[k].x), X(t[k].y)); ctx.stroke();
      }
    }
    ctx.restore();
    for (const b of balls) if (b.state === "live") {
      const col = "hsl(" + b.hue + " 100% 72%)", r = Math.max(3, X(E.BALL_R) * 1.2);
      if (shape && shape !== "dot") { ctx.save(); ctx.translate(X(b.x), X(b.y)); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12; shapePath(shape, r * 1.4, now / 300 + b.hue); ctx.fill(); ctx.restore(); continue; }
      glowDot(X(b.x), X(b.y), r, col, 14);
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
      ctx.shadowColor = p.color; ctx.shadowBlur = 18; ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0); ctx.restore();
    }
  }
  function easeBack(t) { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  const ORB_COL = { 2: "#b9a6ff", 3: "#6fe6ff", 4: "#ffd25a", 5: "#ff4f9a", 6: "#3fe0c5" };
  function drawOrb(o, i, now, lit) {
    const r = Math.max(9, X(o.r)), pul = 1 + 0.08 * Math.sin(now / 200 + i * 2), m = o.m || 2, col = ORB_COL[m] || "#b9a6ff";
    ctx.save(); ctx.translate(X(o.x), X(o.y));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4); g.addColorStop(0, lit ? "rgba(120,255,190,0.45)" : col + "66"); g.addColorStop(1, col + "00");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = lit ? "#78ffbe" : col; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 16; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, r * pul, 0, TAU); ctx.stroke();
    ctx.rotate(-now / 900); ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r * pul + 5, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.rotate(now / 900);
    ctx.shadowBlur = 0; ctx.fillStyle = "#ffffff"; ctx.font = "700 " + Math.max(10, Math.round(r * 0.95)) + "px Unbounded, 'Arial Black', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("×" + m, 0, 1); ctx.restore();
  }
  function drawFocusMark(f, label) {
    ctx.save(); ctx.strokeStyle = "rgba(255,210,90,0.85)"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(X(f.x), X(f.y), 6, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(f.x) - 10, X(f.y)); ctx.lineTo(X(f.x) - 3, X(f.y)); ctx.moveTo(X(f.x) + 3, X(f.y)); ctx.lineTo(X(f.x) + 10, X(f.y));
    ctx.moveTo(X(f.x), X(f.y) - 10); ctx.lineTo(X(f.x), X(f.y) - 3); ctx.moveTo(X(f.x), X(f.y) + 3); ctx.lineTo(X(f.x), X(f.y) + 10); ctx.stroke();
    if (label) { ctx.fillStyle = "rgba(255,210,90,0.95)"; ctx.font = "600 11px Outfit, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText("FOYER", X(f.x) + 22, X(f.y)); }
    ctx.restore();
  }
  function drawLevel(now) {
    const L = G.L, salve = L.type === "salve", th = salve ? THEMES[L.theme] || THEMES.or : null;
    drawEllipse(L.rx, L.ry, G.hue, 1, th && th.hue < 0, now);
    const F = E.foci(L.rx, L.ry), showF = !L.hidden || G.revealed;
    // the free focus (the target sits on the other one); never drawn on hidden-foci levels
    if (showF) F.forEach((f) => { if (Math.abs(f.y - L.target.y) < 0.5 && Math.abs(f.x - L.target.x) < 0.5) return; if (!salve && L.orbs.some((o) => o.focus && Math.hypot(o.x - f.x, o.y - f.y) < 1)) return; drawFocusMark(f, true); });
    for (const h of L.holes || []) {
      ctx.save(); ctx.translate(X(h.x), X(h.y)); const r = X(h.r);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6); g.addColorStop(0, "#000"); g.addColorStop(0.6, "rgba(20,0,40,0.95)"); g.addColorStop(1, "rgba(120,60,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill();
      ctx.rotate(now / 500); ctx.strokeStyle = "rgba(170,110,255,0.8)"; ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, r * (0.55 + k * 0.22), k, k + 3.6); ctx.stroke(); }
      ctx.restore();
    }
    for (const P of L.portals || []) [[P.a, "#4fb6ff"], [P.b, "#ff9a3d"]].forEach(([q, col]) => {
      ctx.save(); ctx.translate(X(q.x), X(q.y)); const r = Math.max(9, X(P.r));
      ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.25, 0, 0, TAU); ctx.stroke();
      ctx.rotate(now / 300); ctx.lineWidth = 1.5; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, r * 0.6, k * 2.1, k * 2.1 + 1.2); ctx.stroke(); }
      ctx.restore();
    });
    for (const w of E.wallsAt(L, G.time)) {
      const col = w.bump ? "#ffe066" : w.slide ? "#ff8a3d" : "#ff4f9a", glow = w.bump ? "#ffd21a" : w.slide ? "#ff7a20" : "#ff2f7d";
      ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = col; ctx.shadowColor = glow; ctx.shadowBlur = 16; ctx.lineWidth = Math.max(4, X(E.WALL_W));
      ctx.beginPath(); ctx.moveTo(X(w.x1), X(w.y1)); ctx.lineTo(X(w.x2), X(w.y2)); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,240,240,0.9)"; ctx.lineWidth = 1.2; if (w.bump) ctx.setLineDash([4, 4]); ctx.stroke(); ctx.restore();
      if (w.rot) glowDot(X(w.rot.cx), X(w.rot.cy), 4, "#ffffff", 10);
    }
    for (const g of L.gems || []) {
      if (g.taken) continue;
      const bob = Math.sin(now / 300 + g.x) * 2, r = Math.max(6, X(g.r));
      ctx.save(); ctx.translate(X(g.x), X(g.y) + bob); ctx.rotate(now / 900);
      ctx.fillStyle = "#3fe0c5"; ctx.shadowColor = "#3fe0c5"; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    const t = L.target, pulse = 1 + 0.1 * Math.sin(now / 220), tr = Math.max(9, X(L.tr));
    ctx.save(); ctx.translate(X(t.x), X(t.y));
    const tg = ctx.createRadialGradient(0, 0, 0, 0, 0, tr * 2.6); tg.addColorStop(0, "rgba(255,210,90,0.35)"); tg.addColorStop(1, "rgba(255,210,90,0)");
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(0, 0, tr * 2.6, 0, TAU); ctx.fill();
    ctx.rotate(now / 700); ctx.setLineDash([5, 5]); ctx.strokeStyle = "#ffd25a"; ctx.lineWidth = 2; ctx.shadowColor = "#ffd25a"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(0, 0, tr * pulse + 4, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(0, 0, tr * 0.55, 0, TAU); ctx.stroke(); ctx.fillStyle = "#fff4cc"; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
    ctx.restore();
    const orbs = E.orbsAt(L, G.time), used = G.S ? G.S.balls.reduce((m, b) => m | (b.state === "split" ? 0 : b.used), 0) : 0;
    const pvUsed = G.phase === "aim" && G.preview ? G.preview.S.balls.reduce((m, b) => m | b.used, 0) : 0;
    orbs.forEach((o, i) => drawOrb(o, i, now, (pvUsed & (1 << i)) || (used & (1 << i))));
    if (G.ghost && G.phase === "aim") {
      ctx.save(); ctx.setLineDash([3, 6]); ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1.2; ctx.beginPath(); let pen = false;
      for (const p of G.ghost) { if (isNaN(p.x)) { pen = false; continue; } if (pen) ctx.lineTo(X(p.x), X(p.y)); else { ctx.moveTo(X(p.x), X(p.y)); pen = true; } }
      ctx.stroke(); ctx.restore();
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
          ctx.fillStyle = ctx.strokeStyle; ctx.font = "700 12px Unbounded, sans-serif"; ctx.textAlign = "center"; ctx.fillText(Math.ceil(G.timeLeft) + " s", X(st.x), X(st.y) - 26); ctx.restore();
        } else { ctx.strokeStyle = "rgba(255,255,255," + (0.25 + 0.2 * Math.sin(now / 250)) + ")"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(st.x), X(st.y), 15 + 3 * Math.sin(now / 250), 0, TAU); ctx.stroke(); }
      } else { ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(X(st.x), X(st.y), 3, 0, TAU); ctx.fill(); }
    } else if (G.phase === "aim") {
      const ok = G.locked || validSrc(G.src), c = G.locked ? "#78ffbe" : ok ? "#ffffff" : "#ff4766";
      glowDot(X(G.src.x), X(G.src.y), 7, c, 18);
      ctx.save(); ctx.strokeStyle = c; ctx.globalAlpha = G.locked ? 0.9 : 0.4;
      for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU + now / 2000; ctx.beginPath(); ctx.moveTo(X(G.src.x) + Math.cos(an) * 12, X(G.src.y) + Math.sin(an) * 12); ctx.lineTo(X(G.src.x) + Math.cos(an) * 26, X(G.src.y) + Math.sin(an) * 26); ctx.stroke(); }
      if (G.locked) { ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(G.src.x), X(G.src.y), 18 + 2 * Math.sin(now / 150), 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
    if (G.S) drawTrails(G.S.balls, salve ? 0.16 : 0.3, th ? th.shape : null, now);
    for (const f of L.fog || []) {
      const g = ctx.createRadialGradient(X(f.x), X(f.y), 0, X(f.x), X(f.y), X(f.r));
      g.addColorStop(0, "rgba(14,20,40,0.97)"); g.addColorStop(0.7, "rgba(14,20,40,0.9)"); g.addColorStop(1, "rgba(14,20,40,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(f.x), X(f.y), X(f.r), 0, TAU); ctx.fill();
      ctx.save(); ctx.globalAlpha = 0.25 + 0.1 * Math.sin(now / 700 + f.x); ctx.strokeStyle = "#9fb4d8"; ctx.setLineDash([2, 8]); ctx.beginPath(); ctx.arc(X(f.x), X(f.y), X(f.r) * 0.8, now / 3000, now / 3000 + 5); ctx.stroke(); ctx.restore();
    }
  }
  function drawAim(st, L, now) {
    if (!isFinite(aimInfo.x)) aimInfo = analyseAim();
    const a = aimInfo, good = a.kind === "orb", neutral = a.kind === "bump" || a.kind === "portal";
    const col = good ? "120,255,190" : neutral ? "255,224,102" : a.kind === "target" ? "255,210,90" : "255,90,110";
    ctx.save();
    const g = ctx.createLinearGradient(X(st.x), X(st.y), X(a.x), X(a.y)); g.addColorStop(0, "rgba(" + col + ",0.95)"); g.addColorStop(1, "rgba(" + col + ",0.35)");
    ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.setLineDash([2, 7]); ctx.lineCap = "round"; ctx.lineDashOffset = -now / 40;
    ctx.beginPath(); ctx.moveTo(X(st.x), X(st.y)); ctx.lineTo(X(a.x), X(a.y)); ctx.stroke(); ctx.setLineDash([]);
    if (good && G.preview && G.preview.S.splits) {
      // assisted aim: every predicted ball path until it reaches the fence
      ctx.setLineDash([2, 6]); ctx.lineDashOffset = -now / 40; ctx.lineWidth = 1.6;
      for (const b of G.preview.S.balls) {
        if (!b.gen) continue;
        ctx.strokeStyle = "rgba(120,255,190," + Math.max(0.18, 0.5 - b.gen * 0.08) + ")"; ctx.beginPath(); let pen = false;
        for (const p of b.path) { if (isNaN(p.x)) { pen = false; continue; } if (pen) ctx.lineTo(X(p.x), X(p.y)); else { ctx.moveTo(X(p.x), X(p.y)); pen = true; } }
        if (b.state === "live") ctx.lineTo(X(b.x), X(b.y));
        ctx.stroke();
      }
    } else if (!neutral && a.kind !== "target") {
      ctx.strokeStyle = "#ff4766"; ctx.lineWidth = 2.5; const k = 6;
      ctx.beginPath(); ctx.moveTo(X(a.x) - k, X(a.y) - k); ctx.lineTo(X(a.x) + k, X(a.y) + k); ctx.moveTo(X(a.x) + k, X(a.y) - k); ctx.lineTo(X(a.x) - k, X(a.y) + k); ctx.stroke();
    }
    ctx.restore();
  }
  function drawDemo(now) {
    drawEllipse(D.rx, D.ry, 192, 0.9, false, now);
    E.foci(D.rx, D.ry).forEach((f) => drawFocusMark(f, false));
    if (!demo.S) return;
    ctx.globalAlpha = Math.max(0, Math.min(1, (3.4 - demo.t) / 0.5)); drawTrails(demo.S.balls, 0, null, now); ctx.globalAlpha = 1;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { update(dt); } catch (err) { console.error(err); }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBG(now);
    ctx.save();
    ctx.translate(view.cx + (Math.random() - 0.5) * shake, view.cy + (Math.random() - 0.5) * shake);
    // level intro: the whole table (ellipse, foci, target, x2 points) scales in together, so nothing is ever out of place
    if (G.screen === "play" && G.fade < 1) { const k = 0.92 + 0.08 * (1 - Math.pow(1 - G.fade, 3)); ctx.scale(k, k); ctx.globalAlpha = Math.min(1, G.fade * 1.6); }
    try { if (G.screen === "menu") drawDemo(now); else if (G.L) drawLevel(now); ctx.globalAlpha = 1; drawFx(); } catch (err) { console.error(err); }
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = "rgba(255,245,220," + flash * 0.5 + ")"; ctx.fillRect(0, 0, W, H); }
    requestAnimationFrame(frame);
  }

  // ---------------- boot ----------------
  tickLives(); resize(); renderMenu(); showScreen("menu");
  requestAnimationFrame(frame);
  NET.on("ready", () => {
    const q = new URLSearchParams(location.search), id = q.get("defi");
    if (id) openDefiLink(id, parseInt(q.get("s"), 10) || 0);
    else maybeGift();
    if (G.screen === "menu") renderMenu();
  });
  NET.init();
  window.__ellipso = { G, E, Gen, fire, play, advance, retry, startDefi, prog, placeSrc, startDemo, predict };
})();
