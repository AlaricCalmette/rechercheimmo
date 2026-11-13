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

### Étape 0 — Vérifier la base, puis récupérer annonces, liste noire et déjà-vus

**a) Base intacte ?** Le repo garde une sauvegarde de l'état dans `etat/`
(profils, liste noire, annonces aimées), réécrite à chaque passage (Étape 4e).
Commence par :

```bash
node scripts/restore_state.mjs
```

Il imprime un diagnostic JSON :
- `baseReinitialisee: true` (les deux profils ont disparu alors que la
  sauvegarde en contient) → **restaure à l'identique** avec
  `node scripts/restore_state.mjs --apply`, puis continue normalement. Signale-le
  **en tête du rapport** (et pas seulement dans « Limites »). Ne reconstruis
  jamais un profil à partir du texte d'un ancien rapport : la sauvegarde est la
  seule source fiable.
- `suspects` non vide (ex. liste noire vide en base mais pleine dans la
  sauvegarde, profils présents) → ne restaure rien (l'utilisateur a pu vider sa
  liste), mais mentionne-le en tête du rapport pour qu'il vérifie.
- Sinon, rien à faire.

Si `etat/` n'existe pas encore et que les profils sont `null`, c'est un vrai
premier passage : pars d'un profil vide.

**b) Données de travail** (depuis le dossier du skill) :

