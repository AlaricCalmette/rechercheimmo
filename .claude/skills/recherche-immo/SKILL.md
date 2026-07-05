---
name: recherche-immo
description: >-
  Recherche d'annonces immobilières à partir des annonces déjà sauvegardées
  (aimées) dans RechercheImmo. Lit les annonces via l'API GET /api/listings,
  entretient DEUX profils de critères — un profil ACHAT et un profil LOCATION —
  (budget, localisation, surface, et surtout les préférences qualitatives
  tirées des notes « ce qui me plaît » et des réglages faits par l'utilisateur
  sur la page /profil), puis cherche sur un maximum de portails immobiliers et
  produit à chaque exécution DEUX listes classées : une d'annonces à acheter,
  une d'annonces à louer. Respecte la liste noire (annonces exclues) et les
  traits « fixés » par l'utilisateur. Utilise ce skill dès que l'utilisateur
  veut lancer/relancer une recherche immobilière, trouver de nouvelles
  annonces, rafraîchir ses candidats, ou faire tourner la routine
  RechercheImmo — même s'il ne nomme pas explicitement « le skill ». Conçu pour
  tourner aussi en routine planifiée, sans intervention.
---

# RechercheImmo — recherche d'annonces par l'exemple

## À quoi ça sert

L'utilisateur sauvegarde des annonces qui lui plaisent depuis une extension
Chrome, en ajoutant à chaque fois une **note expliquant ce qui lui plaît**. Ce
skill se sert de cette collection comme d'un **exemple de goût** : il en déduit
ce que l'utilisateur recherche vraiment, puis va chercher de nouvelles annonces
correspondantes sur un maximum de sites, et livre **deux listes classées à
chaque exécution : une liste ACHAT et une liste LOCATION**.

