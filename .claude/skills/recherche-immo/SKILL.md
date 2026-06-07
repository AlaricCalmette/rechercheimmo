---
name: recherche-immo
description: >-
  Recherche d'annonces immobilières à partir des annonces déjà sauvegardées
  (aimées) dans RechercheImmo. Lit les annonces via l'API GET /api/listings, en
  déduit un profil de critères (budget, localisation, surface, et surtout les
  préférences qualitatives tirées des notes « ce qui me plaît »), puis cherche
  sur un maximum de portails immobiliers et produit une liste classée des
  annonces qui correspondent le mieux. Utilise ce skill dès que l'utilisateur
  veut lancer/relancer une recherche immobilière, trouver de nouvelles annonces,
  rafraîchir ses candidats, ou faire tourner la routine RechercheImmo — même
  s'il ne nomme pas explicitement « le skill ». Conçu pour tourner aussi en
  routine planifiée, sans intervention.
---

# RechercheImmo — recherche d'annonces par l'exemple

## À quoi ça sert

L'utilisateur sauvegarde des annonces qui lui plaisent depuis une extension
Chrome, en ajoutant à chaque fois une **note expliquant ce qui lui plaît**. Ce
skill se sert de cette collection comme d'un **exemple de goût** : il en déduit
ce que l'utilisateur recherche vraiment, puis va chercher de nouvelles annonces
correspondantes sur un maximum de sites, et en livre une liste classée.

