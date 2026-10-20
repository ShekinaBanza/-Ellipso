// ===== Ellipso community panel: profile, leaderboards, challenges, chat =====
var COMMUNITY = (function () {
  "use strict";
  const C = CORE, $ = C.$, esc = C.esc;
  let hooks = { onPlayChallenge() {}, onOpen() {}, onClose() {} };
  let tab = "rank", rankKind = "all", unsubChat = null;
  const avatar = (p) => '<span class="av" style="background:' + C.AVATARS[(p && p.avatar) || 0] + '">' + esc(((p && p.pseudo) || "?").slice(0, 1).toUpperCase()) + "</span>";
  const who = (p) => avatar(p) + '<span class="who"><b>' + esc(p.pseudo || "?") + "</b><small>" + C.flag(p.country) + " " + esc(C.countryName(p.country)) + "</small></span>";

  function open(t) {
    hooks.onOpen();
    $("comm").hidden = false;
    show(t || tab);
  }
  function close() {
    $("comm").hidden = true;
    if (unsubChat) { unsubChat(); unsubChat = null; }
    hooks.onClose();
  }
  function show(t) {
    tab = t;
    document.querySelectorAll("#comm .tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
    if (unsubChat && t !== "chat") { unsubChat(); unsubChat = null; }
    const body = $("commBody");
    body.innerHTML = '<p class="muted">Chargement…</p>';
    if (t === "rank") renderRank();
    else if (t === "defi") renderDefis();
    else if (t === "chat") renderChat();
    else renderProfile();
  }
  const offlineNote = () => (NET.st.enabled ? (NET.st.online ? "" : '<p class="note">Connexion au serveur en cours… Vérifie ta connexion internet.</p>')
    : '<p class="note">Mode hors ligne : le classement mondial, le chat et les défis en ligne s\'activent quand le serveur du jeu est configuré.</p>');

  // ---------- leaderboards ----------
  async function renderRank() {
    const body = $("commBody");
    const head = '<div class="seg">' + [["all", "Monde"], ["week", "Cette semaine"], ["country", C.flag(NET.st.profile.country) + " Mon pays"]]
      .map(([k, l]) => '<button data-k="' + k + '" class="' + (k === rankKind ? "on" : "") + '">' + l + "</button>").join("") + "</div>";
    body.innerHTML = head + offlineNote() + '<ol class="board" id="board"><li class="muted">Chargement…</li></ol>';
    body.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => { rankKind = b.dataset.k; renderRank(); }));
    try {
      const { rows } = await NET.leaderboard(rankKind);
      const ol = $("board"); if (!ol) return;
      if (!rows.length) { ol.innerHTML = '<li class="muted">Personne pour l\'instant. Sois le premier !</li>'; return; }
      ol.innerHTML = rows.map((r, i) => '<li class="' + (r.me ? "me" : "") + '"><span class="rk">' + (i + 1) + "</span>" + who(r) +
        '<span class="sc">' + (rankKind === "week" ? C.fmt(r.points) + " pts<small>" + (r.cleared || 0) + " niveaux</small>" : "Niv. " + (r.bestLevel || 1) + "<small>" + C.fmt(r.points) + " pts</small>") + "</span></li>").join("");
    } catch (e) { const ol = $("board"); if (ol) ol.innerHTML = '<li class="muted">Impossible de charger le classement. Réessaie plus tard.</li>'; console.warn(e); }
  }

  // ---------- challenges ----------
  const myDefis = () => C.store.get("defis", []);
  const linkFor = (d) => { const base = /^https?:/.test(location.href) ? location.href.split(/[?#]/)[0] : "https://shekinabanza.github.io/-Ellipso/"; return base + "?defi=" + encodeURIComponent(d.id) + "&s=" + d.seed; };
  async function share(d) {
    const url = linkFor(d), text = "Je te défie sur Ellipso ! Mêmes niveaux, 3 vies : qui ira le plus loin ?";
    try { if (navigator.share) { await navigator.share({ title: "Défi Ellipso", text, url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text + " " + url); C.toast("Lien du défi copié : envoie-le à tes amis !"); } catch (e) { C.toast(url); }
  }
  function renderDefis() {
    const body = $("commBody"), list = myDefis();
    body.innerHTML = '<div class="hero-defi"><h3>Défie tes amis</h3><p>Crée un défi : tes amis jouent exactement les mêmes niveaux que toi, avec 3 vies. Le classement du défi montre qui est allé le plus loin.</p>' +
      '<button class="cta" id="bNewDefi">CRÉER UN DÉFI</button></div>' + offlineNote() +
      '<h4>Mes défis</h4><ul class="defis">' + (list.length ? list.map((d, i) => '<li><div><b>Défi ' + esc(d.id.slice(0, 6).toUpperCase()) + "</b><small>" + (d.mine ? "créé par toi" : "de " + esc(d.by || "un ami")) + (d.best ? " · ton record : niveau " + d.best : "") + "</small></div>" +
        '<div class="row"><button class="pill" data-a="play" data-i="' + i + '">Jouer</button><button class="pill" data-a="res" data-i="' + i + '">Résultats</button><button class="pill" data-a="share" data-i="' + i + '">Partager</button></div></li>').join("") : '<li class="muted">Aucun défi pour l\'instant.</li>') + "</ul>" +
      '<div id="defiRes"></div>';
    $("bNewDefi").onclick = async () => {
      const b = $("bNewDefi"); b.disabled = true;
      try {
        const seed = (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0) || 7;
        const d = await NET.createChallenge(seed);
        const all = myDefis(); all.unshift({ id: d.id, seed, mine: true, at: Date.now() }); C.store.set("defis", all.slice(0, 30));
        renderDefis(); share({ id: d.id, seed });
      } catch (e) { C.toast("Impossible de créer le défi. Vérifie ta connexion."); b.disabled = false; }
    };
    body.querySelectorAll(".defis button").forEach((b) => (b.onclick = () => {
      const d = myDefis()[+b.dataset.i];
      if (b.dataset.a === "play") { close(); hooks.onPlayChallenge({ id: d.id, seed: d.seed, byPseudo: d.mine ? "toi" : d.by }); }
      else if (b.dataset.a === "share") share(d);
      else showResults(d.id, $("defiRes"));
    }));
  }
  async function showResults(id, el) {
    el = el || $("commBody");
    el.innerHTML = '<p class="muted">Chargement des résultats…</p>';
    try {
      const rows = await NET.challengeResults(id);
      el.innerHTML = "<h4>Classement du défi " + esc(id.slice(0, 6).toUpperCase()) + '</h4><ol class="board">' + (rows.length ? rows.map((r, i) => '<li class="' + (r.me ? "me" : "") + '"><span class="rk">' + (i + 1) + "</span>" + who(r) + '<span class="sc">Niv. ' + r.level + "<small>" + C.fmt(r.points) + " pts</small></span></li>").join("")
        : '<li class="muted">' + (id[0] === "L" ? "Défi hors ligne : les résultats ne sont pas partagés." : "Personne n'a encore joué ce défi.") + "</li>") + "</ol>";
    } catch (e) { el.innerHTML = '<p class="muted">Résultats indisponibles pour l\'instant.</p>'; }
  }
  function rememberDefi(ch, best) {
    const all = myDefis(), i = all.findIndex((d) => d.id === ch.id);
    const d = i >= 0 ? all[i] : { id: ch.id, seed: ch.seed, mine: false, by: ch.byPseudo, at: Date.now() };
    if (best) d.best = Math.max(d.best || 0, best);
    if (i >= 0) all[i] = d; else all.unshift(d);
    C.store.set("defis", all.slice(0, 30));
  }

  // ---------- chat ----------
  function renderChat() {
    const body = $("commBody"), cfg = NET.st.config;
    if (cfg.chatEnabled === false) { body.innerHTML = '<p class="note">Le chat est fermé pour le moment.</p>'; return; }
    if (!NET.st.online) { body.innerHTML = offlineNote() || '<p class="note">Chat indisponible.</p>'; return; }
    body.innerHTML = '<div class="chat" id="chatList"><p class="muted">Chargement…</p></div>' +
      (NET.st.banned || NET.st.muted ? '<p class="note">Tu ne peux plus écrire dans le chat (décision de la modération).</p>'
        : '<form class="chatform" id="chatForm"><input id="chatIn" maxlength="200" autocomplete="off" placeholder="Écris un message…" aria-label="Message"><button class="cta" type="submit">ENVOYER</button></form><p class="muted small">Reste respectueux : les messages sont modérés.</p>');
    unsubChat = NET.listenChat((msgs) => {
      const el = $("chatList"); if (!el) return;
      if (!msgs) { el.innerHTML = '<p class="muted">Chat indisponible.</p>'; return; }
      el.innerHTML = msgs.length ? msgs.map((m) => '<div class="msg' + (m.me ? " me" : "") + '">' + avatar(m) + '<div class="bubble"><div class="meta"><b>' + esc(m.pseudo) + "</b> " + C.flag(m.country) + " <small>" + C.ago(m.ms) + "</small>" +
        (m.me ? "" : ' <button class="rep" data-id="' + esc(m.id) + '" aria-label="Signaler">signaler</button>') + "</div>" + esc(m.text) + "</div></div>").join("") : '<p class="muted">Aucun message. Dis bonjour !</p>';
      el.scrollTop = el.scrollHeight;
      el.querySelectorAll(".rep").forEach((b) => (b.onclick = async () => { const m = msgs.find((x) => x.id === b.dataset.id); if (m) { await NET.report(m).catch(() => {}); C.toast("Message signalé à la modération. Merci !"); b.remove(); } }));
    });
    const f = $("chatForm");
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      const inp = $("chatIn"), r = await NET.sendChat(inp.value).catch(() => "err");
      if (r === "ok") inp.value = "";
      else C.toast({ vite: "Doucement : attends quelques secondes.", muet: "Tu ne peux plus écrire dans le chat.", vide: "Écris un message d'abord.", horsligne: "Pas de connexion." }[r] || "Message non envoyé.");
    };
  }

  // ---------- profile ----------
  function renderProfile() {
    const p = NET.st.profile, pr = C.store.get("progress", {}), body = $("commBody");
    body.innerHTML = '<form id="profForm" class="prof">' +
      '<label for="pPseudo">Pseudo</label><input id="pPseudo" maxlength="16" minlength="2" required value="' + esc(p.pseudo) + '">' +
      '<label for="pCountry">Pays</label><select id="pCountry">' + C.COUNTRIES.map(([c, n]) => '<option value="' + c + '"' + (c === p.country ? " selected" : "") + ">" + C.flag(c) + " " + esc(n) + "</option>").join("") + "</select>" +
      '<span class="lbl">Couleur</span><div class="avs">' + C.AVATARS.map((col, i) => '<button type="button" data-i="' + i + '" class="' + (i === p.avatar ? "on" : "") + '" style="background:' + col + '" aria-label="Couleur ' + (i + 1) + '"></button>').join("") + "</div>" +
      '<button class="cta" type="submit">ENREGISTRER</button></form>' +
      '<div class="stats"><div class="stat"><span>RECORD</span><b>' + (pr.bestLevel || 1) + '</b></div><div class="stat"><span>POINTS</span><b>' + C.fmt(pr.points) + '</b></div><div class="stat"><span>RÉUSSIS</span><b>' + C.fmt(pr.cleared) + "</b></div></div>" + offlineNote();
    let av = p.avatar;
    body.querySelectorAll(".avs button").forEach((b) => (b.onclick = () => { av = +b.dataset.i; body.querySelectorAll(".avs button").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("profForm").onsubmit = async (e) => {
      e.preventDefault();
      const pseudo = C.clean($("pPseudo").value).replace(/\*/g, "").slice(0, 16);
      if (pseudo.length < 2) { C.toast("Choisis un pseudo d'au moins 2 lettres."); return; }
      try { await NET.updateProfile({ pseudo, country: $("pCountry").value, avatar: av }); C.toast("Profil enregistré !"); } catch (e) { C.toast("Profil enregistré sur ce téléphone. Il sera envoyé à la prochaine connexion."); }
    };
  }

  function init(h) {
    hooks = Object.assign(hooks, h);
    document.querySelectorAll("#comm .tabs button").forEach((b) => (b.onclick = () => show(b.dataset.t)));
    $("bCommClose").onclick = close;
  }
  return { init, open, close, showResults, rememberDefi, linkFor };
})();
