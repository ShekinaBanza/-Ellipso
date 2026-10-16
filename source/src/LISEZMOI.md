# Ellipso : mise en ligne et publicité

Ellipso est une PWA (application web installable). Le dossier contient tout le jeu :

| Fichier | Rôle |
|---|---|
| `index.html` | Le jeu complet (moteur, niveaux infinis, sons, pubs) |
| `manifest.webmanifest` | Nom, icônes et couleurs pour l'installation sur téléphone |
| `sw.js` | Service worker : le jeu marche hors connexion après la première visite |
| `icons/` | Logo en 192, 512, version « maskable » pour Android et icône Apple |
| `ads.txt` | Fichier exigé par Google AdSense (à compléter) |

## 1. Mettre le jeu en ligne (gratuit)

Une PWA doit être servie en **HTTPS**. Deux options simples :

**Netlify (le plus rapide)**
1. Va sur https://app.netlify.com/drop
2. Glisse le dossier `Ellipso` entier dans la page.
3. Tu obtiens une adresse en `https://...netlify.app`. C'est en ligne.

**GitHub Pages**
1. Crée un dépôt, envoie le contenu du dossier `Ellipso` à la racine.
2. Settings → Pages → Branch `main` → Save.

Ouvre ensuite l'adresse sur ton téléphone : Chrome propose « Installer l'application » (ou le bouton **Installer le jeu** du menu). Sur iPhone : Partager → « Sur l'écran d'accueil ».

## 2. Activer les vraies publicités

Le jeu est déjà câblé avec l'**API Ad Placement de Google** (H5 Games Ads), faite pour les jeux web :
- **Pub interstitielle** tous les 4 niveaux réussis.
- **Pub récompensée** : « Continuer » après une défaite, et « Voir les foyers » sur les niveaux à foyers cachés.
- **Bannière 320×50** sur le menu et l'écran de fin (jamais pendant la partie).

Tant que rien n'est configuré, le jeu affiche des **emplacements de démonstration** et donne les récompenses après 3 secondes.

Étapes :
1. Crée un compte Google AdSense et fais valider ton site (ton adresse Netlify ou ton nom de domaine).
2. Demande l'accès à **H5 Games Ads** (Ad Placement API) depuis AdSense.
3. Dans `index.html`, cherche `ELLIPSO_CONFIG` et remplis :
   - `adClient: "ca-pub-..."` avec ton identifiant éditeur ;
   - `bannerSlot: "..."` avec l'identifiant d'un bloc d'annonce display (optionnel).
4. Laisse `adTest: true` pour tester, puis passe à `false` quand tout fonctionne.
5. Dans `ads.txt`, remplace `pub-XXXXXXXXXXXXXXXX` par ton identifiant et supprime la ligne de commentaire.

Important : ne clique jamais sur tes propres pubs (risque de suspension du compte AdSense).

## 3. Mettre à jour le jeu

Après une modification, change `ellipso-v1` en `ellipso-v2` dans `sw.js` pour que les joueurs reçoivent la nouvelle version.

## 4. Aller plus loin : Play Store

Une PWA peut être publiée sur Google Play avec https://www.pwabuilder.com (format TWA). Pour la pub dans une app Play Store, Google demande en général AdMob plutôt qu'AdSense.
