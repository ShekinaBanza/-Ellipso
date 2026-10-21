# Ellipso : guide de mise en route

Ce guide explique comment activer le serveur (communauté, espace admin, pubs maison) et la publicité Google.
Sans serveur, le jeu marche quand même en **mode hors ligne** : niveaux, vies, bonus, cadeaux du jour et défis par lien fonctionnent, mais pas le classement mondial, le chat ni l'admin.

## 1. Mettre le jeu en ligne

GitHub Pages : **Settings → Pages → Deploy from a branch → `main` → `/ (root)` → Save**.
Le jeu est alors sur `https://shekinabanza.github.io/-Ellipso/` et l'admin sur `https://shekinabanza.github.io/-Ellipso/admin.html`.

## 2. Créer le serveur Firebase (gratuit, environ 10 minutes)

1. Va sur https://console.firebase.google.com, clique **Créer un projet**, nomme-le `ellipso` (Google Analytics : facultatif).
2. **Ajouter une application Web** (icône `</>`), nomme-la `Ellipso`, ne coche pas l'hébergement. Firebase affiche un bloc `firebaseConfig`.
3. Ouvre le fichier **`firebase-config.js`** du dépôt (sur GitHub : clique dessus, puis le crayon pour modifier) et recopie les 6 valeurs (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`). Enregistre (Commit).
4. **Authentication → Commencer → Méthodes de connexion** : active **Anonyme** (les joueurs) et **Adresse e-mail/Mot de passe** (toi, l'admin).
5. **Authentication → Paramètres → Domaines autorisés** : ajoute `shekinabanza.github.io`.
6. **Firestore Database → Créer une base de données** → mode **production** → région la plus proche (par exemple `europe-west`).
7. **Firestore → Règles** : remplace tout par le contenu du fichier **`firestore.rules`** du dépôt, puis **Publier**.
8. **Firestore → Index → Composite → Ajouter** : collection `users`, champs `country` (croissant) puis `bestLevel` (décroissant). C'est pour le classement « Mon pays » (sans cet index, il marche quand même, en plus lent).

Recharge le jeu : dans le menu **Communauté**, le classement et le chat sont actifs.

## 3. Créer ton compte admin

1. **Authentication → Utilisateurs → Ajouter un utilisateur** : ton e-mail et un mot de passe solide.
2. Copie l'**UID** de ce compte (colonne « UID utilisateur »).
3. **Firestore → Démarrer une collection** : nom `admins`, identifiant du document = l'UID copié, ajoute un champ quelconque (par exemple `nom` = `Shekina`), puis **Enregistrer**.
4. Ouvre `admin.html` et connecte-toi. Si tu vois « Accès refusé », la page t'affiche l'UID à utiliser.

Dans l'espace admin tu as :
- **Tableau de bord** : joueurs en ligne en direct, inscrits, nouveaux du jour, niveaux réussis, échecs, pubs vues et cliquées, graphique sur 14 jours, pays et appareils.
- **Joueurs** : liste, recherche, filtre (en ligne, suspendus, muets), boutons **Suspendre** et **Rendre muet**.
- **Chat** et **Signalements** : modération en direct (supprimer un message, rendre muet), ouvrir ou fermer le chat.
- **Publicités** : tes pubs image ou vidéo, avec vues, clics et taux de clic, plus les réglages Google.
- **Défis** : les défis créés et le nombre de joueurs.
- **Réglages** : annonce du menu, nombre de vies, temps de recharge, prix pour passer un niveau, cadeau du jour.

Les réglages s'appliquent tout de suite chez tous les joueurs connectés.

## 4. Tes propres pubs (image ou vidéo)

Dans **Publicités → Nouvelle publicité** :
- **Fichier** : le plus simple et gratuit, mets ton image (JPG, PNG) ou ta vidéo (MP4, courte et légère) dans le dossier **`ads/`** du dépôt, puis écris l'adresse `ads/nom-du-fichier.mp4`. Une adresse internet complète (`https://…`) marche aussi.
- **Envoyer un fichier** depuis l'admin utilise Firebase Storage. Pour les nouveaux projets, Google demande d'activer la formule **Blaze** (paiement à l'usage, avec une part gratuite) pour Storage. Le dossier `ads/` évite ce besoin.
- **Lien** : où va le joueur s'il clique (site, WhatsApp `https://wa.me/243…`, page Facebook…).
- **Emplacements** : entre les niveaux, pub récompensée (vie offerte, passer un niveau, voir les foyers), bannière du menu.
- **Poids** : une pub de poids 3 sort trois fois plus souvent qu'une pub de poids 1.

## 5. Publicité Google (AdSense, H5 Games Ads)

1. Crée un compte Google AdSense et fais valider ton site.
2. Demande l'accès à **H5 Games Ads** (pubs pour jeux web) dans AdSense.
3. Dans l'admin, **Publicités → Réglages des pubs** : colle ton identifiant `ca-pub-…`, laisse **Mode test** coché pour essayer, puis décoche-le quand tout fonctionne.
4. Dans le fichier `ads.txt` du dépôt, remplace `pub-XXXXXXXXXXXXXXXX` par ton identifiant.
5. « Part de tes pubs » règle le partage : à 60 %, tes pubs passent 6 fois sur 10 et Google prend le reste.

Ne clique jamais sur tes propres pubs Google : le compte peut être suspendu.

## 6. Mettre à jour le jeu

Les sources sont dans `source/`. Après une modification : `python3 source/build.py`, puis change `VERSION = 'ellipso-vN'` dans `source/build.py` pour que les joueurs reçoivent la mise à jour.
Les tests de bout en bout (deux joueurs + admin, avec un faux serveur) : lance `python3 -m http.server 8790` à la racine, puis `node source/test/e2e.js`.
