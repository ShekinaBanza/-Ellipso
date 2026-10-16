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
- Chaque partie a sa propre graine : les niveaux sont différents d'une partie à l'autre, et chaque niveau est vérifié gagnable avant d'être proposé.

## Structure

| Chemin | Rôle |
|---|---|
| `index.html` | Le jeu complet, prêt à être servi |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA : installation et jeu hors connexion |
| `ads.txt` | Fichier AdSense à compléter |
| `source/src/` | Sources : `engine.js` (physique et générateur de niveaux), `game.js`, `style.css`, `body.html`, `logo.svg` |
| `source/build.py` | Régénère `index.html`, le manifest et le service worker à la racine |

Pour reconstruire après une modification des sources : `python3 source/build.py`. Pense aussi à changer `ellipso-vN` dans `source/build.py` (cache du service worker) pour que les joueurs reçoivent la mise à jour.

## Mise en ligne

GitHub Pages : Settings → Pages → Source « Deploy from a branch » → branche `main`, dossier `/ (root)`. Le jeu sera disponible sur `https://shekinabanza.github.io/-Ellipso/`.

## Publicité

Le jeu utilise l'API Ad Placement de Google (H5 Games Ads) : pub interstitielle tous les 4 niveaux réussis, pubs récompensées pour passer un niveau ou voir les foyers, bannière sur le menu. Sans configuration, il affiche des emplacements de démonstration. Voir `LISEZMOI.md` pour activer les vraies pubs.
