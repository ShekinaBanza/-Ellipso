// Visual check of cascades, assisted aim and the demo mode. Run with the local server on :8790.
const { chromium } = require("playwright"); const path = require("path");
const OUT = process.env.OUT || "/tmp";
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/net::|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto("http://localhost:8790/"); await p.waitForTimeout(800);
  if (await p.isVisible("#gift")) await p.click("#bGift");
  await p.screenshot({ path: path.join(OUT, "c_menu.png") });
  // demo mode
  await p.click("#bDemo"); await p.waitForTimeout(1600);
  await p.screenshot({ path: path.join(OUT, "c_demo_aim.png") });
  const t0 = Date.now(); let shots = 0, best = 0;
  while (Date.now() - t0 < 16000) {
    await p.waitForTimeout(400);
    const st = await p.evaluate(() => { const G = window.__ellipso.G; return { ph: G.phase, live: G.S ? G.S.balls.filter((b) => b.state === "live").length : 0, hits: G.S ? G.S.hits : 0, n: G.n }; });
    if (st.ph === "fly" && st.live > best && shots < 3) { best = st.live; if (st.live > 20) { await p.screenshot({ path: path.join(OUT, "c_demo_split" + shots + ".png") }); shots++; } }
    if (st.ph === "fly" && st.hits > 15 && !p.__conv) { p.__conv = 1; await p.screenshot({ path: path.join(OUT, "c_demo_conv.png") }); }
    if (st.ph === "clear" && !p.__clear) { p.__clear = 1; await p.screenshot({ path: path.join(OUT, "c_demo_clear.png") }); console.log("démo niveau", st.n, ":", st.hits, "balles dans la cible"); }
  }
  console.log("max balles en jeu pendant la démo :", best);
  await p.click("#bExitDemo"); await p.waitForTimeout(400);
  // normal cascade level with the assisted aim
  await p.evaluate(() => { localStorage.setItem("ellipso.seen2", JSON.stringify(["orb","focus","cascade","need3","need4","gem","bump","fence2","rot","hole","hidden"])); });
  await p.reload(); await p.waitForTimeout(800); if (await p.isVisible("#gift")) await p.click("#bGift");
  let n = 2; let L = null;
  for (; n < 40; n++) { L = await p.evaluate((n) => window.__ellipso.Gen.get(n, window.__ellipso.G.demoSeed + 7).then((L) => ({ c: !!L.cascade, d: (L.mults || []).length })), n); if (L.c && L.d >= 3) break; }
  await p.evaluate((n) => { const E = window.__ellipso; E.G.demoSeed = E.G.demoSeed + 7; E.play(n); }, n);
  await p.waitForTimeout(1500); while (await p.isVisible("#news")) await p.click("#bNewsOk");
  const info = await p.evaluate(() => { const { G } = window.__ellipso; G.ang = G.L.bestAng + 0.004; return { mults: G.L.mults, need: G.L.need, s3: G.L.star3, cascade: G.L.cascade }; });
  await p.waitForTimeout(500);
  console.log("niveau cascade", n, JSON.stringify(info), "| aide :", await p.textContent("#hHelp"));
  await p.screenshot({ path: path.join(OUT, "c_aim_assist.png") });
  await p.click("#bFire"); await p.waitForTimeout(500);
  console.log("après visée aimantée :", await p.textContent("#toast").catch(() => ""));
  await p.waitForTimeout(1300); await p.screenshot({ path: path.join(OUT, "c_play_fly.png") });
  await p.waitForTimeout(4000); await p.screenshot({ path: path.join(OUT, "c_play_clear.png") });
  console.log("résultat :", JSON.stringify(await p.evaluate(() => ({ ph: window.__ellipso.G.phase, n: window.__ellipso.G.n, stars: window.__ellipso.G.stars }))));
  console.log("Erreurs JS :", errs.length ? errs : "aucune");
  await b.close();
})();
