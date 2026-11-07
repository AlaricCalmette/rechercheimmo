#!/usr/bin/env node
// Envoie les résultats de la veille des annonces sauvegardées (prix actuel,
// annonce disparue) vers l'API RechercheImmo.
//
// Config par variables d'environnement :
//   RECHERCHEIMMO_API_URL    (défaut: http://localhost:3000)
//   RECHERCHEIMMO_API_SECRET (ou API_SECRET)
//
// Usage : node post_checks.mjs <chemin-du-json>
// Le JSON doit avoir la forme :
//   { "checks": [ { "id"?: "...", "url"?: "...", "state": "ok"|"gone", "price"?: 245000 } ] }
// `id` (de GET /api/listings) ou `url` identifie l'annonce. Un changement de
// prix est historisé côté site ; « gone » marque l'annonce comme disparue.

import { readFile } from "node:fs/promises";

const apiUrl = (process.env.RECHERCHEIMMO_API_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.RECHERCHEIMMO_API_SECRET || process.env.API_SECRET;
const file = process.argv[2];

if (!secret) {
  console.error("Erreur : définis RECHERCHEIMMO_API_SECRET (le même que API_SECRET du site).");
  process.exit(1);
}
if (!file) {
  console.error("Usage : node post_checks.mjs <chemin-du-json>");
  process.exit(1);
}

try {
  const payload = JSON.parse(await readFile(file, "utf8"));
  const res = await fetch(`${apiUrl}/api/listings/check`, {
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
  console.error(`Échec de l'envoi vers ${apiUrl}/api/listings/check : ${e.message}`);
  process.exit(1);
}
