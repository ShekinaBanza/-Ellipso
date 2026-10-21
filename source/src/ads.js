// ===== Ellipso ads: house ads (image / video set in the admin) + Google H5 Games Ads =====
var ADS = (function () {
  "use strict";
  const C = CORE, $ = C.$;
  let hooks = { pause() {}, resume() {} };
  let googleReady = false, showing = false;
  const cfg = () => NET.st.config;
  const googleOn = () => cfg().useGoogle !== false && !!cfg().adClient && typeof window.adBreak === "function";
  const demoMode = () => !NET.st.enabled && !cfg().adClient;
  function pick(placement) {
    const list = (NET.st.ads || []).filter((a) => a.active !== false && a.url && (a.placements || []).includes(placement));
    if (!list.length) return null;
    let tot = list.reduce((s, a) => s + (a.weight || 1), 0), r = Math.random() * tot;
    for (const a of list) { r -= a.weight || 1; if (r <= 0) return a; }
    return list[0];
  }
  function initGoogle() {
    if (googleReady || !googleOn()) return;
    googleReady = true;
    try { window.adConfig({ preloadAdBreaks: "on", sound: "on" }); } catch (e) {}
  }

  // full-screen overlay for house ads and the demo
  function overlay(ad, opts) {
    const ov = $("ad"), box = $("adBox"), bar = $("adBar"), btn = $("bAdClose"), link = $("bAdLink"), title = $("adTitle");
    showing = true; hooks.pause();
    ov.hidden = false; bar.style.width = "0%"; btn.disabled = true;
    const wait = Math.max(2, Math.min(30, (ad && ad.skipAfter) || (opts.reward ? 5 : 4)));
    title.textContent = ad ? ad.title || "" : "";
    link.hidden = !(ad && ad.link);
    if (ad && ad.link) { link.href = ad.link; link.onclick = () => NET.adEvent(ad.id, "clicks"); }
    let video = null;
    if (!ad) box.innerHTML = "Démo : une vraie publicité s'affichera ici quand tu ajouteras tes pubs dans l'espace admin ou ton compte AdSense.";
    else if (ad.type === "video") {
      box.innerHTML = ""; video = document.createElement("video");
      video.src = ad.url; video.playsInline = true; video.autoplay = true; video.muted = false; video.setAttribute("playsinline", "");
      box.appendChild(video);
      video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
    } else { box.innerHTML = ""; const img = new Image(); img.alt = ad.title || "Publicité"; img.src = ad.url; box.appendChild(img); }
    if (ad) NET.adEvent(ad.id, "impressions"); else NET.stat("adsDemo");
    const t0 = performance.now();
    let done = false;
    const total = () => (video && isFinite(video.duration) && opts.reward ? Math.min(30, video.duration) : wait) * 1000;
    const tick = () => {
      if (ov.hidden) return;
      const p = Math.min(1, (performance.now() - t0) / total());
      bar.style.width = (p * 100).toFixed(1) + "%";
      const left = Math.ceil((total() - (performance.now() - t0)) / 1000);
      if (p < 1) { btn.textContent = (opts.reward ? "Récompense dans " : "Passer dans ") + Math.max(1, left) + " s"; requestAnimationFrame(tick); }
      else { done = true; btn.disabled = false; btn.textContent = opts.reward ? "RÉCUPÉRER LA RÉCOMPENSE" : "CONTINUER"; }
    };
    tick();
    btn.onclick = () => {
      if (!done) return;
      ov.hidden = true; showing = false; if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
      box.innerHTML = ""; hooks.resume(); opts.end(true);
    };
  }

  function interstitial(name, done) {
    const c = cfg(), own = pick("interstitial");
    if (own && (!googleOn() || Math.random() < (c.ownAdsShare == null ? 0.6 : c.ownAdsShare))) return overlay(own, { reward: false, end: () => done() });
    if (googleOn()) {
      initGoogle();
      let called = false; const fin = () => { if (!called) { called = true; showing = false; hooks.resume(); NET.stat("adsGoogle"); done(); } };
      try { window.adBreak({ type: "next", name, beforeAd: () => { showing = true; hooks.pause(); }, afterAd: () => hooks.resume(), adBreakDone: fin }); } catch (e) { fin(); }
      setTimeout(() => { if (!called && !showing) fin(); }, 4000);
      return;
    }
    done();
  }
  function rewarded(name, onReward, onCancel) {
    const c = cfg();
    if (c.rewardedEnabled === false) { C.toast("Les pubs récompensées sont désactivées : c'est offert !"); return onReward(); }
    const own = pick("reward");
    if (own && (!googleOn() || Math.random() < (c.ownAdsShare == null ? 0.6 : c.ownAdsShare))) return overlay(own, { reward: true, end: () => onReward() });
    if (googleOn()) {
      initGoogle();
      let shown = false, rewardedOk = false;
      try {
        window.adBreak({
          type: "reward", name,
          beforeAd: () => { showing = true; hooks.pause(); }, afterAd: () => { showing = false; hooks.resume(); },
          beforeReward: (showAdFn) => { shown = true; showAdFn(); },
          adDismissed: () => {}, adViewed: () => { rewardedOk = true; },
          adBreakDone: () => {
            if (rewardedOk) { NET.stat("adsGoogle"); onReward(); }
            else if (!shown) { if (own) overlay(own, { reward: true, end: () => onReward() }); else { C.toast("Pas de pub disponible pour l'instant : c'est offert !"); onReward(); } }
            else { C.toast("Regarde la pub jusqu'au bout pour la récompense."); onCancel && onCancel(); }
          },
        });
      } catch (e) { onReward(); }
      return;
    }
    if (own) return overlay(own, { reward: true, end: () => onReward() });
    overlay(null, { reward: true, end: () => onReward() }); // demo / no ad configured
  }
  function banner(el) {
    if (!el) return;
    const own = pick("banner"), c = cfg();
    if (own) {
      el.innerHTML = '<a class="own-banner" target="_blank" rel="noopener"><img alt=""></a>';
      const a = el.firstChild; a.querySelector("img").src = own.url; a.querySelector("img").alt = own.title || "Publicité";
      if (own.link) a.href = own.link; a.onclick = () => NET.adEvent(own.id, "clicks");
      NET.adEvent(own.id, "impressions"); return;
    }
    if (googleOn() && c.bannerSlot) {
      if (el.dataset.g) return; el.dataset.g = "1";
      el.innerHTML = '<ins class="adsbygoogle" style="display:inline-block;width:320px;height:50px"></ins>';
      const ins = el.firstChild; ins.setAttribute("data-ad-client", c.adClient); ins.setAttribute("data-ad-slot", c.bannerSlot);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      return;
    }
    el.innerHTML = demoMode() ? '<div class="demo">ESPACE PUBLICITAIRE · 320 × 50</div>' : "";
  }
  return { interstitial, rewarded, banner, setHooks: (h) => (hooks = h), isShowing: () => showing };
})();
