#!/usr/bin/env node
// Télécharge la photo de couverture (photos[0]) de chaque annonce aimée dans un
// dossier temporaire, afin que le skill puisse l'OUVRIR avec l'outil Read et
// l'analyser visuellement (on ne peut pas lire une image directement par URL).
//
// Pour chaque annonce ayant au moins une photo, écrit le fichier image et
// imprime en JSON un tableau d'objets : { url, title, photo, file }.
// - url   : l'URL de l'annonce (clé pour relier à l'annonce d'origine)
// - title : le titre de l'annonce
// - photo : l'URL de la photo de couverture
// - file  : le chemin local du fichier téléchargé (à passer à Read)
//
// Config par variables d'environnement (mêmes que fetch_listings.mjs) :
//   RECHERCHEIMMO_API_URL    (défaut: http://localhost:3000)
//   RECHERCHEIMMO_API_SECRET (ou API_SECRET)
//
// Usage : node download_photos.mjs

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

const apiUrl = (process.env.RECHERCHEIMMO_API_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.RECHERCHEIMMO_API_SECRET || process.env.API_SECRET;

if (!secret) {
  console.error(
    "Erreur : définis RECHERCHEIMMO_API_SECRET (le même que API_SECRET du site)."
  );
  process.exit(1);
}

// Devine une extension de fichier raisonnable depuis l'URL ou le content-type.
function pickExt(url, contentType) {
  const fromUrl = extname(new URL(url).pathname).toLowerCase();
  if (/^\.(jpe?g|png|webp|gif|avif)$/.test(fromUrl)) return fromUrl;
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("avif")) return ".avif";
  if (contentType?.includes("gif")) return ".gif";
  return ".jpg";
}

let listings;
try {
  const res = await fetch(`${apiUrl}/api/listings`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    console.error(`Erreur API ${res.status} : ${await res.text()}`);
    process.exit(1);
  }
  listings = await res.json();
} catch (e) {
  console.error(`Échec de la requête vers ${apiUrl}/api/listings : ${e.message}`);
  process.exit(1);
}

const dir = await mkdtemp(join(tmpdir(), "rechercheimmo-photos-"));
const out = [];

for (let i = 0; i < listings.length; i++) {
  const item = listings[i];
  const photo = Array.isArray(item.photos) ? item.photos[0] : null;
  if (!photo) continue;
  try {
    const res = await fetch(photo);
    if (!res.ok) {
      console.error(`Photo ignorée (${res.status}) : ${photo}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const file = join(dir, `${i}${pickExt(photo, res.headers.get("content-type"))}`);
    await writeFile(file, buf);
    out.push({ url: item.url, title: item.title ?? null, photo, file });
  } catch (e) {
    console.error(`Échec téléchargement ${photo} : ${e.message}`);
  }
}

process.stdout.write(JSON.stringify(out, null, 2));
