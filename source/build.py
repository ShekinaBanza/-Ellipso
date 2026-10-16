import os, re, json, shutil
R=os.path.dirname(os.path.abspath(__file__)); S=os.path.join(R,'src'); D=os.path.join(R,'dist'); P=os.path.dirname(R)  # output straight to the repository root
rd=lambda f: open(os.path.join(S,f),encoding='utf8').read()
css, body, eng, game, logo = rd('style.css'), rd('body.html'), rd('engine.js'), rd('game.js'), rd('logo.svg')
inline_logo = logo.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">','<svg class="logo" viewBox="0 0 512 512" aria-hidden="true">')
body = body.replace('{{LOGO}}', inline_logo)
FONTS='<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700&family=Outfit:wght@400;600;700&display=swap">'
DESC="Ellipso : un jeu de billard elliptique aux niveaux infinis. Tout ce qui part d'un foyer arrive à l'autre."
os.makedirs(os.path.join(P,'icons'),exist_ok=True); os.makedirs(D,exist_ok=True)
# ---- PWA index ----
ads_head = '''<script>
  /* ====== CONFIGURATION PUB (voir LISEZMOI.md) ====== */
  window.ELLIPSO_CONFIG = {
    adClient: "",      // ex. "ca-pub-1234567890123456" (laisser vide = mode démo)
    bannerSlot: "",    // ex. "1234567890" : bloc d'annonce display 320x50 pour le menu
    adTest: true       // true = pubs de test Google. Mettre false une fois validé.
  };
  window.adsbygoogle = window.adsbygoogle || [];
  window.adBreak = window.adConfig = function (o) { window.adsbygoogle.push(o); };
  (function (c) {
    if (!c.adClient) return;
    var s = document.createElement("script");
    s.async = true; s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + c.adClient;
    s.setAttribute("data-ad-client", c.adClient);
    s.setAttribute("data-ad-frequency-hint", "45s");
    if (c.adTest) s.setAttribute("data-adbreak-test", "on");
    document.head.appendChild(s);
  })(window.ELLIPSO_CONFIG);
</script>'''
sw_reg = '<script>if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) { window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); }); }</script>'
index = f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>Ellipso</title>
<meta name="description" content="{DESC}">
<meta name="theme-color" content="#050913">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
<link rel="icon" href="icons/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Ellipso">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta property="og:title" content="Ellipso">
<meta property="og:description" content="{DESC}">
<meta property="og:image" content="icons/icon-512.png">
{FONTS}
{ads_head}
<style>
{css}
</style>
</head>
<body>
{body}
<script>
{eng}
</script>
<script>
{game}
</script>
{sw_reg}
</body>
</html>
'''
open(os.path.join(P,'index.html'),'w',encoding='utf8').write(index)
manifest={"name":"Ellipso","short_name":"Ellipso","description":DESC,"lang":"fr","start_url":"./","scope":"./","id":"./",
 "display":"fullscreen","display_override":["fullscreen","standalone"],"orientation":"portrait","background_color":"#050913","theme_color":"#050913","categories":["games","education"],
 "icons":[{"src":"icons/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any"},{"src":"icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any"},
          {"src":"icons/maskable-192.png","sizes":"192x192","type":"image/png","purpose":"maskable"},{"src":"icons/maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]}
open(os.path.join(P,'manifest.webmanifest'),'w').write(json.dumps(manifest,ensure_ascii=False,indent=2))
open(os.path.join(P,'sw.js'),'w').write('''// Ellipso service worker : jeu jouable hors connexion
const CACHE = "ellipso-v3";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/favicon.svg"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== self.location.origin && !fonts) return; // les pubs passent toujours par le réseau
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put("./index.html", cp)); return r; }).catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok || r.type === "opaque") { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
    return r;
  })));
});
''')
shutil.copy(os.path.join(S,'logo.svg'),os.path.join(P,'icons','favicon.svg'))
os.path.exists(os.path.join(P,'ads.txt')) or open(os.path.join(P,'ads.txt'),'w').write('# Remplace pub-XXXXXXXXXXXXXXXX par ton identifiant AdSense, puis supprime cette ligne.\ngoogle.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0\n')
# ---- artifact preview ----
art = f'''<title>Ellipso</title>
<meta name="claude:viewport-fit-sides" content="cover">
{FONTS}
<style>
{css}
</style>
{body}
<script>
{eng}
</script>
<script>
{game}
</script>
'''
open(os.path.join(D,'ellipso.html'),'w',encoding='utf8').write(art)
# maskable svg
mask = logo.replace('rx="112" fill="url(#bg)"','fill="url(#bg)"').replace('<g id="mark">','<g id="mark" transform="translate(256 256) scale(0.8) translate(-256 -256)">')
open(os.path.join(D,'maskable.svg'),'w').write(mask)
full = logo.replace('rx="112" fill="url(#bg)"','fill="url(#bg)"')
open(os.path.join(D,'full.svg'),'w').write(full)
print('built')
