# RechercheImmo

Sauvegarde des annonces immobilières (SeLoger, LeBonCoin, Bien'ici, PAP… et
n'importe quel site) depuis une **extension Chrome**, avec une **note** sur ce
qui te plaît, vers un **site web** qui affiche tes annonces (photos + notes).

```
rechercheImmo/
├── extension/   # Extension Chrome (Manifest V3)
└── web/         # Site + API (Next.js, déployé sur Vercel + Postgres)
```

La liste est aussi exposée en JSON (`GET /api/listings`) pour servir, plus tard,
de base à un skill Claude.

---

## 1. Le site (`web/`)

### Développement local

```powershell
cd web
npm install
Copy-Item .env.example .env.local   # puis renseigner les valeurs
npm run db:push                     # crée la table dans Postgres
npm run dev                         # http://localhost:3000
```

Variables d'environnement (`web/.env.local`) :

| variable        | rôle                                                        |
|-----------------|-------------------------------------------------------------|
| `POSTGRES_URL`  | connexion Postgres (Vercel l'injecte automatiquement en prod) |
| `API_SECRET`    | secret partagé avec l'extension (en-tête `Authorization: Bearer`) |
| `SITE_PASSWORD` | mot de passe d'accès au site                                |

> Pour un Postgres local rapide : un projet gratuit [Neon](https://neon.tech)
> fournit une `POSTGRES_URL` utilisable aussi bien en local qu'en prod.

### Test de l'API en local

```powershell
curl -X POST http://localhost:3000/api/listings `
  -H "Authorization: Bearer <API_SECRET>" `
  -H "Content-Type: application/json" `
  -d '{\"url\":\"https://exemple.fr/annonce\",\"title\":\"Test\",\"price\":250000,\"photos\":[],\"notes\":\"belle lumière\"}'
```

Puis ouvrir http://localhost:3000 (mot de passe = `SITE_PASSWORD`).

### Déploiement Vercel

1. Pousser le dossier `web/` sur un repo Git et l'importer dans Vercel
   (ou `vercel` en CLI). Définir le **Root Directory** sur `web`.
2. Ajouter une base **Vercel Postgres** au projet → `POSTGRES_URL` est injectée.
3. Renseigner les variables `API_SECRET` et `SITE_PASSWORD` dans les
   *Environment Variables* du projet.
4. Lancer la migration : `npm run db:push` en local pointé sur la base de prod,
   ou via `vercel env pull` puis `npm run db:push`.

---

## 2. L'extension (`extension/`)

1. Ouvrir `chrome://extensions`, activer le **Mode développeur**.
2. **Charger l'extension non empaquetée** → sélectionner le dossier
   `extension/`.
3. Ouvrir les **réglages** de l'extension et saisir :
   - **URL du site** : `http://localhost:3000` (dev) ou l'URL Vercel (prod)
   - **Secret partagé** : la même valeur que `API_SECRET`
4. Aller sur une annonce, cliquer sur l'icône de l'extension : l'aperçu se
   remplit, écrire une note, **Sauvegarder**. L'annonce apparaît sur le site.

### Comment les données sont lues

L'extension lit les balises **OpenGraph** (`og:title`, `og:image`, `og:url`) et
les blocs **JSON-LD** (schema.org) de la page — exposés par la plupart des
portails — avec un repli générique qui fonctionne partout. Voir
[`extension/extract.js`](extension/extract.js). Les sources reconnues
(`seloger`, `leboncoin`, `bienici`, `pap`) sont taguées ; tout le reste est
`generic`.

---

## 3. Plus tard : skill Claude

Le skill consommera `GET /api/listings` (en-tête `Authorization: Bearer
<API_SECRET>`) qui renvoie toutes les annonces en JSON (notes incluses) pour
servir de base de recherche.
