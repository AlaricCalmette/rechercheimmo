// Cette fonction est injectée dans la page de l'annonce via
// chrome.scripting.executeScript. Elle doit être AUTONOME (pas de variable
// externe), car son code source est sérialisé puis exécuté dans la page.
//
// Stratégie : on s'appuie sur les balises OpenGraph et les blocs JSON-LD
// (schema.org) que les grands portails immobiliers exposent, avec un repli
// générique qui marche sur n'importe quel site.
function extractListing() {
  const meta = (key) =>
    document.querySelector(`meta[property="${key}"]`)?.content ||
    document.querySelector(`meta[name="${key}"]`)?.content ||
    null;

  // Collecte de tous les objets JSON-LD de la page.
  const ld = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const parsed = JSON.parse(s.textContent);
      if (Array.isArray(parsed)) ld.push(...parsed);
      else if (parsed["@graph"]) ld.push(...parsed["@graph"]);
      else ld.push(parsed);
    } catch {
      /* ignore JSON-LD mal formé */
    }
  });
  const findLd = (...types) =>
    ld.find((o) => {
      const t = o && o["@type"];
      return Array.isArray(t) ? t.some((x) => types.includes(x)) : types.includes(t);
    });

  const host = location.hostname.replace(/^www\./, "");
  let source = "generic";
  if (host.includes("seloger")) source = "seloger";
  else if (host.includes("leboncoin")) source = "leboncoin";
  else if (host.includes("bienici")) source = "bienici";
  else if (host.includes("pap.fr")) source = "pap";

  // Photos : og:image (souvent plusieurs) + images des objets JSON-LD.
  const photos = new Set();
  document
    .querySelectorAll('meta[property="og:image"], meta[name="og:image"]')
    .forEach((m) => m.content && photos.add(m.content));
  const pushImage = (img) => {
    if (!img) return;
    if (typeof img === "string") photos.add(img);
    else if (Array.isArray(img)) img.forEach(pushImage);
    else if (img.url) photos.add(img.url);
  };
  ld.forEach((o) => o && pushImage(o.image));

  const product = findLd(
    "Product",
    "Offer",
    "RealEstateListing",
    "Residence",
    "Apartment",
    "House",
    "SingleFamilyResidence",
    "Accommodation"
  );

  // Objet logement (schema.org Accommodation et dérivés) : porte souvent
  // floorSize / numberOfRooms / address, distinct du Product qui porte le prix.
  const accommodation = findLd(
    "Accommodation",
    "Residence",
    "Apartment",
    "House",
    "SingleFamilyResidence"
  );

  // Convertit une valeur potentiellement formatée ("149 425 €") en entier.
  const toNumber = (v) => {
    if (v == null) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  };

  // Extrait un prix d'un objet Offer (ou tableau d'offres). Bien'ici place le
  // prix sous offers.priceSpecification.price, d'où l'exploration récursive.
  const priceFromOffer = (o) => {
    if (!o) return null;
    if (Array.isArray(o)) {
      for (const item of o) {
        const p = priceFromOffer(item);
        if (p != null) return p;
      }
      return null;
    }
    const direct = toNumber(o.price ?? o.lowPrice);
    if (direct != null) return direct;
    const spec = o.priceSpecification;
    if (Array.isArray(spec)) {
      for (const s of spec) {
        const p = toNumber(s?.price);
        if (p != null) return p;
      }
    } else if (spec) {
      const p = toNumber(spec.price);
      if (p != null) return p;
    }
    return null;
  };

  const title = meta("og:title") || document.title || null;
  const description =
    meta("og:description") ||
    document.querySelector('meta[name="description"]')?.content ||
    null;
  const url = meta("og:url") || location.href;

  // Prix : d'abord via JSON-LD offers (y compris priceSpecification.price utilisé
  // par bien'ici), sinon repli par regex sur le texte de la page.
  let price =
    priceFromOffer(product?.offers) ??
    priceFromOffer(findLd("Offer")) ??
    toNumber(product?.price);
  if (price == null) {
    const m = document.body.innerText.match(/(\d[\d\s.  ]{3,})\s*€/);
    if (m) {
      const n = parseInt(m[1].replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(n)) price = n;
    }
  }

  // Surface (m²) et nombre de pièces depuis le JSON-LD du logement quand présents.
  const accSurface = toNumber(accommodation?.floorSize?.value);
  const surface = accSurface != null ? `${accSurface} m²` : null;
  const rawRooms = accommodation?.numberOfRooms;
  const rooms =
    rawRooms != null
      ? toNumber(typeof rawRooms === "object" ? rawRooms.value : rawRooms)
      : null;

  const location_ =
    meta("og:locality") ||
    accommodation?.address?.addressLocality ||
    accommodation?.address?.postalCode ||
    product?.address?.addressLocality ||
    product?.address?.postalCode ||
    null;

  return {
    source,
    url,
    title,
    description,
    price,
    location: location_,
    surface,
    rooms,
    photos: [...photos].slice(0, 12),
    raw: { host, jsonLd: ld.slice(0, 5) },
  };
}