```bash
node scripts/fetch_listings.mjs
node scripts/fetch_blacklist.mjs
node scripts/fetch_known.mjs
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
Chaque entrée porte aussi `reason` (le « pourquoi » saisi par l'utilisateur
quand il exclut, sinon un texte générique) et `snapshot` (type, prix, lieu,
surface, score et détail du score au moment de l'exclusion) : ce sont des
**exemples négatifs**, exploités à l'Étape 1.

`fetch_known.mjs` imprime `{ favoris, candidats, exclus }` : tout ce que le site
connaît déjà. Un candidat dont l'URL est déjà dans `candidats` ou `favoris` est
ignoré par l'API à l'envoi : **ne le repropose pas**, consacre ta recherche aux
biens nouveaux.

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
   raison ; tu affines, tu ne réinitialises pas. Un poids ne monte que
   lorsqu'une **nouvelle annonce aimée** le confirme : un passage sans annonce
   nouvelle ne change aucun poids.
3bis. **Garde un profil discriminant** (sinon tous les biens finissent au même
   score) :
   - **5 préférences à 5/5 au plus**, épinglées comprises. Au-delà, redescends
     à 4 les traits non épinglés les moins confirmés (le moins d'annonces
     aimées / de photos qui les portent).
   - **Fusionne les thèmes quasi identiques** en un seul (garde le libellé le
     plus court et clair, le poids le plus haut ; jamais pour un trait épinglé).
   - Libellés **courts** (≤ 8 mots) : les détails (exemples de matériaux,
     régions…) n'ont pas leur place dans `theme`.
   - **15 localisations au plus** : regroupe par département ou région.
3ter. **Apprends des exclusions** (`entries` de la liste noire, Étape 0) :
   - une `reason` écrite par l'utilisateur est un signal fort : transforme-la
     en répulsion (ou renforce la répulsion existante qui y correspond) ;
   - sans raison, cherche ce que les biens exclus d'un même `kind` ont en
     commun dans leur `snapshot` (zone, fourchette de prix, type, trait qui
     portait le score) : un motif qui revient sur **3 exclusions ou plus**
     devient une répulsion de poids 2, non rédhibitoire. Une exclusion isolée
     sans raison ne prouve rien : ignore-la.
   - Ne touche jamais aux traits épinglés pour autant.
4. **Si une annonce aimée a disparu** de la liste (supprimée par
   l'utilisateur), tu peux retirer son entrée du cache et atténuer les poids
   qu'elle portait (jamais ceux des traits épinglés). Exception : si **toutes**
   les annonces ont disparu d'un coup, c'est probablement une perte de données
   (voir Étape 0a) : ne touche ni au cache ni aux poids.
5. **Si un `kind` n'a ni annonces aimées ni profil existant**, ne l'invente
   pas : saute sa recherche et note-le dans « Limites » du rapport. S'il a un
   profil (édité à la main par l'utilisateur) mais aucune annonce aimée, la
   recherche se fait sur la seule base du profil — c'est un cas prévu.

Garde une copie **non modifiée** de chaque profil chargé (ex.
`profil-achat-avant.json`) : elle sert au contrôle de l'Étape 4a. Les deux
profils seront **réécrits en base** en fin d'exécution (Étape 4).

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
4. **Écarte immédiatement toute URL présente dans la liste noire** (Étape 0),
   ainsi que celles déjà connues du site (`candidats` et `favoris` de
   `fetch_known.mjs`).
5. **Méfie-toi des liens périmés.** L'index de recherche renvoie souvent des
   annonces retirées. Les gros portails (SeLoger, Bien'ici, PAP) **bloquent le
   fetch ou sont en JS pur** : impossible d'y vérifier qu'une annonce est
   vivante.
6. **Privilégie donc les agrégateurs lisibles** (ex. **lesiteimmo.com**) : page
   de recherche récupérable par `WebFetch`, **liens d'annonces directs et à
   jour**, pages de détail lisibles — de quoi **confirmer les préférences** et
   **récupérer l'URL de la photo principale** pour le champ `photos`.
7. **Vérifie TOUS les candidats retenus**, pas seulement le haut de liste : lis
   la page de chacun (une lecture coûte peu sur les sources lisibles), écarte
   ceux marqués « plus disponible » / vendu / loué ou qui renvoient 404-410,
   relève les traits réellement présents et l'URL de la photo principale. Si la
   source bloque, n'invente pas : le candidat reste possible mais ses traits
   sont « à confirmer », et `reasons` commence par « Non vérifié : ».
8. Privilégie la **largeur** (plusieurs zones/portails) et **dédoublonne**
   (voir `references/sites.md`).
9. **Diversifie les sources** : une même source ne doit pas fournir plus de
   **60 % d'une liste**. Interroge au moins **trois sources lisibles** par
   campagne (voir `references/sites.md` : lesiteimmo, french-property,
   leggett-immo, beauxvillages, locservice…). Si la diversité est impossible ce
   jour-là, dis-le dans « Limites » avec les sources essayées.

Vise un vivier de ~30-60 candidats bruts **par liste** avant scoring. Si un
`kind` est sauté (pas de profil, pas d'annonces), dis-le dans le rapport au
lieu de forcer une liste vide de sens.

### Étape 3 — Scorer et classer (chaque liste séparément)

D'abord des **filtres éliminatoires** (ne garde que les biens plausibles) :
- **URL en liste noire ou déjà connue du site** → écarter, sans exception ;
- **URL non directe** (page d'index/recherche) → écarter ;
- localisation : **pas un filtre par défaut** — n'écarte sur la zone que si
  l'utilisateur a fixé une région précise (profil ou `instructions`) ;
- type de bien différent de la cible → écarter.

Le prix hors budget (+10 %) et les défauts rédhibitoires confirmés sont
éliminés par le script de score ci-dessous.

**Le score n'est pas estimé à la main : il est calculé par `score.mjs`**, pour
qu'il soit stable d'un passage à l'autre et que son détail tombe juste. Ton
travail est le **jugement** : pour chaque candidat, ajoute un champ `match` au
JSON du lot :

```json
"match": {
  "preferences": [
    { "trait": "pierre apparente", "status": "confirmé" },
    { "trait": "garage", "status": "à confirmer" }
  ],
  "repulsions": [ { "trait": "route passante", "status": "confirmé" } ],
  "location": "exacte"
}
```

- `trait` = le `theme` **exact** du profil du même `kind` (le script refuse un
  libellé inconnu et liste les fautifs : corrige et relance).
- `status` : `"confirmé"` si tu l'as lu sur la page de l'annonce ou vu sur ses
  photos, `"à confirmer"` s'il n'est que probable (titre, snippet, page non
  lisible).
- `location` : `"exacte"` (zone recherchée, ou profil sans restriction de
  zone), `"proche"`, `"hors zone"`.

Puis lance, pour chaque liste :

```bash
node scripts/score.mjs <profil-affiné.json> <candidats.json>
```

Le script remplit `score` et `scoreDetails` (préférences : poids × 3, ou × 1,5
si « à confirmer », plafond 50 ; surface/pièces 20 ; budget 15 ; localisation
15 ; répulsions jusqu'à −40), retire `match`, trie par score et retire les
éliminés (listés dans `excluded`, à mentionner dans « Limites »). Les libellés
de `scoreDetails` sont ceux du profil : le site les affiche sous chaque
candidat (« Pourquoi ce score ? ») et dans le comparateur.

Rédige ensuite, pour chaque candidat, un `reasons` court (1-2 phrases) **citant
les préférences précises** qui matchent — et, le cas échéant, **les défauts
évités**. Mentionne honnêtement un défaut mineur connu. Garde le **top 15-25
par liste**.

Un candidat que l'utilisateur a « aimé » sur le site (bouton ♥) est transféré
dans ses annonces sauvegardées : il réapparaît donc à l'Étape 0 comme une
annonce aimée, à analyser comme les autres (son champ `raw.fromCandidate`
garde le score et les raisons d'origine).

### Étape 4 — Livrer (les sorties, en double)

Génère **un seul `runId`** (UUID) pour toute l'exécution — il est partagé par
les deux listes.

**a) Profils mis à jour** : écris chaque profil affiné dans un JSON temporaire
(avec `updatedAt` à la date du jour), **contrôle-le**, puis enregistre-le :

```bash
node scripts/check_profile.mjs <profil-achat-avant.json> <profil-achat.json>
node scripts/save_profile.mjs achat <profil-achat.json>
node scripts/check_profile.mjs <profil-location-avant.json> <profil-location.json>
node scripts/save_profile.mjs location <profil-location.json>
```

`check_profile.mjs` sort en erreur si un trait épinglé, les consignes ou le
plan de financement ont bougé : corrige avant d'enregistrer. Ses
avertissements (trop de 5/5, thèmes à fusionner, trop de zones) se corrigent
aussi, sauf raison que tu expliques dans « Limites ». C'est la **mémoire** du
skill ; les profils restent éditables sur `/profil`.

**b) Rapport Markdown** dans le repo, fichier daté `resultats/AAAA-MM-JJ.md`
(crée le dossier `resultats/` au besoin), suivant le modèle ci-dessous — avec
**une section Achat et une section Location**. Il est commité à l'étape e.

**c) Envoi sur le site** : écris un (ou deux) JSON temporaire(s) puis :

```bash
node scripts/post_candidates.mjs <chemin-du-json>
```

Chaque candidat doit porter son `kind` (`"achat"` ou `"location"`) — ou envoie
deux lots avec un `kind` de lot. **Réutilise le même `runId` dans les deux
appels.** Les candidats apparaissent sur la page `/candidats` du site, onglets
Achat / Location. La réponse indique `blacklisted` : le nombre de candidats
rejetés car exclus — si tu as bien filtré à l'Étape 2/3, il doit être 0.
Chaque passage est enregistré dans l'historique du site (`/historique`).

**d) Veille des annonces sauvegardées** : revisite chaque annonce aimée
récupérée à l'Étape 0 (avec tes outils de navigation habituels, qui passent
mieux les protections anti-bot qu'un simple fetch) et note :
- `"state": "gone"` si l'annonce n'existe plus (404, « annonce expirée /
  supprimée », bien vendu ou loué, redirection vers une page de résultats) ;
- `"state": "ok"` et le **prix actuel** sinon.

Envoie le tout en un seul appel (ignore les annonces que tu n'as pas pu lire,
plutôt que de deviner) :

```bash
node scripts/post_checks.mjs <chemin-du-json>
```

```json
{ "checks": [ { "id": "<id de l'annonce>", "state": "ok", "price": 245000 },
              { "url": "https://...", "state": "gone" } ] }
