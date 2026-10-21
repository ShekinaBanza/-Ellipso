// ===== Ellipso shared helpers (used by the game and the community panel) =====
var CORE = (function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const fmt = (v) => Math.round(v || 0).toLocaleString("fr-FR");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ellipso." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("ellipso." + k, JSON.stringify(v)); } catch (e) {} },
  };
  let toastT = 0;
  function toast(msg) { const t = $("toast"); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  function isoWeek(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return d.getUTCFullYear() + "-S" + String(Math.ceil(((d - y0) / 864e5 + 1) / 7)).padStart(2, "0");
  }
  const AVATARS = ["#6fe6ff", "#ff4f9a", "#ffd25a", "#8b6bff", "#3fe0c5", "#ff8a3d", "#9dff6a", "#ff6b6b"];
  const COUNTRIES = [
    ["CD", "RD Congo"], ["CG", "Congo-Brazzaville"], ["FR", "France"], ["BE", "Belgique"], ["CA", "Canada"], ["CH", "Suisse"],
    ["CM", "Cameroun"], ["CI", "Côte d'Ivoire"], ["SN", "Sénégal"], ["GA", "Gabon"], ["AO", "Angola"], ["RW", "Rwanda"],
    ["BI", "Burundi"], ["BJ", "Bénin"], ["BF", "Burkina Faso"], ["ML", "Mali"], ["NE", "Niger"], ["TG", "Togo"], ["GN", "Guinée"],
    ["TD", "Tchad"], ["CF", "Centrafrique"], ["MG", "Madagascar"], ["MA", "Maroc"], ["DZ", "Algérie"], ["TN", "Tunisie"],
    ["HT", "Haïti"], ["NG", "Nigeria"], ["GH", "Ghana"], ["KE", "Kenya"], ["TZ", "Tanzanie"], ["UG", "Ouganda"], ["ZA", "Afrique du Sud"],
    ["ZM", "Zambie"], ["ET", "Éthiopie"], ["EG", "Égypte"], ["US", "États-Unis"], ["GB", "Royaume-Uni"], ["DE", "Allemagne"],
    ["ES", "Espagne"], ["IT", "Italie"], ["PT", "Portugal"], ["NL", "Pays-Bas"], ["BR", "Brésil"], ["MX", "Mexique"], ["IN", "Inde"],
    ["CN", "Chine"], ["JP", "Japon"], ["TR", "Turquie"], ["LB", "Liban"], ["AE", "Émirats arabes unis"], ["XX", "Autre pays"],
  ];
  const countryName = (c) => (COUNTRIES.find((x) => x[0] === c) || [c, c || "?"])[1];
  const flag = (c) => (!c || c === "XX" || c.length !== 2 ? "" : String.fromCodePoint(...[...c.toUpperCase()].map((ch) => 0x1f1a5 + ch.charCodeAt(0))));
  function guessCountry() {
    const langs = navigator.languages || [navigator.language || ""];
    for (const l of langs) { const m = /[-_]([A-Za-z]{2})$/.exec(l || ""); if (m && COUNTRIES.some((c) => c[0] === m[1].toUpperCase())) return m[1].toUpperCase(); }
    return "CD";
  }
  function platform() {
    const ua = navigator.userAgent || "";
    return /android/i.test(ua) ? "android" : /iphone|ipad|ipod/i.test(ua) ? "ios" : /mobile/i.test(ua) ? "mobile" : "ordinateur";
  }
  const installed = () => { try { return matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true; } catch (e) { return false; } };
  // light profanity filter for the public chat (French / English); the admin can still delete messages
  const BAD = ["merde", "putain", "pute", "connard", "connasse", "salope", "encule", "enculé", "nique", "batard", "bâtard", "fdp", "ntm", "fuck", "shit", "bitch", "asshole", "pussy", "dick"];
  function clean(text) {
    let t = String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
    for (const w of BAD) t = t.replace(new RegExp("\\b" + w + "\\b", "gi"), (m) => m[0] + "*".repeat(m.length - 1));
    return t;
  }
  const ago = (ms) => {
    if (!ms) return "jamais";
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return "à l'instant"; if (s < 3600) return "il y a " + Math.floor(s / 60) + " min";
    if (s < 86400) return "il y a " + Math.floor(s / 3600) + " h"; return "il y a " + Math.floor(s / 86400) + " j";
  };
  return { $, fmt, esc, store, toast, today, isoWeek, AVATARS, COUNTRIES, countryName, flag, guessCountry, platform, installed, clean, ago };
})();
