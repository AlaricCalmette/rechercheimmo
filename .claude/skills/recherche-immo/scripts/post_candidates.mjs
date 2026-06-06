#!/usr/bin/env node
// Envoie la liste classée de candidats vers l'API RechercheImmo, qui les
// affichera sur la page /candidats du site.
//
// Config par variables d'environnement :
//   RECHERCHEIMMO_API_URL    (défaut: http://localhost:3000)
//   RECHERCHEIMMO_API_SECRET (ou API_SECRET)
//
// Usage : node post_candidates.mjs <chemin-du-json>
// Le JSON doit avoir la forme : { "runId"?: "...", "candidates": [ { ... } ] }
// Champs d'un candidat : source, url (requis), title, price, location, surface,
//   rooms, photos (string[]), score (0-100), reasons (texte court).

import { readFile } from "node:fs/promises";

const apiUrl = (process.env.RECHERCHEIMMO_API_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.RECHERCHEIMMO_API_SECRET || process.env.API_SECRET;
const file = process.argv[2];

if (!secret) {
  console.error("Erreur : définis RECHERCHEIMMO_API_SECRET (le même que API_SECRET du site).");
  process.exit(1);
}
if (!file) {
  console.error("Usage : node post_candidates.mjs <chemin-du-json>");
  process.exit(1);
}

try {
  const payload = JSON.parse(await readFile(file, "utf8"));
  const res = await fetch(`${apiUrl}/api/candidates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error(`Erreur API ${res.status} : ${await res.text()}`);
    process.exit(1);
  }
  console.log(await res.text());
} catch (e) {
  console.error(`Échec de l'envoi vers ${apiUrl}/api/candidates : ${e.message}`);
  process.exit(1);
}
