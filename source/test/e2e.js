// End-to-end test: two players + the admin, against the fake Firebase. Run: node source/test/e2e.js (server on :8790 at repo root)
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const FAKE = fs.readFileSync(path.join(__dirname, "fake-firebase.js"), "utf8");
const OUT = process.env.OUT || "/tmp";
const BASE = "http://localhost:8790/";
const log = (...a) => console.log(...a);
const assert = (c, m) => { if (!c) { throw new Error("ÉCHEC : " + m); } log("  ok -", m); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block" });
  await ctx.addInitScript(FAKE);
  await ctx.route("**/firebase-config.js", (r) => r.fulfill({ contentType: "text/javascript", body: 'window.ELLIPSO_FIREBASE={apiKey:"fake",projectId:"demo"};' }));
  await ctx.route("**/vendor/*.js", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  const errs = [];
  const watch = (p, name) => { p.on("pageerror", (e) => errs.push(name + ": " + e.message)); p.on("console", (m) => { if (m.type() === "error" && !/fonts|ERR_|net::|Failed to load resource/.test(m.text())) errs.push(name + ": " + m.text()); }); };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png") });
  const closeModals = async (p) => { for (const id of ["news", "gift"]) while (await p.isVisible("#" + id)) { await p.click(id === "news" ? "#bNewsOk" : "#bGift"); await p.waitForTimeout(150); } };
  const winLevel = (p) => p.evaluate(() => { const { G, E } = window.__ellipso, L = G.L; if (L.type === "salve") { G.src = { x: L.other.x, y: L.other.y }; G.locked = true; document.getElementById("bSalvo").click(); return "salve"; } for (let k = 0; k < 2880; k++) { const a = (k / 2880) * E.TAU, S = E.simulate(L, a, G.time + 0.03, 1 / 240); if (!S.fail && S.hits >= L.need) { G.ang = a; window.__ellipso.fire(); return "tir"; } } return "none"; });
  const fallShot = (p) => p.evaluate(() => { const { G, E } = window.__ellipso, L = G.L; for (let k = 0; k < 720; k++) { const a = (k / 720) * E.TAU; const S = E.simulate(L, a, G.time + 0.03, 1 / 240); if (S.fail === "fall") { G.ang = a; window.__ellipso.fire(); return true; } } return false; });

  // ---------- player 1 ----------
  log("Joueur 1");
  const p1 = await ctx.newPage(); watch(p1, "J1");
  await p1.goto(BASE); await p1.waitForTimeout(1200);
  assert(await p1.isVisible("#gift"), "cadeau du jour affiché au premier lancement");
  await shot(p1, "e_gift"); await p1.click("#bGift"); await p1.waitForTimeout(300);
  const st1 = await p1.evaluate(() => ({ online: NET.st.online, uid: NET.st.uid, pts: window.__ellipso.G.points }));
  assert(st1.online && st1.uid, "joueur connecté au serveur (compte anonyme)");
  assert(st1.pts === 100, "cadeau : +100 points");
  await p1.evaluate(() => { localStorage.setItem("__fakeaccounts", JSON.stringify([{ email: "admin@ellipso.app", pass: "secret123", uid: "admin1" }])); window.__fakefb.save(Object.assign(window.__fakefb.load(), { "admins/admin1": {} })); });
  await shot(p1, "e_menu");
  // profile
  await p1.click("#bComm"); await p1.waitForTimeout(300);
  await p1.click('#comm .tabs button[data-t="prof"]'); await p1.waitForTimeout(200);
  await p1.fill("#pPseudo", "Shekina"); await p1.selectOption("#pCountry", "CD"); await p1.click("#profForm button[type=submit]"); await p1.waitForTimeout(300);
  const u1 = await p1.evaluate(() => window.__fakefb.load()["users/" + NET.st.uid]);
  assert(u1 && u1.pseudo === "Shekina" && u1.country === "CD", "profil enregistré sur le serveur");
  // chat
  await p1.click('#comm .tabs button[data-t="chat"]'); await p1.waitForTimeout(300);
  await p1.fill("#chatIn", "Bonjour à tous, qui est au niveau 20 ?"); await p1.click("#chatForm button"); await p1.waitForTimeout(500);
  assert((await p1.textContent("#chatList")).includes("Bonjour à tous"), "message de chat envoyé et affiché");
  await shot(p1, "e_chat");
  // challenge
  await p1.click('#comm .tabs button[data-t="defi"]'); await p1.waitForTimeout(200);
  await p1.click("#bNewDefi"); await p1.waitForTimeout(600);
  const defi = await p1.evaluate(() => JSON.parse(localStorage.getItem("ellipso.defis"))[0]);
  assert(defi && defi.id && defi.seed, "défi créé (" + defi.id + ")");
  await shot(p1, "e_defis");
  await p1.click("#bCommClose");
  // play: win level 1, then lose a life
  await p1.click("#bPlay"); await p1.waitForTimeout(500); await closeModals(p1);
  assert((await winLevel(p1)) === "tir", "tir gagnant trouvé au niveau 1");
  await p1.waitForTimeout(800); await shot(p1, "e_fly"); await p1.waitForTimeout(3600); await closeModals(p1);
  const n2 = await p1.evaluate(() => window.__ellipso.G.n);
  assert(n2 === 2, "niveau 1 réussi, passage au niveau 2");
  await p1.waitForTimeout(400); await closeModals(p1);
  assert(await fallShot(p1), "tir raté (chute) lancé");
  await p1.waitForTimeout(3500);
  assert(await p1.isVisible("#fail"), "carte d'échec affichée");
  const lives1 = await p1.evaluate(() => window.__ellipso.G.lives);
  assert(lives1 === 4, "une vie perdue (4/5)");
  assert((await p1.evaluate(() => window.__ellipso.G.n)) === 2, "le niveau ne passe pas après un échec");
  await shot(p1, "e_fail");

  // ---------- player 2 : challenge link ----------
  log("Joueur 2 (lien de défi)");
  const p2 = await ctx.newPage(); watch(p2, "J2");
  await p2.goto(BASE + "?defi=" + defi.id + "&s=" + defi.seed); await p2.waitForTimeout(1500);
  assert(await p2.isVisible("#defiCard"), "carte de défi affichée à l'ouverture du lien");
  const dct = await p2.textContent("#dcTitle"); log("    titre:", dct, JSON.stringify(await p2.evaluate((id) => window.__fakefb.load()["challenges/" + id], defi.id)));
  assert(dct.includes("Shekina"), "le défi indique qui a défié");
  await shot(p2, "e_defi_card");
  await p2.click("#bDefiGo"); await p2.waitForTimeout(600); await closeModals(p2);
  const sameSeed = await p2.evaluate((s) => window.__ellipso.G.defi.seed === s, defi.seed);
  assert(sameSeed, "le joueur 2 joue la même graine de niveaux");
  assert((await winLevel(p2)) !== "none", "joueur 2 réussit le niveau 1 du défi");
  await p2.waitForTimeout(4200); await closeModals(p2);
  for (let i = 0; i < 3; i++) {
    await closeModals(p2);
    await fallShot(p2); await p2.waitForTimeout(2600);
    if (i < 2 && (await p2.isVisible("#fail"))) { await p2.click("#bRetry"); await p2.waitForTimeout(400); }
  }
  await p2.waitForTimeout(800);
  assert(await p2.isVisible("#dover"), "fin du défi après 3 vies perdues");
  const res = await p2.evaluate(() => Object.entries(window.__fakefb.load()).filter(([k]) => k.includes("/results/")).map(([, v]) => v));
  assert(res.length === 1 && res[0].level === 2, "résultat du défi enregistré (niveau 2)");
  await p2.waitForTimeout(500); await shot(p2, "e_defi_over");

  // ---------- admin ----------
  log("Admin");
  const ad = await ctx.newPage(); watch(ad, "Admin");
  await ad.setViewportSize({ width: 1280, height: 900 });
  await ad.goto(BASE + "admin.html"); await ad.waitForTimeout(800);
  assert(await ad.isVisible("#login"), "formulaire de connexion admin");
  await ad.fill("#lMail", "admin@ellipso.app"); await ad.fill("#lPass", "secret123"); await ad.click("#loginForm button"); await ad.waitForTimeout(1500);
  assert(await ad.isVisible("#app"), "connexion admin réussie");
  const onlineN = +(await ad.textContent("#onlineN"));
  assert(onlineN >= 2, "joueurs en ligne visibles (" + onlineN + ")");
  await shot(ad, "e_admin_dash");
  await ad.click('#tabs button[data-t="users"]'); await ad.waitForTimeout(800);
  assert((await ad.textContent("#uBody")).includes("Shekina"), "liste des joueurs");
  await shot(ad, "e_admin_users");
  // mute player 1 from the users table
  const uid1 = await p1.evaluate(() => NET.st.uid);
  await ad.click('#uBody button[data-a="mute"][data-id="' + uid1 + '"]'); await ad.waitForTimeout(900);
  log("    doc:", JSON.stringify(await ad.evaluate(() => Object.entries(window.__fakefb.load()).filter(([k]) => k.startsWith("users/")).map(([k, v]) => [k, v.pseudo, v.muted]))), await p1.evaluate(() => [NET.st.uid, NET.st.muted]));
  assert(await p1.evaluate(() => NET.st.muted), "le joueur 1 est rendu muet en direct");
  // chat moderation
  await ad.click('#tabs button[data-t="chat"]'); await ad.waitForTimeout(400);
  assert((await ad.textContent("#msgs")).includes("Bonjour à tous"), "message visible dans la modération");
  await ad.click("#msgs [data-del]"); await ad.waitForTimeout(500);
  assert(!(await ad.textContent("#msgs")).includes("Bonjour à tous"), "message supprimé par l'admin");
  // house ad
  await ad.click('#tabs button[data-t="ads"]'); await ad.waitForTimeout(300);
  await ad.fill("#aTitle", "Boutique Shekina : -20 % ce week-end"); await ad.fill("#aUrl", "icons/icon-512.png"); await ad.fill("#aLink", "https://example.com");
  await ad.fill("#aSkip", "2");
  await ad.click("#aSave"); await ad.waitForTimeout(800);
  assert((await ad.textContent("#adList")).includes("Boutique Shekina"), "pub maison ajoutée");
  await shot(ad, "e_admin_ads");
  // settings: announcement + 6 lives
  await ad.click('#tabs button[data-t="settings"]'); await ad.waitForTimeout(300);
  await ad.fill("#sAnn", "Tournoi ce week-end : le top 10 gagne des cadeaux !"); await ad.fill("#sLives", "6");
  await ad.click("#gameCfg button[type=submit]"); await ad.waitForTimeout(700);
  await shot(ad, "e_admin_settings");

  // ---------- player 1 sees the admin changes ----------
  log("Effets côté joueur");
  const cfg1 = await p1.evaluate(() => NET.st.config);
  assert(cfg1.livesMax === 6 && cfg1.announcement.includes("Tournoi"), "réglages reçus en direct par le joueur");
  await p1.click("#bLifeAd"); await p1.waitForTimeout(700);
  assert(await p1.isVisible("#ad") && (await p1.textContent("#adTitle")).includes("Boutique"), "la pub maison s'affiche pour la vie offerte");
  await shot(p1, "e_houseAd");
  await p1.waitForTimeout(2600); await p1.click("#bAdClose"); await p1.waitForTimeout(300);
  assert((await p1.evaluate(() => window.__ellipso.G.lives)) === 5, "vie récupérée après la pub (5)");
  const imp = await p1.evaluate(() => Object.entries(window.__fakefb.load()).find(([k]) => k.startsWith("ads/"))[1].impressions);
  assert(imp >= 1, "vue de la pub comptée (" + imp + ")");
  await p1.click("#bFailMenu"); await p1.waitForTimeout(500);
  assert((await p1.textContent("#mAnnounce")).includes("Tournoi"), "annonce affichée dans le menu");
  await shot(p1, "e_menu_after");
  // leaderboard
  await p1.click("#bComm"); await p1.waitForTimeout(600);
  assert((await p1.textContent("#board")).includes("Shekina"), "classement mondial");
  await shot(p1, "e_rank");
  await p1.click("#bCommClose");

  // ---------- offline mode (no server configured) ----------
  log("Mode hors ligne");
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p3 = await ctx2.newPage(); watch(p3, "Hors-ligne");
  await p3.goto(BASE); await p3.waitForTimeout(1000); await closeModals(p3);
  assert(!(await p3.evaluate(() => NET.st.enabled)), "sans configuration, le jeu tourne hors ligne");
  await p3.click("#bPlay"); await p3.waitForTimeout(500); await closeModals(p3);
  assert((await winLevel(p3)) === "tir", "partie jouable hors ligne");
  // bonus level + theme
  await p3.evaluate(() => { window.__ellipso.G.n = 4; window.__ellipso.advance(true); });
  await p3.waitForTimeout(1200); await closeModals(p3);
  const th = await p3.evaluate(() => window.__ellipso.G.L.theme);
  assert(!!th, "niveau bonus avec thème : " + th);
  const lock = await p3.evaluate(() => { const { G, placeSrc } = window.__ellipso, f = G.L.other; if (G.L.hidden) return "hidden"; placeSrc({ x: f.x + 6, y: f.y - 5 }); return G.locked && G.src.x === f.x && G.src.y === f.y; });
  assert(lock === true || lock === "hidden", "aimant : la source se cale pile sur le foyer (" + lock + ")");
  await shot(p3, "e_bonus_aim");
  await p3.click("#bSalvo"); await p3.waitForTimeout(900); await shot(p3, "e_bonus_fly");

  log("\nErreurs JS :", errs.length ? errs : "aucune");
  await b.close();
  if (errs.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
