#!/usr/bin/env node
// Récupère le profil de goût persistant (mémoire du skill) depuis l'API
// RechercheImmo et l'imprime en JSON sur stdout. Imprime `null` si aucun profil
// n'existe encore (premier passage).
//
// Config par variables d'environnement (mêmes que fetch_listings.mjs) :
//   RECHERCHEIMMO_API_URL    (défaut: http://localhost:3000)
//   RECHERCHEIMMO_API_SECRET (ou API_SECRET)
//
// Usage : node get_profile.mjs

const apiUrl = (process.env.RECHERCHEIMMO_API_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.RECHERCHEIMMO_API_SECRET || process.env.API_SECRET;

if (!secret) {
  console.error("Erreur : définis RECHERCHEIMMO_API_SECRET (le même que API_SECRET du site).");
  process.exit(1);
}

try {
  const res = await fetch(`${apiUrl}/api/profile`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    console.error(`Erreur API ${res.status} : ${await res.text()}`);
    process.exit(1);
  }
  // L'API renvoie directement les données du profil (ou null).
  process.stdout.write(JSON.stringify(await res.json(), null, 2));
} catch (e) {
  console.error(`Échec de la requête vers ${apiUrl}/api/profile : ${e.message}`);
  process.exit(1);
}
