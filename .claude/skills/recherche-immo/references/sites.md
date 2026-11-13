# Portails immobiliers & modèles de requêtes

Objectif : couvrir un maximum de sources. La plupart des grands portails
bloquent le scraping direct et chargent leur contenu en JavaScript — on passe
donc par **WebSearch** (qui voit l'index Google) puis on tente **WebFetch** sur
les pages de résultats accessibles. Quand WebFetch est bloqué, le snippet de
recherche suffit souvent à juger la pertinence.

## Accès & fiabilité (important)

- **Liens périmés** : les URLs d'annonces issues de l'index Google sont souvent
  **mortes** (« cette annonce n'est plus disponible ») — le marché tourne vite.
  Ne te fie pas aveuglément à un lien d'annonce trouvé via WebSearch.
- **Portails bloqués / JS** : SeLoger, Bien'ici, PAP, Zimo, SuperImmo bloquent
  le fetch (403/429) ou se chargent en JavaScript → on ne peut **ni vérifier la
  disponibilité ni lire le contenu**. Utiles pour repérer, pas pour confirmer.
- **Sources lisibles (à privilégier, et à combiner : 60 % d'une liste au plus
  pour une même source)** :
  - **lesiteimmo.com** — agrégateur, la plus productive. Pages de liste par
    département : `https://www.lesiteimmo.com/acheter/maison/<nom-du-dpt>-<n°>`
    ou `…/louer/maison/<nom-du-dpt>-<n°>` (ex. `…/acheter/maison/lot-et-garonne-47`,
    `…/louer/maison/dordogne-24`) ; variantes thématiques utiles :
    `maison-caractere`, `maison-belle-vue`, `maison-jardin`, `maison-calme`.
    L'ancien format `…/<dpt>` seul renvoie 404. Fiches de détail lisibles
    (traits, date de publication, photo). Un 410 = annonce retirée.
  - **french-property.com** (`/fr/bien-a-vendre/<id>`) — agences du Sud-Ouest,
    beaucoup de bâti ancien en pierre ; fiches lisibles. Méfie-toi des fiches
    « Cette annonce a été supprimée par l'agence ».
  - **beauxvillages.com** — maisons de caractère Sud-Ouest, fiches lisibles.
  - **leggett-immo.com** — agence spécialisée bâti ancien ; les liens
    `…/printfr_pdf/…` sont des PDF : cherche la fiche HTML correspondante.
  - **locservice.fr** (location entre particuliers), paruvendu.fr, vizzit.fr :
    à tester selon les jours.
  - Bloquent la lecture (403) : optimhome.com, capifrance.fr — utiles pour
    repérer seulement.
- **Règle** : un bon candidat = lien **direct**, **vérifié actif**, et
  caractéristiques **confirmées** en lisant la page. Sinon, ses traits sont
  « à confirmer » et `reasons` commence par « Non vérifié : ».

## Portails à couvrir (France)

La plupart des généralistes couvrent **vente ET location** — c'est le chemin
d'URL qui change (`/achat` vs `/location`, « à vendre » vs « à louer »).

Généralistes (forte volumétrie, achat + location) :
- seloger.com
- leboncoin.fr
- bienici.com
- pap.fr (particulier à particulier)
- logic-immo.com
- ouestfrance-immo.com
- paruvendu.fr
- avendrealouer.fr
- immobilier.lefigaro.fr
- superimmo.com
- immobilier.notaires.fr (ventes notariales)

Réseaux d'agences (souvent fetch-friendly) :
- orpi.com
- century21.fr
- laforet.com
- guy-hoquet.com
- fnaim.fr
- iadfrance.fr
- stephaneplazaimmobilier.com

Spécialisés location (pour la liste location) :
- locservice.fr (location entre particuliers, fetch souvent lisible)
- pap.fr/annonces (section location)
- leboncoin.fr (catégorie locations)
- lesiteimmo.com `…/louer/…` (agrégateur lisible, à privilégier)
- appartager.com / lacartedescolocs.fr (si le profil pointe vers la coloc)

Selon le profil (haut de gamme, rural, neuf) :
- bellesdemeures.com, lux-residence.com (prestige)
- green-acres.fr, proprietesrurales.com (campagne / propriétés)
- french-property.com, beauxvillages.com, leggett-immo.com (bâti ancien,
  Sud-Ouest, lisibles)
- bienici.com et programmes-immobiliers (neuf)

> Adapte la liste au profil : inutile d'interroger les sites prestige si le
> budget est modeste, ou les sites ruraux si la cible est urbaine.

## Modèles de requêtes WebSearch

Combine type de bien + localisation + budget + 1-2 préférences fortes. Lance
plusieurs variantes par localisation pour élargir. **Fais des campagnes
distinctes pour l'achat et pour la location** — ne mélange pas les mots-clés.

Achat :
- Général : `<type> à vendre <ville> <budget max>€ <surface>m2 <pref forte>`
  - ex. `maison à vendre Nantes 450000€ 120m2 terrasse jardin`
- Ciblé par portail (force la source) :
  `site:seloger.com <type> <ville> <budget>`
  `site:leboncoin.fr <type> <ville> <budget>`
  `site:pap.fr <type> <ville>`

Location :
- Général : `<type> à louer <ville> <loyer max>€ <surface>m2 <pref forte>`
  - ex. `maison à louer Bergerac 900€ 100m2 jardin`
- Ciblé par portail :
  `site:bienici.com/annonce/location <ville>`
  `site:pap.fr/annonces location <ville>`
  `site:locservice.fr <ville> <type>`
  `site:leboncoin.fr location <type> <ville>`
- Attention aux unités : le budget location est un **loyer mensuel** (charges
  comprises ou non — précise « CC » / « hors charges » dans `reasons` si tu le
  sais).

Commun — préférences qualitatives explicites (le cœur de ce que l'utilisateur
aime) : ajoute les mots-clés récurrents des notes : `terrasse`,
`exposition sud`, `lumineux`, `calme`, `proche écoles`, `proche transports`,
`parking`, `garage`, `jardin`, `dernier étage`, `ancien charme`, `rénové`,
`balcon`…

## Conseils d'extraction (WebFetch)

Quand une page d'annonce se charge, récupère : prix, surface (m²), nombre de
pièces/chambres, localisation (ville/quartier/code postal), et les
caractéristiques qui matchent les préférences. Si la page est bloquée ou vide
(JS-only), ne t'acharne pas : garde l'URL + le snippet de recherche et passe à
la suivante. La largeur de couverture prime sur l'exhaustivité d'une page.

## Dédoublonnage

Une même annonce apparaît souvent sur plusieurs portails. Considère comme
doublons des candidats avec localisation + prix + surface très proches ; garde
la source la plus fiable (lien direct agence ou portail principal) et signale
les autres sources dans `reasons` si utile.
