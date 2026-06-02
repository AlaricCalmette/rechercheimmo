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

  const title = meta("og:title") || document.title || null;
  const description =
    meta("og:description") ||
    document.querySelector('meta[name="description"]')?.content ||
    null;
  const url = meta("og:url") || location.href;

  // Prix : d'abord via JSON-LD offers, sinon repli par regex sur le texte.
  let price = null;
  const offer = product?.offers || findLd("Offer");
  const rawPrice = offer?.price ?? offer?.lowPrice ?? product?.price;
  if (rawPrice != null) {
    const n = parseInt(String(rawPrice).replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n)) price = n;
  }
  if (price == null) {
    const m = document.body.innerText.match(/(\d[\d\s.  ]{3,})\s*€/);
    if (m) {
      const n = parseInt(m[1].replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(n)) price = n;
    }
  }

  const location_ =
    meta("og:locality") ||
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
    surface: null,
    rooms: null,
    photos: [...photos].slice(0, 12),
    raw: { host, jsonLd: ld.slice(0, 5) },
  };
}
