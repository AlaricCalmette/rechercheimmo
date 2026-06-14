#!/usr/bin/env node
// Enregistre le profil de goût affiné (mémoire du skill) via l'API RechercheImmo.
// Le profil est stocké en base et devient consultable sur la page /profil du site.
//
// Config par variables d'environnement (mêmes que fetch_listings.mjs) :
//   RECHERCHEIMMO_API_URL    (défaut: http://localhost:3000)
//   RECHERCHEIMMO_API_SECRET (ou API_SECRET)
//
// Usage : node save_profile.mjs <chemin-du-json>
// Le JSON est l'objet profil complet (budget, locations, preferences,
// repulsions, analyzedListings, …).

import { readFile } from "node:fs/promises";

const apiUrl = (process.env.RECHERCHEIMMO_API_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.RECHERCHEIMMO_API_SECRET || process.env.API_SECRET;
const file = process.argv[2];

if (!secret) {
  console.error("Erreur : définis RECHERCHEIMMO_API_SECRET (le même que API_SECRET du site).");
  process.exit(1);
}
if (!file) {
  console.error("Usage : node save_profile.mjs <chemin-du-json>");
  process.exit(1);
}

try {
  const payload = JSON.parse(await readFile(file, "utf8"));
  const res = await fetch(`${apiUrl}/api/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error(`Erreur API ${res.status} : ${await res.text()}`);
    process.exit(1);
  }
  console.log(await res.text());
} catch (e) {
  console.error(`Échec de l'envoi vers ${apiUrl}/api/profile : ${e.message}`);
  process.exit(1);
}
