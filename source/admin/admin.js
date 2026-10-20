(function () {
  "use strict";
  const C = CORE, $ = C.$, esc = C.esc, fmt = C.fmt, toast = C.toast;
  const FB = window.ELLIPSO_FIREBASE || {};
  if (!FB.apiKey || !window.firebase) { $("setup").hidden = false; return; }
  // a separate app instance keeps the admin login apart from the anonymous player session of the game
  const app = firebase.initializeApp(FB, "admin");
  const auth = app.auth(), db = app.firestore(), FV = firebase.firestore.FieldValue, TS = firebase.firestore.Timestamp;
  const ONLINE_MS = 150000;
  const ms = (t) => (t && t.toMillis ? t.toMillis() : t || 0);
  const isOnline = (u) => !!u.online && Date.now() - ms(u.lastSeen) < ONLINE_MS;
  const av = (u) => '<span class="av" style="background:' + C.AVATARS[u.avatar || 0] + '">' + esc((u.pseudo || "?").slice(0, 1).toUpperCase()) + "</span>";
  const unsubs = [];

  auth.onAuthStateChanged(async (u) => {
    unsubs.splice(0).forEach((f) => f());
    ["login", "notAdmin", "app"].forEach((id) => ($(id).hidden = true));
    $("who").hidden = !u;
    if (!u) { $("login").hidden = false; return; }
    $("whoMail").textContent = u.email || "";
    let ok = false;
    try { ok = (await db.collection("admins").doc(u.uid).get()).exists; } catch (e) { ok = false; }
    if (!ok) { $("naUid").textContent = u.uid; $("notAdmin").hidden = false; return; }
    $("app").hidden = false;
    start();
  });
  $("loginForm").onsubmit = async (e) => {
    e.preventDefault(); $("lErr").textContent = "";
    try { await auth.signInWithEmailAndPassword($("lMail").value.trim(), $("lPass").value); }
    catch (err) { $("lErr").textContent = /password|credential|user-not-found/i.test(err.code || err.message) ? "E-mail ou mot de passe incorrect." : "Connexion impossible : " + (err.message || err); }
  };
  $("bOut").onclick = () => auth.signOut();

  // ---------- tabs ----------
  let tab = "dash";
  document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => {
    tab = b.dataset.t;
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll(".page").forEach((p) => (p.hidden = p.dataset.p !== tab));
    if (tab === "users") loadUsers(true);
    if (tab === "defis") loadDefis();
  }));

  function start() {
    // live: online players
    unsubs.push(db.collection("users").where("lastSeen", ">", TS.fromMillis(Date.now() - ONLINE_MS)).onSnapshot((q) => {
      const on = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter(isOnline).sort((a, b) => (b.level || 0) - (a.level || 0));
      $("onlineN").textContent = on.length; kpi.online = on.length; renderKpis();
      $("onlineList").innerHTML = on.length ? on.slice(0, 40).map((u) => "<li>" + av(u) + "<b>" + esc(u.pseudo) + "</b> " + C.flag(u.country) + "<small>niveau " + (u.level || 1) + " · " + esc(u.platform || "") + "</small></li>").join("") : '<li class="muted">Personne pour l\'instant.</li>';
    }, (e) => console.warn(e)));
    setInterval(() => { if (tab === "dash") loadDash(); }, 60000);
    loadDash();
    unsubs.push(db.collection("config").doc("app").onSnapshot((s) => fillConfig(s.exists ? s.data() : {})));
    unsubs.push(db.collection("chat").orderBy("at", "desc").limit(100).onSnapshot(renderChat, (e) => console.warn(e)));
    unsubs.push(db.collection("reports").orderBy("at", "desc").limit(100).onSnapshot(renderReports, (e) => console.warn(e)));
    unsubs.push(db.collection("ads").onSnapshot(renderAds, (e) => console.warn(e)));
  }

  // ---------- dashboard ----------
  const kpi = { online: 0 };
  function renderKpis() {
    const t = kpi.today || {}, g = kpi.global || {};
    const cards = [
      ["Joueurs en ligne", kpi.online, "en direct", "live"], ["Joueurs inscrits", g.users || 0, "depuis le début"],
      ["Nouveaux aujourd'hui", t.newUsers || 0, ""], ["Sessions aujourd'hui", t.sessions || 0, ""],
      ["Niveaux réussis", t.levels || 0, "aujourd'hui"], ["Échecs", t.fails || 0, "aujourd'hui"],
      ["Pubs maison vues", t.adsOwn || 0, (t.adClicks || 0) + " clics aujourd'hui"], ["Pubs Google", t.adsGoogle || 0, "aujourd'hui"],
      ["Messages chat", t.messages || 0, "aujourd'hui"], ["Défis créés", t.challenges || 0, "aujourd'hui"],
    ];
    $("kpis").innerHTML = cards.map(([l, v, s, k]) => '<div class="kpi ' + (k || "") + '"><span>' + l + "</span><b>" + fmt(v) + "</b><small>" + s + "</small></div>").join("");
  }
  async function loadDash() {
    const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5); days.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")); }
    try {
      const snaps = await Promise.all(days.map((d) => db.collection("stats").doc(d).get()));
      const rows = snaps.map((s, i) => Object.assign({ day: days[i] }, s.exists ? s.data() : {}));
      kpi.today = rows[rows.length - 1];
      const g = await db.collection("stats").doc("global").get(); kpi.global = g.exists ? g.data() : {};
      renderKpis(); renderChart(rows);
      const us = await db.collection("users").orderBy("lastSeen", "desc").limit(500).get();
      const all = us.docs.map((d) => d.data());
      bars("countries", count(all, (u) => C.flag(u.country) + " " + C.countryName(u.country)));
      bars("devices", count(all, (u) => (u.platform || "?") + (u.installed ? " (installé)" : "")));
    } catch (e) { console.warn(e); toast("Statistiques indisponibles : vérifie les règles Firestore."); }
  }
  function count(list, key) { const m = {}; list.forEach((x) => { const k = key(x); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8); }
  function bars(id, entries) {
    const max = Math.max(1, ...entries.map((e) => e[1]));
    $(id).innerHTML = entries.length ? entries.map(([k, v]) => "<li><span>" + esc(k) + '</span><span class="track"><i style="width:' + ((v / max) * 100).toFixed(1) + '%"></i></span><b>' + v + "</b></li>").join("") : '<li class="muted">Pas encore de données.</li>';
  }
  function renderChart(rows) {
    const W = 560, H = 190, pad = 22, bw = (W - pad * 2) / rows.length;
    const max = Math.max(4, ...rows.map((r) => Math.max(r.levels || 0, r.newUsers || 0)));
    const y = (v) => H - pad - (v / max) * (H - pad * 2);
    let s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Activité sur 14 jours">';
    [0, 0.5, 1].forEach((k) => { const v = Math.round(max * k); s += '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#22325c" stroke-width="1"/><text x="2" y="' + (y(v) + 3) + '">' + v + "</text>"; });
    rows.forEach((r, i) => {
      const x = pad + i * bw, w = bw * 0.36;
      s += '<rect x="' + (x + bw * 0.12) + '" y="' + y(r.levels || 0) + '" width="' + w + '" height="' + (H - pad - y(r.levels || 0)) + '" rx="2" fill="#6fe6ff"><title>' + r.day + " : " + (r.levels || 0) + " niveaux</title></rect>";
      s += '<rect x="' + (x + bw * 0.52) + '" y="' + y(r.newUsers || 0) + '" width="' + w + '" height="' + (H - pad - y(r.newUsers || 0)) + '" rx="2" fill="#ffd25a"><title>' + r.day + " : " + (r.newUsers || 0) + " nouveaux</title></rect>";
      if (i % 2 === 0) s += '<text x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + r.day.slice(8) + "/" + r.day.slice(5, 7) + "</text>";
    });
    $("chart").innerHTML = s + "</svg>";
  }

  // ---------- players ----------
  let users = [], lastDoc = null;
  async function loadUsers(reset) {
    if (reset) { users = []; lastDoc = null; }
    let q = db.collection("users").orderBy("lastSeen", "desc").limit(100);
    if (lastDoc) q = q.startAfter(lastDoc);
    try {
      const s = await q.get();
      if (s.docs.length) lastDoc = s.docs[s.docs.length - 1];
      users = users.concat(s.docs.map((d) => Object.assign({ id: d.id }, d.data())));
      $("uMore").hidden = s.docs.length < 100;
      renderUsers();
    } catch (e) { console.warn(e); toast("Impossible de charger les joueurs."); }
  }
  function renderUsers() {
    const term = $("uSearch").value.trim().toLowerCase(), f = $("uFilter").value;
    const list = users.filter((u) => (!term || (u.pseudo || "").toLowerCase().includes(term)) && (f === "all" || (f === "online" && isOnline(u)) || (f === "banned" && u.banned) || (f === "muted" && u.muted)));
    $("uBody").innerHTML = list.length ? list.map((u) => '<tr class="' + (u.banned ? "banned" : "") + '"><td><span class="dot ' + (isOnline(u) ? "on" : "") + '" title="' + (isOnline(u) ? "En ligne" : "Hors ligne") + '"></span></td>' +
      "<td>" + av(u) + " <b>" + esc(u.pseudo) + "</b>" + (u.banned ? '<span class="tag red">suspendu</span>' : "") + (u.muted ? '<span class="tag gold">muet</span>' : "") + "</td>" +
      "<td>" + C.flag(u.country) + " " + esc(C.countryName(u.country)) + "</td><td>" + (u.level || 1) + "</td><td>" + (u.bestLevel || 1) + "</td><td>" + fmt(u.points) + "</td>" +
      "<td>" + esc(u.platform || "?") + (u.installed ? " · app" : "") + "</td><td>" + C.ago(ms(u.lastSeen)) + "</td>" +
      '<td class="acts"><button class="btn" data-a="mute" data-id="' + u.id + '">' + (u.muted ? "Rendre la parole" : "Rendre muet") + '</button><button class="btn danger" data-a="ban" data-id="' + u.id + '">' + (u.banned ? "Réactiver" : "Suspendre") + "</button></td></tr>").join("")
      : '<tr><td colspan="9" class="muted">Aucun joueur.</td></tr>';
    $("uBody").querySelectorAll("button").forEach((b) => (b.onclick = async () => {
      const u = users.find((x) => x.id === b.dataset.id); if (!u) return;
      const k = b.dataset.a === "ban" ? "banned" : "muted", v = !u[k];
      try { await db.collection("users").doc(u.id).update({ [k]: v }); u[k] = v; renderUsers(); toast(k === "banned" ? (v ? u.pseudo + " est suspendu" : u.pseudo + " est réactivé") : (v ? u.pseudo + " ne peut plus écrire" : u.pseudo + " peut écrire")); }
      catch (e) { toast("Action refusée : " + (e.message || e)); }
    }));
  }
  $("uSearch").oninput = renderUsers; $("uFilter").onchange = renderUsers; $("uMore").onclick = () => loadUsers(false);
  async function setMuted(uid, v) { try { await db.collection("users").doc(uid).update({ muted: v }); toast(v ? "Joueur rendu muet" : "Parole rendue"); } catch (e) { toast("Action refusée"); } }

  // ---------- chat & reports ----------
  function renderChat(q) {
    const list = q.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    $("msgs").innerHTML = list.length ? list.map((m) => "<li>" + av(m) + '<div><div class="meta"><b>' + esc(m.pseudo) + "</b> " + C.flag(m.country) + " · " + C.ago(ms(m.at)) + '</div><div class="txt">' + esc(m.text) + '</div></div><div class="acts"><button class="btn" data-mute="' + esc(m.uid) + '">Muet</button><button class="btn danger" data-del="' + m.id + '">Supprimer</button></div></li>').join("") : '<li class="muted">Aucun message.</li>';
    $("msgs").querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => db.collection("chat").doc(b.dataset.del).delete().then(() => toast("Message supprimé")).catch(() => toast("Suppression refusée"))));
    $("msgs").querySelectorAll("[data-mute]").forEach((b) => (b.onclick = () => setMuted(b.dataset.mute, true)));
  }
  function renderReports(q) {
    const list = q.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    $("repCount").hidden = !list.length; $("repCount").textContent = list.length;
    $("reports").innerHTML = list.length ? list.map((r) => '<li><span class="av" style="background:#ff4766">!</span><div><div class="meta"><b>' + esc(r.reportedPseudo || "?") + "</b> · signalé " + C.ago(ms(r.at)) + '</div><div class="txt">' + esc(r.text) + '</div></div><div class="acts"><button class="btn danger" data-del="' + r.id + '" data-msg="' + esc(r.msgId) + '">Supprimer le message</button><button class="btn" data-mute="' + esc(r.reportedUid) + '">Muet</button><button class="btn ghost" data-ok="' + r.id + '">Ignorer</button></div></li>').join("") : '<li class="muted">Aucun signalement.</li>';
    $("reports").querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { await db.collection("chat").doc(b.dataset.msg).delete().catch(() => {}); await db.collection("reports").doc(b.dataset.del).delete().catch(() => {}); toast("Message supprimé"); }));
    $("reports").querySelectorAll("[data-ok]").forEach((b) => (b.onclick = () => db.collection("reports").doc(b.dataset.ok).delete()));
    $("reports").querySelectorAll("[data-mute]").forEach((b) => (b.onclick = () => setMuted(b.dataset.mute, true)));
  }
  $("chatOn").onchange = () => saveCfg({ chatEnabled: $("chatOn").checked });

  // ---------- config ----------
  let cfg = {};
  function fillConfig(c) {
    cfg = Object.assign({}, NET_DEFAULTS, c);
    $("chatOn").checked = cfg.chatEnabled !== false; $("sChat").checked = cfg.chatEnabled !== false;
    $("sAnn").value = cfg.announcement || ""; $("sLives").value = cfg.livesMax; $("sRegen").value = cfg.lifeRegenMin;
    $("sSkipB").value = cfg.skipCostBase; $("sSkipN").value = cfg.skipCostPerLevel; $("sGift").checked = cfg.dailyGift !== false;
    $("cEvery").value = cfg.interstitialEvery; $("cShare").value = Math.round((cfg.ownAdsShare == null ? 0.6 : cfg.ownAdsShare) * 100);
    $("cReward").checked = cfg.rewardedEnabled !== false; $("cGoogle").checked = cfg.useGoogle !== false;
    $("cClient").value = cfg.adClient || ""; $("cSlot").value = cfg.bannerSlot || ""; $("cTest").checked = cfg.adTest !== false;
  }
  const NET_DEFAULTS = { livesMax: 5, lifeRegenMin: 15, skipCostBase: 150, skipCostPerLevel: 15, dailyGift: true, interstitialEvery: 4, ownAdsShare: 0.6, rewardedEnabled: true, useGoogle: true, adClient: "", bannerSlot: "", adTest: true, chatEnabled: true, announcement: "" };
  async function saveCfg(p) { try { await db.collection("config").doc("app").set(p, { merge: true }); toast("Réglages enregistrés : les joueurs les reçoivent tout de suite."); } catch (e) { toast("Enregistrement refusé : " + (e.message || e)); } }
  const num = (id, lo, hi, d) => { const v = parseFloat($(id).value); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
  $("gameCfg").onsubmit = (e) => { e.preventDefault(); saveCfg({ announcement: $("sAnn").value.trim().slice(0, 140), livesMax: Math.round(num("sLives", 1, 20, 5)), lifeRegenMin: num("sRegen", 1, 240, 15), skipCostBase: Math.round(num("sSkipB", 0, 1e6, 150)), skipCostPerLevel: Math.round(num("sSkipN", 0, 1e5, 15)), dailyGift: $("sGift").checked, chatEnabled: $("sChat").checked }); };
  $("adCfg").onsubmit = (e) => {
    e.preventDefault();
    const client = $("cClient").value.trim();
    if (client && !/^ca-pub-\d{10,20}$/.test(client)) { toast("L'identifiant AdSense doit ressembler à ca-pub-1234567890123456"); return; }
    saveCfg({ interstitialEvery: Math.round(num("cEvery", 1, 20, 4)), ownAdsShare: num("cShare", 0, 100, 60) / 100, rewardedEnabled: $("cReward").checked, useGoogle: $("cGoogle").checked, adClient: client, bannerSlot: $("cSlot").value.trim(), adTest: $("cTest").checked });
  };

  // ---------- ads ----------
  let ads = [], editing = null;
  function renderAds(q) {
    ads = q.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    $("adList").innerHTML = ads.length ? ads.map((a) => {
      const imp = a.impressions || 0, clk = a.clicks || 0, ctr = imp ? ((clk / imp) * 100).toFixed(1) : "0";
      const media = a.type === "video" ? '<video src="' + esc(a.url) + '" muted playsinline preload="metadata"></video>' : '<img src="' + esc(a.url) + '" alt="">';
      return '<div class="adcard ' + (a.active === false ? "off" : "") + '"><div class="media">' + media + '</div><div class="info"><b>' + esc(a.title || "Sans titre") + "</b><small class=\"muted\">" + esc((a.placements || []).map((p) => ({ interstitial: "entre niveaux", reward: "récompensée", banner: "bannière" })[p]).join(" · ")) + "</small>" +
        '<div class="stats"><span><b>' + fmt(imp) + "</b> vues</span><span><b>" + fmt(clk) + "</b> clics</span><span><b>" + ctr + ' %</b> taux</span></div><div class="acts"><button class="btn" data-ed="' + a.id + '">Modifier</button><button class="btn" data-tg="' + a.id + '">' + (a.active === false ? "Activer" : "Mettre en pause") + '</button><button class="btn danger" data-rm="' + a.id + '">Supprimer</button></div></div></div>';
    }).join("") : '<p class="muted">Aucune pub pour l\'instant. Ajoute ta première pub avec le formulaire.</p>';
    $("adList").querySelectorAll("[data-tg]").forEach((b) => (b.onclick = () => { const a = ads.find((x) => x.id === b.dataset.tg); db.collection("ads").doc(a.id).update({ active: a.active === false }); }));
    $("adList").querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { if (b.dataset.sure) db.collection("ads").doc(b.dataset.rm).delete().then(() => toast("Pub supprimée")); else { b.dataset.sure = "1"; b.textContent = "Confirmer"; } }));
    $("adList").querySelectorAll("[data-ed]").forEach((b) => (b.onclick = () => editAd(ads.find((x) => x.id === b.dataset.ed))));
  }
  function editAd(a) {
    editing = a || null;
    $("adFormTitle").textContent = a ? "Modifier la publicité" : "Nouvelle publicité"; $("aCancel").hidden = !a;
    $("aTitle").value = a ? a.title || "" : ""; $("aType").value = a ? a.type || "image" : "image"; $("aUrl").value = a ? a.url || "" : ""; $("aLink").value = a ? a.link || "" : "";
    $("aSkip").value = a ? a.skipAfter || 5 : 5; $("aWeight").value = a ? a.weight || 1 : 1; $("aActive").checked = a ? a.active !== false : true; $("aFile").value = "";
    document.querySelectorAll(".aPl").forEach((c) => (c.checked = a ? (a.placements || []).includes(c.value) : c.value !== "banner"));
    preview(); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $("aCancel").onclick = () => editAd(null);
  function preview() {
    const url = $("aUrl").value.trim(), f = $("aFile").files[0], src = f ? URL.createObjectURL(f) : url;
    const vid = f ? /^video/.test(f.type) : $("aType").value === "video";
    $("aPreview").innerHTML = src ? (vid ? '<video controls playsinline></video>' : '<img alt="Aperçu">') : "";
    const el = $("aPreview").firstChild; if (el) el.src = src;
  }
  ["aUrl", "aType"].forEach((id) => ($(id).oninput = preview));
  $("aFile").onchange = () => { const f = $("aFile").files[0]; if (f) $("aType").value = /^video/.test(f.type) ? "video" : "image"; preview(); };
  async function upload(file) {
    if (!firebase.storage) throw new Error("Firebase Storage n'est pas chargé.");
    const ref = app.storage().ref("ads/" + Date.now() + "_" + file.name.replace(/[^\w.-]+/g, "_"));
    const snap = await ref.put(file, { contentType: file.type });
    return snap.ref.getDownloadURL();
  }
  $("adForm").onsubmit = async (e) => {
    e.preventDefault(); $("aErr").textContent = "";
    const btn = $("aSave"); btn.disabled = true; btn.textContent = "Enregistrement…";
    try {
      let url = $("aUrl").value.trim(); const f = $("aFile").files[0];
      if (f) { if (f.size > 20 * 1024 * 1024) throw new Error("Fichier trop lourd (20 Mo maximum)."); url = await upload(f); }
      if (!url) throw new Error("Ajoute une adresse de fichier ou envoie un fichier.");
      const placements = [...document.querySelectorAll(".aPl")].filter((c) => c.checked).map((c) => c.value);
      if (!placements.length) throw new Error("Choisis au moins un emplacement.");
      const link = $("aLink").value.trim();
      if (link && !/^https?:\/\//.test(link)) throw new Error("Le lien doit commencer par https://");
      const data = { title: $("aTitle").value.trim().slice(0, 80), type: $("aType").value, url, link, placements, skipAfter: Math.round(num("aSkip", 2, 30, 5)), weight: Math.round(num("aWeight", 1, 10, 1)), active: $("aActive").checked };
      if (editing) await db.collection("ads").doc(editing.id).update(data);
      else await db.collection("ads").add(Object.assign(data, { impressions: 0, clicks: 0, createdAt: FV.serverTimestamp() }));
      toast(editing ? "Pub modifiée" : "Pub ajoutée : elle apparaît déjà dans le jeu"); editAd(null);
    } catch (err) {
      $("aErr").textContent = /storage|bucket|unauthorized|billing/i.test(String(err.message || err)) ? "Envoi impossible (Firebase Storage n'est pas activé). Mets le fichier dans le dossier ads/ du dépôt et écris son adresse." : err.message || String(err);
    } finally { btn.disabled = false; btn.textContent = "Enregistrer la pub"; }
  };

  // ---------- challenges ----------
  async function loadDefis() {
    try {
      const q = await db.collection("challenges").orderBy("createdAt", "desc").limit(60).get();
      const list = q.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      $("dBody").innerHTML = list.length ? list.map((d) => "<tr><td><b>" + esc(d.id.slice(0, 6).toUpperCase()) + "</b></td><td>" + esc(d.byPseudo || "?") + " " + C.flag(d.byCountry) + "</td><td>" + (d.plays || 0) + "</td><td>" + C.ago(ms(d.createdAt)) + '</td><td><button class="btn danger" data-rm="' + d.id + '">Supprimer</button></td></tr>').join("") : '<tr><td colspan="5" class="muted">Aucun défi.</td></tr>';
      $("dBody").querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => db.collection("challenges").doc(b.dataset.rm).delete().then(loadDefis)));
    } catch (e) { console.warn(e); }
  }
})();