L'idée directrice : **les notes captent le goût mieux que les specs brutes**. Un
budget et une surface, beaucoup d'annonces les respectent ; ce qui distingue une
bonne annonce pour *cet* utilisateur, ce sont les choses récurrentes qu'il
remarque (terrasse, lumière, calme, charme de l'ancien, proximité écoles…). Le
scoring doit donc donner le plus de poids à ces préférences qualitatives.

## Prérequis (variables d'environnement)

Les scripts d'accès à l'API lisent :
- `RECHERCHEIMMO_API_URL` — URL du site (ex. `http://localhost:3000` en local,
  ou l'URL Vercel en prod). Défaut : `http://localhost:3000`.
- `RECHERCHEIMMO_API_SECRET` (ou `API_SECRET`) — le secret partagé, identique à
  la variable `API_SECRET` configurée côté site.

Si ces valeurs manquent, les scripts l'indiquent clairement. En routine, assure-
toi qu'elles sont définies dans l'environnement d'exécution.

## Déroulé

### Étape 0 — Récupérer les annonces aimées

Exécute le script (depuis le dossier du skill) :

```bash
node scripts/fetch_listings.mjs
```

Il imprime en JSON toutes les annonces sauvegardées. Chaque annonce contient :
`source, url, title, price, location, surface, rooms, description, notes, raw,
createdAt`. Si la liste est vide, arrête-toi et signale qu'il faut d'abord
sauvegarder des annonces depuis l'extension.

### Étape 1 — Déduire le profil de critères

À partir des annonces, synthétise un profil **explicite** (tu l'afficheras dans
le rapport, pour que l'utilisateur puisse le vérifier et le corriger) :

- **Budget** : déduis une fourchette des prix sauvegardés. Vise un *max* autour
  du prix le plus haut aimé (tolérance ~ +10 %), et un *min* raisonnable pour ne
  pas remonter des biens trop bas de gamme.
- **Localisations** : note les zones présentes, mais traite la localisation comme
  un **signal faible, pas un filtre**. Sauf si l'utilisateur fixe explicitement
  une région, **cherche largement** (plusieurs départements/régions) et classe
  sur les préférences qualitatives, pas sur la proximité géographique.
- **Type de bien** : appartement / maison / terrain… infère depuis titres,
  descriptions et notes.
- **Surface & pièces** : fourchettes observées.
- **Préférences qualitatives** : extrais les thèmes **récurrents** des `notes`
  (et descriptions). Pondère par fréquence : une préférence citée dans plusieurs
  annonces compte plus. Exemples de thèmes : terrasse/balcon, jardin, exposition
  / luminosité, calme, proximité (écoles, transports, commerces), parking/garage,
  étage élevé, charme ancien, état rénové, volume/séjour, vue…

Présente le profil sous forme de liste ordonnée par importance.

### Étape 2 — Chercher largement

Lis `references/sites.md` pour la liste des portails et les modèles de requêtes.
Stratégie :

1. Lance plusieurs `WebSearch` par **localisation** × **type de bien**,
   combinant budget + 1-2 préférences fortes. Utilise l'opérateur `site:` ciblant
   le **chemin des annonces** (ex. `site:bienici.com/annonce`,
   `site:seloger.com/annonces`, `site:pap.fr/annonces`) : c'est ce qui fait
   remonter des **annonces individuelles** plutôt que des pages d'index.
2. **Récolte les liens directs dans les résultats** (`Links`), sans dépendre du
   fetch. Une annonce individuelle se reconnaît à un identifiant / slug de bien :
   `/annonce/location/.../<id>` (Bien'ici), `...-r<chiffres>` (PAP),
   `/ad/<id>` (LeBonCoin), `....htm` avec un id (SeLoger). Le **titre** du
   résultat contient souvent prix + surface + ville — exploite-le directement.
3. **Rejette les pages d'index / recherche** comme URL de candidat : `/recherche/`,
   `/immobilier/<dpt>`, `/cl/`, `/louer/...` sans id, listes départementales.
   Le champ `url` d'un candidat **doit** pointer vers une annonce précise et
   cliquable, sinon le résultat n'a aucune valeur (c'est le piège n°1 à éviter).
4. **Méfie-toi des liens périmés.** L'index de recherche renvoie souvent des
   annonces déjà retirées (« cette annonce n'est plus disponible »). Les gros
   portails (SeLoger, Bien'ici, PAP) **bloquent le fetch ou sont en JS pur** :
   impossible d'y vérifier qu'une annonce est vivante ou d'en lire le contenu.
5. **Privilégie donc les agrégateurs lisibles** (ex. **lesiteimmo.com**) : leur
   page de recherche est récupérable par `WebFetch`, expose des **liens
   d'annonces directs et à jour**, et leurs pages de détail sont lisibles. Tu
   obtiens ainsi (a) des annonces réellement en ligne et (b) de quoi
   **confirmer les préférences** (jardin, pierre, poutres, cuisine, terrasse) en
   lisant la page — le scoring devient fiable au lieu d'être deviné — et
   **récupérer l'URL de la photo principale** (image du CDN, ex.
   `media.studio-net.fr/...`) pour remplir le champ `photos` du candidat.
6. **Vérifie chaque candidat** en lisant sa page quand c'est possible : écarte
   ceux marqués « plus disponible ». Si la source bloque, n'invente pas — soit
   tu confirmes via un agrégateur lisible, soit tu marques la caractéristique
   « à confirmer » dans `reasons`.
7. Privilégie la **largeur** (plusieurs zones/portails) et **dédoublonne** (voir
   `references/sites.md`).

Vise un vivier de ~30-60 candidats bruts avant scoring.

### Étape 3 — Scorer et classer

D'abord des **filtres éliminatoires** (ne garde que les biens plausibles) :
- **URL non directe** (page d'index/recherche, sans annonce précise) → écarter ;
- localisation : **pas un filtre par défaut** — n'écarte sur la zone que si
  l'utilisateur a fixé une région précise ;
- prix très au-dessus du budget max + tolérance → écarter ;
- type de bien différent de la cible → écarter.

Puis un **score 0-100** pour classer, pondéré ainsi (le qualitatif domine,
volontairement) :
- **Préférences qualitatives matchées : ~50 pts** — c'est le signal de goût.
- Adéquation surface / pièces : ~20 pts.
- Budget (sous le max sans être suspectement bas) : ~15 pts.
- Localisation précise (quartier exactement recherché) : ~15 pts.

Pour chaque candidat retenu, rédige un `reasons` court (1-2 phrases) **citant
les préférences précises** qui matchent — c'est ce qui rend le classement
crédible. Garde le **top 15-25**.

### Étape 4 — Livrer (les deux sorties)

**a) Rapport Markdown** dans le repo, fichier daté `resultats/AAAA-MM-JJ.md`
(crée le dossier `resultats/` au besoin), suivant le modèle ci-dessous. Si tu
commits ce rapport (cas d'une routine sur un repo), fais-le **directement sur la
branche `main`** (`git add resultats/ && git commit && git push origin main`) —
**ne crée pas de branche ni de pull request**.

**b) Envoi sur le site** : écris un JSON temporaire (modèle plus bas) puis :

```bash
node scripts/post_candidates.mjs <chemin-du-json>
```

Les candidats apparaîtront sur la page `/candidats` du site. Utilise un même
`runId` (un UUID) pour toute l'exécution ; tu peux l'omettre, l'API en générera
un.

## Modèle de rapport Markdown

```markdown
# Recherche immobilière — <date>

## Profil de critères déduit
- **Budget** : <min>–<max> €
- **Localisations** : <liste>
- **Type** : <type(s)>
- **Surface / pièces** : <fourchettes>
- **Préférences** (par importance) : 1) … 2) … 3) …

## Top annonces
### 1. <titre> — <prix> — score <n>/100
- 📍 <localisation> · <surface> · <pièces>
- 🔗 <url>  ·  source : <portail>
- ✅ Pourquoi : <reasons — préférences matchées>

### 2. …

## Sources interrogées
<liste des portails effectivement requêtés>

## Limites
<pages bloquées, infos manquantes, zones à confirmer>
```

## Modèle de JSON pour post_candidates.mjs

```json
{
  "candidates": [
    {
      "source": "seloger",
      "url": "https://...",
      "title": "Maison 5 pièces 120 m²",
      "price": 430000,
      "location": "Nantes (44000)",
      "surface": "120 m²",
      "rooms": "5 pièces, 3 chambres",
      "photos": ["https://..."],
      "score": 87,
      "reasons": "Grande terrasse exposée sud et proche écoles, deux préférences récurrentes de tes annonces aimées."
    }
  ]
}
```

`url` est requis ; les autres champs sont optionnels mais améliorent l'affichage.

## Robustesse & exécution en routine

- Ce skill est fait pour tourner **sans intervention** : ne pose pas de question,
  prends les décisions raisonnables et documente-les dans la section « Limites ».
- Les portails bloquent / changent souvent : si une source échoue, continue avec
  les autres. Mieux vaut un rapport partiel mais livré qu'un échec.
- Si `fetch_listings.mjs` ou `post_candidates.mjs` échoue (API injoignable),
  écris quand même le rapport Markdown local et signale l'échec d'envoi.
