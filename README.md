# Ellipso

Jeu de billard elliptique néon, installable sur téléphone (PWA), aux niveaux infinis et uniques à chaque partie.

![Logo Ellipso](icons/icon-192.png)

## Le principe

Dans une ellipse, tout ce qui part d'un foyer rebondit sur le bord et passe par l'autre foyer.

- Glisse pour viser, relâche pour tirer (les flèches ◀ ▶ règlent l'angle au dixième de degré).
- La balle doit d'abord traverser un **point ×2** : elle se divise en deux. Si elle touche la clôture avant, elle tombe et le niveau recommence.
- Chaque balle touche la clôture **3 fois au maximum** (parfois moins).
- Mets assez de balles dans la cible pour passer. Raté : le niveau recommence, ou tu le passes avec une pub ou avec tes points.
- Murs tournants et glissants, trous noirs, chrono, foyers cachés, cristaux, niveaux bonus tous les 5 niveaux.
- 5 vies qui se rechargent toutes seules (ou avec une pub, ou avec des points), cadeau du jour avec série de 7 jours.
- Rebondisseurs, portails, points ×2 mobiles, brouillard, murs tournants et glissants, trous noirs, chrono, foyers cachés.
- Niveaux bonus à thèmes (Or, Galaxie, Glace, Feu, Arc-en-ciel, Jungle) avec aimant qui cale la source pile sur le foyer.
- Chaque partie a sa propre graine : les niveaux sont différents d'une partie à l'autre, et chaque niveau est vérifié gagnable avant d'être proposé.
- Communauté (Firebase) : profils et pays, classements monde / semaine / pays, défis entre amis par lien, chat modéré.
- Espace admin (`admin.html`) : joueurs en ligne, statistiques, modération, pubs maison image/vidéo, réglages en direct.

## Structure

| Chemin | Rôle |
|---|---|
| `index.html` | Le jeu complet, prêt à être servi |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA : installation et jeu hors connexion |
| `admin.html` | Espace admin |
| `firebase-config.js` | Configuration du serveur Firebase (à remplir) |
| `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json` | Règles de sécurité et index Firebase |
| `vendor/` | SDK Firebase (chargé seulement si le serveur est configuré) |
| `ads/`, `ads.txt` | Tes fichiers de pub ; fichier AdSense à compléter |
| `source/src/` | Sources du jeu : `engine.js` (physique, générateur), `game.js`, `net.js` (serveur), `ads.js`, `community.js`, `core.js`, `style.css`, `body.html` |
| `source/admin/` | Sources de l'espace admin |
| `source/test/` | Faux serveur Firebase et test de bout en bout |
| `source/build.py` | Régénère `index.html`, `admin.html`, le manifest et le service worker |

Pour reconstruire après une modification des sources : `python3 source/build.py`. Pense aussi à changer `VERSION` dans `source/build.py` (cache du service worker) pour que les joueurs reçoivent la mise à jour.

## Mise en ligne

GitHub Pages : Settings → Pages → Source « Deploy from a branch » → branche `main`, dossier `/ (root)`. Le jeu sera disponible sur `https://shekinabanza.github.io/-Ellipso/`.

## Serveur, admin et publicité

Tout se configure en suivant `LISEZMOI.md` : création du projet Firebase, compte admin, pubs maison (image ou vidéo) et Google AdSense (H5 Games Ads). Sans serveur configuré, le jeu fonctionne hors ligne.
