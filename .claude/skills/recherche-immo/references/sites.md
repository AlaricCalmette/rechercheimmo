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
- **Agrégateurs lisibles (à privilégier)** : **lesiteimmo.com** est
  récupérable par WebFetch — sa page de recherche `…/louer/maison-jardin/<dpt>`
  liste des annonces **à jour** avec leurs **liens directs**, et ses pages de
  détail sont lisibles (on peut confirmer pierre/poutres/jardin/cuisine). C'est
  la source la plus sûre pour produire des candidats **vivants et vérifiés**.
  Teste aussi vizzit.fr, paruvendu.fr, locservice.fr comme sources lisibles.
- **Règle** : un bon candidat = lien **direct**, **vérifié actif**, et idéalement
  caractéristiques **confirmées** en lisant la page. Sinon, marque « à confirmer ».

## Portails à couvrir (France)

Généralistes (forte volumétrie) :
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

Selon le profil (haut de gamme, rural, neuf) :
- bellesdemeures.com, lux-residence.com (prestige)
- green-acres.fr, proprietesrurales.com (campagne / propriétés)
- bienici.com et programmes-immobiliers (neuf)

> Adapte la liste au profil : inutile d'interroger les sites prestige si le
> budget est modeste, ou les sites ruraux si la cible est urbaine.

## Modèles de requêtes WebSearch

Combine type de bien + localisation + budget + 1-2 préférences fortes. Lance
plusieurs variantes par localisation pour élargir.

- Général : `<type> à vendre <ville> <budget max>€ <surface>m2 <pref forte>`
  - ex. `maison à vendre Nantes 450000€ 120m2 terrasse jardin`
- Ciblé par portail (force la source) :
  `site:seloger.com <type> <ville> <budget>`
  `site:leboncoin.fr <type> <ville> <budget>`
  `site:pap.fr <type> <ville>`
- Préférences qualitatives explicites (le cœur de ce que l'utilisateur aime) :
  ajoute les mots-clés récurrents des notes : `terrasse`, `exposition sud`,
  `lumineux`, `calme`, `proche écoles`, `proche transports`, `parking`,
  `garage`, `jardin`, `dernier étage`, `ancien charme`, `rénové`, `balcon`…

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
