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
`source, url, title, price, location, surface, rooms, description, notes,
dislikes, raw, createdAt`. Le champ `notes` dit **ce qui plaît** à l'utilisateur,
`dislikes` **ce qui lui déplaît** dans cette annonce. Si la liste est vide,
arrête-toi et signale qu'il faut d'abord sauvegarder des annonces depuis
l'extension.

### Étape 1 — Charger et affiner le profil de critères

Le profil est un **modèle vivant** qui s'enrichit à chaque passage : **ne le
reconstruis pas de zéro**. Charge celui déjà déduit lors des exécutions
précédentes et **affine-le** avec les nouvelles annonces.

Le profil est stocké **en base** (et consultable en lecture seule sur la page
`/profil` du site). On le lit et on le réécrit via des scripts dédiés. Schéma de
l'objet profil :

```json
{
  "version": 1,
  "updatedAt": "2026-06-13T08:00:00Z",
  "budget": { "min": 200000, "max": 450000 },
  "locations": ["Nantes (44)", "Vannes (56)"],
  "propertyTypes": ["maison"],
  "surface": { "min": 80, "max": 160 },
  "rooms": { "min": 4, "max": 6 },
  "preferences": [
    { "theme": "pierre apparente", "weight": 5, "sources": ["notes", "photos"] }
  ],
  "repulsions": [
    { "theme": "route passante", "weight": 4, "redhibitory": true }
  ],
  "analyzedListings": {
    "https://...": {
      "analyzedAt": "2026-06-10T...",
      "photoFindings": ["pierre apparente", "jardin arboré", "beaucoup de lumière"],
      "notesThemes": ["terrasse"],
      "dislikeThemes": ["route passante"]
    }
  }
}
```

Procédure d'affinage :

1. **Charge le profil** existant :

   ```bash
   node scripts/get_profile.mjs
   ```

   Il imprime l'objet profil en JSON, ou `null` si aucun n'existe encore (premier
   passage : pars d'un profil vide et construis-le).
2. **Identifie les nouveautés** : compare les `url` des annonces récupérées à la
   clé `analyzedListings`. Ne retraite que les **annonces nouvelles** (absentes
   du cache). Les annonces déjà analysées **réutilisent leurs résultats en
   cache** — c'est ce qui évite de tout refaire (et de re-télécharger / re-lire
   toutes les photos) à chaque exécution.
3. **Pour chaque nouvelle annonce**, extrais ses thèmes de `notes`, de
   `dislikes`, et — via l'analyse visuelle ci-dessous — ses `photoFindings`, puis
   ajoute l'entrée dans `analyzedListings`.
4. **Mets à jour les agrégats** (`budget`, `locations`, `surface`, `rooms`,
   `preferences`, `repulsions`) en intégrant ces nouveautés : augmente le `weight`
   des thèmes confirmés, ajoute les thèmes nouveaux, élargis prudemment les
   fourchettes. **Ne supprime pas** ce qui existe sans raison ; tu affines, tu ne
   réinitialises pas.
5. **Si une annonce aimée a disparu** de la liste (supprimée par l'utilisateur),
   tu peux retirer son entrée du cache et atténuer les poids qu'elle portait.

Le profil sera **réécrit en base** en fin d'exécution (Étape 4). Sur le site, il
est **consultable mais non éditable** : il se met à jour uniquement via le skill,
à partir des annonces aimées et annotées depuis l'extension.

À partir des annonces (et du profil chargé), le profil **explicite** que tu
afficheras dans le rapport contient :

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
- **Répulsions (ce qui déplaît)** : extrais des champs `dislikes` les défauts que
  l'utilisateur signale (ex. route passante, vis-à-vis, rez-de-chaussée, cuisine
  à refaire, sans extérieur, sombre, travaux lourds, copropriété chargée…).
  Construis-en une **liste de critères négatifs**, pondérée par fréquence :
  un défaut rejeté sur plusieurs annonces est un signal **fort**. Distingue les
  défauts **rédhibitoires** (récurrents / formulés catégoriquement) des simples
  **moins-bien** (pénalisants mais non éliminatoires). Ces répulsions sont aussi
  précieuses que les préférences : elles disent ce qu'il faut **éviter**.

#### Analyse visuelle des photos sélectionnées

Les notes disent ce que l'utilisateur a *écrit* ; les **photos qu'il a choisi**
de sauvegarder disent ce qui l'a *séduit visuellement*. Il sélectionne dans
l'extension les photos à garder : **analyse-les toutes**, pas seulement la
couverture, pour enrichir les préférences qualitatives avec des caractéristiques
que les notes ne capturent pas toujours.

**N'analyse que les annonces nouvelles** (absentes de `analyzedListings`) : les
`photoFindings` des annonces déjà vues sont en cache dans le profil, inutile
de re-télécharger et re-lire leurs photos. C'est l'étape la plus coûteuse —
c'est précisément ce que le cache évite de refaire.