```

Le site garde l'historique des prix et affiche les baisses (↓ x %) et les
annonces disparues sur `/`. Mentionne les baisses de prix et les disparitions
dans le rapport Markdown (section « Veille »), ainsi que le nombre d'annonces
que tu n'as **pas pu contrôler** (portails qui bloquent la lecture) : la veille
ne couvre que ce qui est lisible. Une annonce disparue reste une bonne source
d'apprentissage pour le profil : continue de l'analyser.

**e) Sauvegarde de l'état et commit** — toujours en dernier, après
l'enregistrement des profils :

```bash
node scripts/snapshot_state.mjs
```

Il réécrit `etat/` à la racine du repo (profils, liste noire, annonces
aimées). Il ne remplace jamais une sauvegarde non vide par une base vide :
s'il indique « CONSERVÉ », signale-le dans le rapport (base peut-être vidée).

Puis commite **le rapport et `etat/` directement sur `main`**, depuis la
racine du repo — pas de branche `claude/…`, pas de pull request :

```bash
git fetch origin main
git checkout -B main origin/main
git add resultats/ etat/
git commit -m "Rapport RechercheImmo AAAA-MM-JJ (achat N + location M)"
git push origin main
```

Les fichiers non suivis (rapport, `etat/`) survivent au `checkout`. N'ajoute
pas d'option d'identité (`-c user.name=…`, `--author`) : garde celle de
l'environnement. Si le push est refusé (conflit), fais `git pull --rebase
origin main` puis un seul nouvel essai. S'il échoue encore, ou si l'outil
refuse de pousser sur `main`, pousse sur la branche courante et écris-le en
tête du rapport et dans ton message final, avec le nom de la branche.

## Modèle de rapport Markdown

```markdown
# Recherche immobilière — <date>

