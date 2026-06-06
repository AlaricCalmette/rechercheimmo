#!/usr/bin/env node
// Récupère les annonces sauvegardées (celles que l'utilisateur a aimées) depuis
// l'API RechercheImmo et les imprime en JSON sur stdout.
//
// Config par variables d'environnement :
//   RECHERCHEIMMO_API_URL    (défaut: http://localhost:3000)
//   RECHERCHEIMMO_API_SECRET (ou API_SECRET) — doit valoir le secret du site
//
// Usage : node fetch_listings.mjs

const apiUrl = (process.env.RECHERCHEIMMO_API_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.RECHERCHEIMMO_API_SECRET || process.env.API_SECRET;

if (!secret) {
  console.error(
    "Erreur : définis RECHERCHEIMMO_API_SECRET (le même que API_SECRET du site)."
  );
  process.exit(1);
}

try {
  const res = await fetch(`${apiUrl}/api/listings`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    console.error(`Erreur API ${res.status} : ${await res.text()}`);
    process.exit(1);
  }
  const data = await res.json();
  process.stdout.write(JSON.stringify(data, null, 2));
} catch (e) {
  console.error(`Échec de la requête vers ${apiUrl}/api/listings : ${e.message}`);
  process.exit(1);
}
