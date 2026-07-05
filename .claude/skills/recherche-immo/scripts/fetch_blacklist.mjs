#!/usr/bin/env node
// Récupère la liste noire (annonces exclues définitivement depuis le site) et
// l'imprime en JSON sur stdout : { count, urls: [...], entries: [...] }.
// Le skill NE DOIT JAMAIS proposer un candidat dont l'URL figure dans `urls`
// (l'API candidates les rejette de toute façon à l'insertion).
//
// Config par variables d'environnement (mêmes que fetch_listings.mjs) :
//   RECHERCHEIMMO_API_URL    (défaut: http://localhost:3000)
//   RECHERCHEIMMO_API_SECRET (ou API_SECRET)
//
// Usage : node fetch_blacklist.mjs

const apiUrl = (process.env.RECHERCHEIMMO_API_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.RECHERCHEIMMO_API_SECRET || process.env.API_SECRET;

if (!secret) {
  console.error("Erreur : définis RECHERCHEIMMO_API_SECRET (le même que API_SECRET du site).");
  process.exit(1);
}

try {
  const res = await fetch(`${apiUrl}/api/blacklist`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    console.error(`Erreur API ${res.status} : ${await res.text()}`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(await res.json(), null, 2));
} catch (e) {
  console.error(`Échec de la requête vers ${apiUrl}/api/blacklist : ${e.message}`);
  process.exit(1);
}
