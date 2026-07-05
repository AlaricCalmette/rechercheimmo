# RechercheImmo

Sauvegarde des annonces immobilières (SeLoger, LeBonCoin, Bien'ici, PAP… et
n'importe quel site) depuis une **extension Chrome**, avec une **note** sur ce
qui te plaît, vers un **site web** qui affiche tes annonces (photos + notes).
Une **routine Claude** (skill `recherche-immo`) en déduit **deux profils de
goût — achat et location —** et produit à chaque passage **deux listes de
candidats** classées, visibles sur le site.

```
rechercheImmo/
├── extension/   # Extension Chrome (Manifest V3)
├── web/         # Site + API (Next.js, déployé sur Vercel + Postgres)
└── .claude/skills/recherche-immo/   # Skill Claude (routine de recherche)
```

Pages du site :

- **/** — annonces sauvegardées (onglets Tous / Achat / Location, notes
  éditables, bascule achat↔location par carte) ;
- **/candidats** — les candidats trouvés par la routine, onglets Achat /
  Location, avec « Retirer » (simple) et « Exclure » (liste noire) ;
- **/profil** — les deux profils de goût, **entièrement éditables** :
  fourchettes, localisations, consignes libres, et traits pondérés (importance
  1-5) avec épinglage « fixé » que la routine ne modifie jamais ;
- **/exclusions** — la liste noire : une annonce exclue ne sera plus jamais
  reproposée (réintégrable d'un clic).

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

## 3. Le skill Claude (`.claude/skills/recherche-immo`)

La routine lit les annonces aimées (`GET /api/listings`, avec leur `kind`
achat/location) et la liste noire (`GET /api/blacklist`), charge et affine les
deux profils (`GET/PUT /api/profile?kind=achat|location`), cherche sur les
portails, puis publie deux listes de candidats (`POST /api/candidates`, champ
`kind` par candidat ou par lot). Toutes les requêtes portent l'en-tête
`Authorization: Bearer <API_SECRET>`.

Règles clés côté skill :

- les traits marqués **« fixé »** (`pinned: true`) dans un profil sont
  verrouillés par l'utilisateur : jamais supprimés ni repondérés ;
- le champ **consignes libres** (`instructions`) du profil est appliqué tel
  quel ;
- les URLs de la **liste noire** ne sont jamais reproposées (l'API les rejette
  aussi à l'insertion).

> **Migration** : après mise à jour du code, lancer `npm run db:push` dans
> `web/` pour créer la table `blacklist` et les colonnes `kind`
> (les données existantes sont classées « achat » par défaut).
