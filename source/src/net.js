// ===== Ellipso online layer: Firebase (anonymous players) with a local fallback =====
var NET = (function () {
  "use strict";
  const C = CORE, store = C.store;
  const FB = window.ELLIPSO_FIREBASE || {};
  const DEFAULTS = {
    livesMax: 5, lifeRegenMin: 15, skipCostBase: 150, skipCostPerLevel: 15, dailyGift: true,
    interstitialEvery: 4, ownAdsShare: 0.6, rewardedEnabled: true,
    useGoogle: true, adClient: "", bannerSlot: "", adTest: true,
    chatEnabled: true, announcement: "",
  };
  const st = {
    enabled: !!FB.apiKey, online: false, uid: null, banned: false, muted: false,
    config: Object.assign({}, DEFAULTS, store.get("cfg", {})), ads: store.get("ads", []),
    profile: store.get("profile", null),
  };
  const subs = {};
  const on = (ev, cb) => { (subs[ev] = subs[ev] || []).push(cb); };
  const emit = (ev, v) => (subs[ev] || []).forEach((cb) => { try { cb(v); } catch (e) { console.error(e); } });
  let db = null, auth = null, FV = null, TS = null;

  if (!st.profile) {
    st.profile = { pseudo: "Joueur" + Math.floor(1000 + Math.random() * 9000), country: C.guessCountry(), avatar: Math.floor(Math.random() * 8), custom: false };
    store.set("profile", st.profile);
  }

  function loadScript(src) {
    return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  }
  async function loadSdk() {
    if (window.firebase && window.firebase.firestore) return;
    const v = "vendor/";
    for (const f of ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"]) await loadScript(v + f);
  }

  async function init() {
    if (!st.enabled) { emit("ready", st); return; }
    try {
      await loadSdk();
      const app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(FB);
      auth = app.auth(); db = app.firestore();
      FV = firebase.firestore.FieldValue; TS = firebase.firestore.Timestamp;
      auth.onAuthStateChanged(async (u) => {
        if (!u) { try { await auth.signInAnonymously(); } catch (e) { console.warn("auth", e); emit("ready", st); } return; }
        st.uid = u.uid; st.online = true;
        try { await ensureUser(); } catch (e) { console.warn("user", e); }
        listenConfig(); listenAds(); presence();
        emit("ready", st);
      });
    } catch (e) { console.warn("Firebase indisponible, mode local", e); st.enabled = false; emit("ready", st); }
  }

  // ---------- profile / progress ----------
  let progress = Object.assign({ level: 1, bestLevel: 1, points: 0, cleared: 0, fails: 0 }, store.get("progress", {}));
  async function ensureUser() {
    const ref = db.collection("users").doc(st.uid), snap = await ref.get();
    const base = { pseudo: st.profile.pseudo, country: st.profile.country, avatar: st.profile.avatar, platform: C.platform(), installed: C.installed(), lastSeen: FV.serverTimestamp(), online: true, lang: navigator.language || "" };
    if (!snap.exists) {
      await ref.set(Object.assign(base, { level: progress.level, bestLevel: progress.bestLevel, points: progress.points, cleared: progress.cleared, fails: progress.fails, banned: false, muted: false, createdAt: FV.serverTimestamp() }));
      stat("newUsers"); statGlobal("users");
    } else {
      const d = snap.data();
      st.banned = !!d.banned; st.muted = !!d.muted;
      if (st.profile.custom === false && d.pseudo) { st.profile = { pseudo: d.pseudo, country: d.country, avatar: d.avatar || 0, custom: true }; store.set("profile", st.profile); emit("profile", st.profile); }
      await ref.update(base);
    }
    ref.onSnapshot((s) => { if (!s.exists) return; const d = s.data(); const b = !!d.banned, m = !!d.muted; if (b !== st.banned || m !== st.muted) { st.banned = b; st.muted = m; emit("status", st); } });
    stat("sessions");
  }
  let presTimer = 0;
  function presence() {
    const beat = () => { if (!document.hidden && st.uid) db.collection("users").doc(st.uid).update({ lastSeen: FV.serverTimestamp(), online: true }).catch(() => {}); };
    clearInterval(presTimer); presTimer = setInterval(beat, 60000);
    document.addEventListener("visibilitychange", () => {
      if (!st.uid) return;
      if (document.hidden) db.collection("users").doc(st.uid).update({ online: false }).catch(() => {}); else beat();
    });
  }
  let saveT = 0, pending = {};
  function saveProgress(p) {
    progress = Object.assign(progress, p); store.set("progress", progress);
    if (!st.online) return;
    Object.assign(pending, p);
    clearTimeout(saveT);
    saveT = setTimeout(() => { const d = pending; pending = {}; db.collection("users").doc(st.uid).update(d).catch((e) => console.warn("save", e)); }, 1500);
  }
  function levelCleared(pts) {
    if (!st.online) return;
    stat("levels");
    const wk = C.isoWeek(new Date());
    db.collection("weeks").doc(wk).collection("scores").doc(st.uid).set({ pseudo: st.profile.pseudo, country: st.profile.country, avatar: st.profile.avatar, points: FV.increment(pts), cleared: FV.increment(1), at: FV.serverTimestamp() }, { merge: true }).catch(() => {});
  }
  async function updateProfile(p) {
    st.profile = Object.assign({}, st.profile, p, { custom: true }); store.set("profile", st.profile);
    emit("profile", st.profile);
    if (st.online) await db.collection("users").doc(st.uid).update({ pseudo: st.profile.pseudo, country: st.profile.country, avatar: st.profile.avatar });
  }

  // ---------- stats (batched increments) ----------
  let statBuf = {}, statT = 0, globalBuf = {};
  function stat(k, n) {
    if (!st.online) return;
    statBuf[k] = (statBuf[k] || 0) + (n || 1);
    clearTimeout(statT); statT = setTimeout(flushStats, 8000);
  }
  function statGlobal(k) { globalBuf[k] = (globalBuf[k] || 0) + 1; clearTimeout(statT); statT = setTimeout(flushStats, 3000); }
  function flushStats() {
    if (!st.online) return;
    const inc = (b) => { const o = {}; for (const k in b) o[k] = FV.increment(Math.min(50, b[k])); return o; };
    if (Object.keys(statBuf).length) db.collection("stats").doc(C.today()).set(inc(statBuf), { merge: true }).catch(() => {});
    if (Object.keys(globalBuf).length) db.collection("stats").doc("global").set(inc(globalBuf), { merge: true }).catch(() => {});
    statBuf = {}; globalBuf = {};
  }
  window.addEventListener("pagehide", flushStats);

  // ---------- remote config & ads ----------
  function listenConfig() {
    db.collection("config").doc("app").onSnapshot((s) => {
      const d = s.exists ? s.data() : {};
      st.config = Object.assign({}, DEFAULTS, d); store.set("cfg", d); emit("config", st.config);
    }, () => {});
  }
  function listenAds() {
    db.collection("ads").where("active", "==", true).onSnapshot((q) => {
      st.ads = q.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      store.set("ads", st.ads); emit("ads", st.ads);
    }, () => {});
  }
  function adEvent(id, kind) {
    stat(kind === "clicks" ? "adClicks" : "adsOwn");
    if (st.online && id) db.collection("ads").doc(id).update({ [kind]: FV.increment(1) }).catch(() => {});
  }

  // ---------- leaderboards ----------
  const asRow = (d, extra) => Object.assign({ id: d.id }, d.data(), extra || {});
  async function leaderboard(kind) {
    if (!st.online) return { rows: [{ id: "me", pseudo: st.profile.pseudo, country: st.profile.country, avatar: st.profile.avatar, bestLevel: progress.bestLevel, points: progress.points, me: true }], local: true };
    let rows = [];
    if (kind === "week") {
      const q = await db.collection("weeks").doc(C.isoWeek(new Date())).collection("scores").orderBy("points", "desc").limit(50).get();
      rows = q.docs.map((d) => asRow(d));
    } else if (kind === "country") {
      try {
        const q = await db.collection("users").where("country", "==", st.profile.country).orderBy("bestLevel", "desc").limit(50).get();
        rows = q.docs.map((d) => asRow(d));
      } catch (e) { // composite index missing: fall back to a client-side filter
        const q = await db.collection("users").orderBy("bestLevel", "desc").limit(300).get();
        rows = q.docs.map((d) => asRow(d)).filter((r) => r.country === st.profile.country).slice(0, 50);
      }
    } else {
      const q = await db.collection("users").orderBy("bestLevel", "desc").limit(50).get();
      rows = q.docs.map((d) => asRow(d));
    }
    rows = rows.filter((r) => !r.banned);
    rows.forEach((r) => { if (r.id === st.uid) r.me = true; });
    return { rows, local: false };
  }

  // ---------- challenges ----------
  async function createChallenge(seed) {
    if (!st.online) return { id: "L" + seed.toString(36), seed, local: true };
    const ref = await db.collection("challenges").add({ seed, by: st.uid, byPseudo: st.profile.pseudo, byCountry: st.profile.country, plays: 0, createdAt: FV.serverTimestamp() });
    stat("challenges");
    return { id: ref.id, seed };
  }
  async function getChallenge(id, seedHint) {
    if (!st.online || id[0] === "L") return { id, seed: seedHint || parseInt(id.slice(1), 36) || 1, byPseudo: "", local: true };
    const s = await db.collection("challenges").doc(id).get();
    if (!s.exists) return null;
    return Object.assign({ id }, s.data());
  }
  async function challengeResults(id) {
    if (!st.online || id[0] === "L") return [];
    const q = await db.collection("challenges").doc(id).collection("results").orderBy("level", "desc").limit(50).get();
    return q.docs.map((d) => asRow(d, { me: d.id === st.uid }));
  }
  async function postChallengeResult(id, level, points) {
    if (!st.online || id[0] === "L") return;
    const ref = db.collection("challenges").doc(id).collection("results").doc(st.uid);
    const prev = await ref.get();
    if (prev.exists && (prev.data().level > level || (prev.data().level === level && prev.data().points >= points))) return;
    await ref.set({ pseudo: st.profile.pseudo, country: st.profile.country, avatar: st.profile.avatar, level, points, at: FV.serverTimestamp() });
    if (!prev.exists) db.collection("challenges").doc(id).update({ plays: FV.increment(1) }).catch(() => {});
  }

  // ---------- chat ----------
  function listenChat(cb) {
    if (!st.online) { cb(null); return () => {}; }
    return db.collection("chat").orderBy("at", "desc").limit(60).onSnapshot((q) => {
      cb(q.docs.map((d) => { const x = d.data(); return Object.assign({ id: d.id }, x, { ms: x.at && x.at.toMillis ? x.at.toMillis() : Date.now(), me: x.uid === st.uid }); }).reverse());
    }, (e) => { console.warn("chat", e); cb(null); });
  }
  let lastChat = 0;
  async function sendChat(text) {
    const t = C.clean(text);
    if (!t) return "vide";
    if (!st.online) return "horsligne";
    if (st.banned || st.muted) return "muet";
    if (Date.now() - lastChat < 4000) return "vite";
    lastChat = Date.now();
    await db.collection("chat").add({ uid: st.uid, pseudo: st.profile.pseudo, country: st.profile.country, avatar: st.profile.avatar, text: t, at: FV.serverTimestamp() });
    stat("messages");
    return "ok";
  }
  async function report(msg) {
    if (!st.online) return;
    await db.collection("reports").add({ msgId: msg.id, text: msg.text, reportedUid: msg.uid, reportedPseudo: msg.pseudo, by: st.uid, at: FV.serverTimestamp() });
  }

  return { st, on, init, saveProgress, levelCleared, updateProfile, stat, adEvent, leaderboard, createChallenge, getChallenge, challengeResults, postChallengeResult, listenChat, sendChat, report, DEFAULTS };
})();
