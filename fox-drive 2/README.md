# Fox Drive — suivi de flotte

Un seul serveur Node (site + API + tâches planifiées) et une base Postgres. Aucun quota « de crédits » : il tourne tant que l'hébergement est payé.

## Mise en ligne sur Render (recommandé)
1. Mettre le contenu de ce dossier (avec `Dockerfile` à la racine) dans un dépôt GitHub privé.
2. render.com → New → **Blueprint** → choisir le dépôt. Render lit `render.yaml` et crée le serveur + la base (Francfort).
3. Renseigner `SETUP_CODE` (code qui sert à créer le premier compte). `APP_SECRET` est généré automatiquement : ne jamais le changer ensuite.
4. Ouvrir l'adresse `https://….onrender.com`, créer le compte administrateur, puis suivre « Réglages » (Google, WhatsApp, Claude).

## Autres hébergeurs
Tout hébergeur qui lance un `Dockerfile` et fournit un Postgres convient (Railway, Fly.io…).
Variables : `DATABASE_URL`, `APP_SECRET` (16 caractères minimum), `SETUP_CODE`.
Optionnelles : `PORT`, `SYNC_EVERY_MINUTES` (15), `DAILY_HOUR` (8, heure de Paris), `DATABASE_SSL=true`.

## Développement
- `npm install`, puis `npm test` (une base Postgres jetable est incluse).
- Essai local : `node scripts/test-db.ts`, puis `DATABASE_URL=… APP_SECRET=… SETUP_CODE=… npm start`.