1. Télécharge **toutes les photos** des annonces aimées :

   ```bash
   node scripts/download_photos.mjs
   ```

   Le script imprime un JSON `[{ url, title, photoIndex, photo, file }, …]` où
   `file` est le chemin local de l'image téléchargée et `photoIndex` sa position
   dans l'annonce (0 = couverture). Plusieurs entrées peuvent partager la même
   `url` : ce sont les différentes photos d'une même annonce. **Ignore les `url`
   déjà présentes dans `analyzedListings`** et n'ouvre que les fichiers des
   annonces nouvelles.

2. **Ouvre chaque `file` (annonce nouvelle) avec l'outil Read** (lecture d'image)
   et observe-la. Pour chacune, relève les caractéristiques visuelles dominantes,
   par exemple :
   - **type & style de bâti** : maison de ville / longère / appartement
     haussmannien / contemporain / pierre / colombages…
   - **matériaux & charme** : pierre apparente, poutres, parquet, tomettes,
     cheminée, grandes baies, verrière…
   - **état** : rénové / à rafraîchir / neuf ;
   - **extérieur** : jardin, terrasse, balcon, piscine, cour, vis-à-vis ;
   - **lumière & volumes** : très lumineux, plafonds hauts, séjour ouvert ;
   - **environnement** : urbain dense, village, campagne, vue dégagée, mer…

3. **Enregistre** les `photoFindings` de chaque nouvelle annonce dans son entrée
   `analyzedListings` du profil (cache pour les prochains passages).

4. **Agrège par annonce puis sur l'ensemble**, en repartant des agrégats déjà
   dans le profil. Pour chaque annonce, recoupe ses différentes photos
   (intérieur, extérieur, vue…) pour une lecture complète du bien ; puis, sur
   toutes les annonces (cache compris), identifie ce qui **revient souvent**
   (ex. « pierre apparente », « jardin arboré », « beaucoup de lumière ») : c'est
   un signal de goût **fort**, au même titre que les thèmes récurrents des notes
   — fusionne-les dans la liste des préférences qualitatives, en pondérant par
   fréquence (une caractéristique présente dans plusieurs annonces pèse plus
   qu'une vue dans plusieurs photos d'une seule annonce).

Robustesse : si le script échoue, si une annonce n'a pas de photo, ou si une
image est illisible, **continue sans bloquer** — l'analyse visuelle enrichit le
profil mais les notes restent la source primaire. Mentionne-le dans « Limites ».

Présente le profil sous forme de liste ordonnée par importance. Quand une
préférence vient surtout de l'analyse des photos, signale-le brièvement (ex.
« charme ancien — pierre & poutres, récurrent sur les photos aimées »).

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
- type de bien différent de la cible → écarter ;
- **défaut rédhibitoire présent** (un critère négatif fort de la liste des
  répulsions, ex. route passante, rez-de-chaussée, gros travaux) → écarter.

Puis un **score 0-100** pour classer, pondéré ainsi (le qualitatif domine,
volontairement) :
- **Préférences qualitatives matchées : ~50 pts** — c'est le signal de goût.
- Adéquation surface / pièces : ~20 pts.
- Budget (sous le max sans être suspectement bas) : ~15 pts.
- Localisation précise (quartier exactement recherché) : ~15 pts.
- **Malus répulsions : jusqu'à −40 pts** — retranche des points pour chaque
  critère négatif (non rédhibitoire) présent dans le candidat. Un bien qui coche
  des préférences mais traîne plusieurs défauts signalés doit reculer au
  classement.

Pour chaque candidat retenu, rédige un `reasons` court (1-2 phrases) **citant
les préférences précises** qui matchent — et, le cas échéant, **signale les
défauts évités** (« aucun des points que tu rejettes : pas de vis-à-vis, pas de
travaux »). Si un candidat présente un défaut mineur connu, mentionne-le
honnêtement plutôt que de le cacher. Garde le **top 15-25**.

### Étape 4 — Livrer (les trois sorties)

**a) Profil mis à jour** : écris le profil affiné dans un JSON temporaire (avec
`updatedAt` à la date du jour) puis enregistre-le en base :

```bash
node scripts/save_profile.mjs <chemin-du-json>
```

C'est la **mémoire** du skill : il sera rechargé au prochain passage pour
repartir de là, et devient visible sur la page `/profil` du site.

**b) Rapport Markdown** dans le repo, fichier daté `resultats/AAAA-MM-JJ.md`
(crée le dossier `resultats/` au besoin), suivant le modèle ci-dessous. Si tu
commits (cas d'une routine sur un repo), fais-le **directement sur la branche
`main`** (`git add resultats/ && git commit && git push origin main`) — **ne crée
pas de branche ni de pull request**.

**c) Envoi sur le site** : écris un JSON temporaire (modèle plus bas) puis :

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
- **À éviter** (répulsions) : <critères négatifs ; ⛔ = rédhibitoire>

## Top annonces
### 1. <titre> — <prix> — score <n>/100
- 📍 <localisation> · <surface> · <pièces>
- 🔗 <url>  ·  source : <portail>
- ✅ Pourquoi : <reasons — préférences matchées ; défauts évités>

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