> <seulement si besoin : base restaurée depuis etat/, éléments suspects,
> commit poussé ailleurs que sur main>

- **Nouveautés** : <n> achat + <m> location jamais proposés auparavant
- **Vérifiés en ligne** : <x>/<n> achat, <y>/<m> location

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

## 🔎 Veille des annonces sauvegardées
- ↓ <titre> : <ancien prix> → <nouveau prix> (−x %)
- ⛔ <titre> : annonce disparue
(ou « aucun changement »)

## Sources interrogées
<liste des portails effectivement requêtés, par liste, avec la part de chaque
source dans la liste finale>

## Ce que la routine a appris
<répulsions ajoutées ou renforcées à partir des exclusions, poids modifiés,
thèmes fusionnés — ou « rien de nouveau »>

## Limites
<pages bloquées, infos manquantes, kind sauté et pourquoi, candidats éliminés
par score.mjs, avertissements de check_profile laissés…>
```

## Modèle de JSON pour post_candidates.mjs

Avant `score.mjs`, chaque candidat porte `match` (voir Étape 3) et pas encore
de `score` ; après, il ressemble à ceci :

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
      "score": 71,
      "reasons": "Pierre apparente et jardin arboré, tes deux préférences essentielles ; aucun défaut rédhibitoire.",
      "scoreDetails": [
        { "label": "pierre apparente", "points": 15 },
        { "label": "jardin arboré", "points": 12 },
        { "label": "surface / pièces", "points": 20 },
        { "label": "budget", "points": 15 },
        { "label": "localisation", "points": 15 },
        { "label": "route passante", "points": -6 }
      ]
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
