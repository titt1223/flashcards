# Flashcards

Application web installable (PWA) pour réviser avec des cartes mémoire.

- **Tri** « je connais / je ne connais pas », révision en boucle jusqu'à tout savoir, cartes marquées 🚩
- **Paquets et classeurs** (vrais dossiers navigables), recherche, sélection multiple, suppression annulable, export CSV d'un paquet
- **Ajout de cartes pendant la révision** (bouton +), surlignage en un geste (aussi directement sur la carte)
- Interface inspirée d'iOS : grands titres, listes groupées, barre d'onglets, feuilles d'actions, thème clair / sombre et couleur d'accent
- **Import** CSV, copier-coller (séparateurs au choix) ou carte par carte
- **LaTeX** (KaTeX), gras / souligné / surlignage en couleur
- **Synchronisation** entre appareils via Google Drive (dossier caché de l'app, scope `drive.appdata`)
- **Mode jeu** optionnel : XP, niveaux, séries de jours, objectif quotidien, badges, défi éclair chronométré
- **Hors ligne** : tout (formules et police comprises) est embarqué et mis en cache par le service worker

## Structure

```
index.html            point d'entrée
css/app.css           styles (thèmes clair / sombre)
js/icons.js           icônes (style SF Symbols)
js/util.js            utilitaires, composants d'interface, mise en forme des cartes
js/store.js           données, réglages, fusion de synchronisation
js/ui.js              feuilles d'actions, alertes, ajout rapide, notifications, effets, thème
js/game.js            moteur de jeu (XP, séries, badges)
js/study.js           sessions d'étude, boucle, défi éclair
js/editor.js          édition, surlignage, LaTeX, import / export
js/views.js           écrans (grands titres, listes groupées, onglets)
js/sync.js            synchronisation Google Drive
js/app.js             actions, événements, démarrage
sw.js                 service worker (hors ligne, mise à jour)
vendor/               KaTeX et police Inter (voir vendor/LICENSES.md)
```

Aucune étape de build : le dossier se déploie tel quel sur n'importe quel hébergement statique en HTTPS (Netlify, GitHub Pages…).

## Développement local

```
python -m http.server 8000
```

puis ouvrir http://localhost:8000.

## Données

Tout est stocké dans le navigateur (`localStorage`) et, si tu te connectes, dans ton propre Google Drive. Aucun serveur tiers.
La progression du jeu est enregistrée par appareil et par jour, puis additionnée à la synchronisation : deux appareils ne s'écrasent jamais.