L'idée directrice : **les notes captent le goût mieux que les specs brutes**. Un
budget et une surface, beaucoup d'annonces les respectent ; ce qui distingue une
bonne annonce pour *cet* utilisateur, ce sont les choses récurrentes qu'il
remarque (terrasse, lumière, calme, charme de l'ancien, proximité écoles…). Le
scoring doit donc donner le plus de poids à ces préférences qualitatives.

Deux axes structurent tout le déroulé :

- **`kind`** : chaque annonce aimée, chaque profil et chaque candidat est soit
  `achat` soit `location`. Les deux pipelines sont indépendants (budgets sans
  commune mesure : prix de vente vs loyer mensuel).
- **Contrôle utilisateur** : l'utilisateur peut désormais **éditer les profils**
  sur la page `/profil` du site (poids d'importance 1-5, traits « fixés »,
  consignes libres) et **exclure définitivement** des annonces (liste noire).
  Le skill doit respecter ces deux mécanismes à la lettre (voir Étapes 1 et 3).

## Prérequis (variables d'environnement)

Les scripts d'accès à l'API lisent :
- `RECHERCHEIMMO_API_URL` — URL du site (ex. `http://localhost:3000` en local,
  ou l'URL Vercel en prod). Défaut : `http://localhost:3000`.
- `RECHERCHEIMMO_API_SECRET` (ou `API_SECRET`) — le secret partagé, identique à
  la variable `API_SECRET` configurée côté site.

Si ces valeurs manquent, les scripts l'indiquent clairement. En routine, assure-
toi qu'elles sont définies dans l'environnement d'exécution.

## Déroulé

### Étape 0 — Récupérer les annonces aimées et la liste noire

Exécute les scripts (depuis le dossier du skill) :

```bash
node scripts/fetch_listings.mjs
node scripts/fetch_blacklist.mjs
```

`fetch_listings.mjs` imprime en JSON toutes les annonces sauvegardées. Chaque
annonce contient : `source, url, title, price, location, surface, rooms,
description, notes, dislikes, kind, raw, createdAt`. Le champ `notes` dit **ce
qui plaît** à l'utilisateur, `dislikes` **ce qui lui déplaît**, et **`kind`
(`achat` | `location`) dit à quel projet l'annonce appartient** — sépare la
collection en deux dès maintenant. Si la liste est vide, arrête-toi et signale
qu'il faut d'abord sauvegarder des annonces depuis l'extension.

`fetch_blacklist.mjs` imprime `{ count, urls, entries }` : les **annonces
exclues définitivement** depuis le site. Garde `urls` sous la main : **aucun
candidat ne doit porter une de ces URLs** (l'API les rejettera de toute façon,
mais ne gaspille pas de place dans tes listes avec des candidats morts-nés).

### Étape 1 — Charger et affiner les DEUX profils

Il y a **deux profils persistants**, un par `kind`. Chacun est un **modèle
vivant** qui s'enrichit à chaque passage : **ne le reconstruis pas de zéro**.
Charge-les :

```bash
node scripts/get_profile.mjs achat
node scripts/get_profile.mjs location
```

Chaque script imprime l'objet profil en JSON, ou `null` s'il n'existe pas
encore (pars alors d'un profil vide pour ce `kind`). Schéma :

```json
{
  "version": 1,
  "updatedAt": "2026-07-05T08:00:00Z",
  "budget": { "min": 200000, "max": 450000 },
  "locations": ["Villeneuve-sur-Lot (47)", "Bergerac (24)"],
  "propertyTypes": ["maison"],
  "surface": { "min": 80, "max": 160 },
  "rooms": { "min": 4, "max": 6 },
  "instructions": "consignes libres écrites par l'utilisateur sur /profil",
  "preferences": [
    { "theme": "pierre apparente", "weight": 5, "pinned": true, "sources": ["notes", "photos"] }
  ],
  "repulsions": [
    { "theme": "route passante", "weight": 4, "redhibitory": true, "pinned": false }
  ],
  "analyzedListings": {
    "https://...": {
      "analyzedAt": "2026-06-10T...",
      "photoFindings": ["pierre apparente", "jardin arboré"],
      "notesThemes": ["terrasse"],
      "dislikeThemes": ["route passante"]
    }
  }
}
```

#### Le profil est désormais co-édité par l'utilisateur — règles impératives

La page `/profil` du site permet à l'utilisateur de modifier chaque profil :
fourchettes, localisations, consignes libres, et traits avec **poids
d'importance (1-5, 5 = essentiel)**. Le skill doit composer avec :

1. **`pinned: true`** sur une préférence ou répulsion = trait **verrouillé par
   l'utilisateur**. Tu le **recopies tel quel** dans le profil sauvegardé :
   même `theme`, même `weight`, même `redhibitory`, même `pinned`. Tu ne le
   supprimes jamais, tu ne le repondères jamais — même si tes analyses
   suggèrent autre chose. Seuls les traits non épinglés sont affinables.
2. **`instructions`** est un texte libre de consignes : **lis-le et
   applique-le** (zones à privilégier, critères à ignorer, etc.). Recopie-le
   inchangé dans le profil sauvegardé.
3. Les **fourchettes** (budget, surface, pièces), `locations` et
   `propertyTypes` édités par l'utilisateur sont ta base : tu peux les élargir
   *prudemment* si les nouvelles annonces aimées le justifient, mais ne les
   contredis pas brutalement (ex. ne remonte pas un budget max que
   l'utilisateur vient de baisser — en cas de doute, la valeur du profil
   chargé fait foi).
4. Le poids d'un trait (1-5) est ton **signal de pondération du scoring** : un
   trait à 5 pèse beaucoup plus qu'un trait à 2.

#### Procédure d'affinage (à faire séparément pour chaque `kind`)

1. **Identifie les nouveautés** : compare les `url` des annonces de ce `kind`
   à la clé `analyzedListings` de son profil. Ne retraite que les **annonces
   nouvelles** (absentes du cache). Les annonces déjà analysées **réutilisent
   leurs résultats en cache** — c'est ce qui évite de tout refaire (et de
   re-télécharger / re-lire toutes les photos) à chaque exécution.
2. **Pour chaque nouvelle annonce**, extrais ses thèmes de `notes`, de
   `dislikes`, et — via l'analyse visuelle ci-dessous — ses `photoFindings`,
   puis ajoute l'entrée dans `analyzedListings` du profil concerné.
3. **Mets à jour les agrégats** (`budget`, `locations`, `surface`, `rooms`,
   `preferences`, `repulsions`) en intégrant ces nouveautés : augmente le
   `weight` des thèmes confirmés (non épinglés), ajoute les thèmes nouveaux,
   élargis prudemment les fourchettes. **Ne supprime pas** ce qui existe sans
   raison ; tu affines, tu ne réinitialises pas.
4. **Si une annonce aimée a disparu** de la liste (supprimée par
   l'utilisateur), tu peux retirer son entrée du cache et atténuer les poids
   qu'elle portait (jamais ceux des traits épinglés).
5. **Si un `kind` n'a ni annonces aimées ni profil existant**, ne l'invente
   pas : saute sa recherche et note-le dans « Limites » du rapport. S'il a un
   profil (édité à la main par l'utilisateur) mais aucune annonce aimée, la
   recherche se fait sur la seule base du profil — c'est un cas prévu.

Les deux profils seront **réécrits en base** en fin d'exécution (Étape 4).

À partir des annonces (et du profil chargé), le profil **explicite** que tu
afficheras dans le rapport contient :

- **Budget** : déduis une fourchette des prix sauvegardés — pour la location,
  ce sont des **loyers mensuels**. Vise un *max* autour du prix le plus haut
  aimé (tolérance ~ +10 %), et un *min* raisonnable pour ne pas remonter des
  biens trop bas de gamme.
- **Localisations** : note les zones présentes, mais traite la localisation
  comme un **signal faible, pas un filtre**. Sauf si l'utilisateur fixe
  explicitement une région (profil ou `instructions`), **cherche largement**
  (plusieurs départements/régions) et classe sur les préférences qualitatives.
- **Type de bien** : appartement / maison / terrain… infère depuis titres,
  descriptions et notes.
- **Surface & pièces** : fourchettes observées.
- **Préférences qualitatives** : extrais les thèmes **récurrents** des `notes`
  (et descriptions). Pondère par fréquence : une préférence citée dans
  plusieurs annonces compte plus. Exemples : terrasse/balcon, jardin,
  exposition / luminosité, calme, proximité (écoles, transports, commerces),
  parking/garage, étage élevé, charme ancien, état rénové, volume/séjour, vue…
- **Répulsions (ce qui déplaît)** : extrais des champs `dislikes` les défauts
  signalés (route passante, vis-à-vis, rez-de-chaussée, cuisine à refaire,
  sans extérieur, sombre, travaux lourds…). Liste de critères négatifs
  pondérée par fréquence ; distingue les défauts **rédhibitoires** (récurrents
  / formulés catégoriquement / cochés ⛔ par l'utilisateur) des simples
  **moins-bien**.

#### Analyse visuelle des photos sélectionnées

Les notes disent ce que l'utilisateur a *écrit* ; les **photos qu'il a choisi**
de sauvegarder disent ce qui l'a *séduit visuellement*. Il sélectionne dans
l'extension les photos à garder : **analyse-les toutes**, pas seulement la
couverture.

**N'analyse que les annonces nouvelles** (absentes de `analyzedListings` du
profil de leur `kind`) : les `photoFindings` des annonces déjà vues sont en
cache. C'est l'étape la plus coûteuse — c'est précisément ce que le cache
évite de refaire.

1. Télécharge **toutes les photos** des annonces aimées :

   ```bash
   node scripts/download_photos.mjs
   ```

   Le script imprime un JSON `[{ url, title, photoIndex, photo, file }, …]` où
   `file` est le chemin local de l'image téléchargée et `photoIndex` sa
   position dans l'annonce (0 = couverture). **Ignore les `url` déjà présentes
   dans `analyzedListings`** et n'ouvre que les fichiers des annonces
   nouvelles.

2. **Ouvre chaque `file` (annonce nouvelle) avec l'outil Read** (lecture
   d'image) et observe-la : type & style de bâti, matériaux & charme (pierre,
   poutres, parquet, cheminée…), état, extérieur (jardin, terrasse, piscine,
   vis-à-vis), lumière & volumes, environnement.

3. **Enregistre** les `photoFindings` de chaque nouvelle annonce dans son
   entrée `analyzedListings` (cache pour les prochains passages).

4. **Agrège par annonce puis sur l'ensemble** (du même `kind`), en repartant
   des agrégats déjà dans le profil : ce qui **revient souvent** est un signal
   de goût **fort** — fusionne-le dans les préférences qualitatives, pondéré
   par fréquence.

Robustesse : si le script échoue, si une annonce n'a pas de photo, ou si une
image est illisible, **continue sans bloquer** — les notes restent la source
primaire. Mentionne-le dans « Limites ».

### Étape 2 — Chercher largement (une recherche par profil)

Lis `references/sites.md` : il contient les portails et modèles de requêtes
**pour la vente ET pour la location**. Fais **deux campagnes de recherche
indépendantes** — d'abord l'achat, puis la location (ou l'inverse), chacune
guidée par son profil. Stratégie (identique pour les deux, seuls les
mots-clés changent : « à vendre » vs « à louer », budget vs loyer) :

1. Lance plusieurs `WebSearch` par **localisation** × **type de bien**,
   combinant budget + 1-2 préférences fortes. Utilise l'opérateur `site:`
   ciblant le **chemin des annonces** (ex. `site:bienici.com/annonce`,
   `site:seloger.com/annonces`, `site:pap.fr/annonces`) : c'est ce qui fait
   remonter des **annonces individuelles** plutôt que des pages d'index.
2. **Récolte les liens directs dans les résultats** (`Links`), sans dépendre du
   fetch. Une annonce individuelle se reconnaît à un identifiant / slug de
   bien : `/annonce/location/.../<id>` ou `/annonce/vente/.../<id>` (Bien'ici),
   `...-r<chiffres>` (PAP), `/ad/<id>` (LeBonCoin), `....htm` avec un id
   (SeLoger). Le **titre** du résultat contient souvent prix + surface + ville.
3. **Rejette les pages d'index / recherche** comme URL de candidat :
   `/recherche/`, `/immobilier/<dpt>`, `/cl/`, `/louer/...` sans id, listes
   départementales. Le champ `url` d'un candidat **doit** pointer vers une
   annonce précise et cliquable (piège n°1 à éviter).
4. **Écarte immédiatement toute URL présente dans la liste noire** (Étape 0).
5. **Méfie-toi des liens périmés.** L'index de recherche renvoie souvent des
   annonces retirées. Les gros portails (SeLoger, Bien'ici, PAP) **bloquent le
   fetch ou sont en JS pur** : impossible d'y vérifier qu'une annonce est
   vivante.
6. **Privilégie donc les agrégateurs lisibles** (ex. **lesiteimmo.com**) : page
   de recherche récupérable par `WebFetch`, **liens d'annonces directs et à
   jour**, pages de détail lisibles — de quoi **confirmer les préférences** et
   **récupérer l'URL de la photo principale** pour le champ `photos`.
7. **Vérifie chaque candidat** en lisant sa page quand c'est possible : écarte
   ceux marqués « plus disponible ». Si la source bloque, n'invente pas —
   marque la caractéristique « à confirmer » dans `reasons`.
8. Privilégie la **largeur** (plusieurs zones/portails) et **dédoublonne**
   (voir `references/sites.md`).

Vise un vivier de ~30-60 candidats bruts **par liste** avant scoring. Si un
`kind` est sauté (pas de profil, pas d'annonces), dis-le dans le rapport au
lieu de forcer une liste vide de sens.

### Étape 3 — Scorer et classer (chaque liste séparément)

D'abord des **filtres éliminatoires** (ne garde que les biens plausibles) :
- **URL en liste noire** → écarter, sans exception ;
- **URL non directe** (page d'index/recherche) → écarter ;
- localisation : **pas un filtre par défaut** — n'écarte sur la zone que si
  l'utilisateur a fixé une région précise (profil ou `instructions`) ;
- prix très au-dessus du budget max + tolérance → écarter ;
- type de bien différent de la cible → écarter ;
- **défaut rédhibitoire présent** (répulsion `redhibitory: true`) → écarter.

Puis un **score 0-100** pour classer, pondéré ainsi (le qualitatif domine,
volontairement) :
- **Préférences qualitatives matchées : ~50 pts** — proportionnellement au
  `weight` (1-5) de chaque trait ; un trait `weight: 5` (essentiel) domine.
- Adéquation surface / pièces : ~20 pts.
- Budget (sous le max sans être suspectement bas) : ~15 pts.
- Localisation précise (zone exactement recherchée) : ~15 pts.
- **Malus répulsions : jusqu'à −40 pts** — proportionnel au `weight` des
  critères négatifs (non rédhibitoires) présents.

Pour chaque candidat retenu, rédige un `reasons` court (1-2 phrases) **citant
les préférences précises** qui matchent — et, le cas échéant, **signale les
défauts évités**. Si un candidat présente un défaut mineur connu, mentionne-le
honnêtement. Garde le **top 15-25 par liste**.

### Étape 4 — Livrer (les sorties, en double)

Génère **un seul `runId`** (UUID) pour toute l'exécution — il est partagé par
les deux listes.

**a) Profils mis à jour** : écris chaque profil affiné dans un JSON temporaire
(avec `updatedAt` à la date du jour) puis enregistre-les :

```bash
node scripts/save_profile.mjs achat <chemin-profil-achat.json>
node scripts/save_profile.mjs location <chemin-profil-location.json>
```

C'est la **mémoire** du skill ; les profils restent éditables sur `/profil`.
Rappel : les traits `pinned` et le champ `instructions` doivent y figurer
**inchangés**.

**b) Rapport Markdown** dans le repo, fichier daté `resultats/AAAA-MM-JJ.md`
(crée le dossier `resultats/` au besoin), suivant le modèle ci-dessous — avec
**une section Achat et une section Location**. Si tu commits (cas d'une routine
sur un repo), fais-le **directement sur la branche `main`** (`git add
resultats/ && git commit && git push origin main`) — **ne crée pas de branche
ni de pull request**.

**c) Envoi sur le site** : écris un (ou deux) JSON temporaire(s) puis :

```bash
node scripts/post_candidates.mjs <chemin-du-json>
```

Chaque candidat doit porter son `kind` (`"achat"` ou `"location"`) — ou envoie
deux lots avec un `kind` de lot. **Réutilise le même `runId` dans les deux
appels.** Les candidats apparaissent sur la page `/candidats` du site, onglets
Achat / Location. La réponse indique `blacklisted` : le nombre de candidats
rejetés car exclus — si tu as bien filtré à l'Étape 2/3, il doit être 0.

## Modèle de rapport Markdown

```markdown
# Recherche immobilière — <date>

## 🏠 Achat

### Profil de critères
- **Budget** : <min>–<max> €
- **Localisations** : <liste>
- **Type** : <type(s)>
- **Surface / pièces** : <fourchettes>
- **Préférences** (par importance ; 📌 = fixé par l'utilisateur) : 1) … 2) …
- **À éviter** : <critères négatifs ; ⛔ = rédhibitoire>
- **Consignes** : <instructions utilisateur, si présentes>

### Top annonces
#### 1. <titre> — <prix> — score <n>/100
- 📍 <localisation> · <surface> · <pièces>
- 🔗 <url>  ·  source : <portail>
- ✅ Pourquoi : <reasons — préférences matchées ; défauts évités>

## 🔑 Location

### Profil de critères
- **Loyer** : <min>–<max> €/mois
- …(même structure)

### Top annonces
…

## Sources interrogées
<liste des portails effectivement requêtés, par liste>

## Limites
<pages bloquées, infos manquantes, kind sauté et pourquoi, candidats exclus
par la liste noire…>
```

## Modèle de JSON pour post_candidates.mjs

```json
{
  "runId": "9c6f7e3a-…",
  "kind": "achat",
  "candidates": [
    {
      "source": "seloger",
      "url": "https://...",
      "title": "Maison 5 pièces 120 m²",
      "price": 430000,
      "location": "Villeneuve-sur-Lot (47300)",
      "surface": "120 m²",
      "rooms": "5 pièces, 3 chambres",
      "photos": ["https://..."],
      "score": 87,
      "reasons": "Pierre apparente et jardin arboré, tes deux préférences essentielles ; aucun défaut rédhibitoire."
    }
  ]
}
```

`url` est requis ; `kind` peut aussi être posé candidat par candidat. Les
autres champs sont optionnels mais améliorent l'affichage.

## Robustesse & exécution en routine

- Ce skill est fait pour tourner **sans intervention** : ne pose pas de
  question, prends les décisions raisonnables et documente-les dans « Limites ».
- Les portails bloquent / changent souvent : si une source échoue, continue
  avec les autres. Mieux vaut un rapport partiel mais livré qu'un échec.
- Si un des deux `kind` n'a rien produit (pas de profil, pas d'annonces aimées,
  recherche infructueuse), livre quand même l'autre liste et explique dans
  « Limites ».
- Si `fetch_listings.mjs` ou `post_candidates.mjs` échoue (API injoignable),
  écris quand même le rapport Markdown local et signale l'échec d'envoi.
