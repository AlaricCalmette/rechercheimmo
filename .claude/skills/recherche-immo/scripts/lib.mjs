// Accès à l'API RechercheImmo, partagé par les scripts du skill.
//
// Config par variables d'environnement :
//   RECHERCHEIMMO_API_URL    (défaut: http://localhost:3000)
//   RECHERCHEIMMO_API_SECRET (ou API_SECRET)

import { readFile } from "node:fs/promises";

export const apiUrl = (process.env.RECHERCHEIMMO_API_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.RECHERCHEIMMO_API_SECRET || process.env.API_SECRET;

// Arrête le script avec un message lisible. On lève une erreur plutôt que
// d'appeler process.exit : sous Windows, quitter pendant que d'autres requêtes
// sont en vol fait planter Node.
class ScriptError extends Error {}
process.setUncaughtExceptionCaptureCallback((e) => {
  console.error(e instanceof ScriptError ? e.message : e);
  process.exitCode = 1;
});

export function fail(message) {
  throw new ScriptError(message);
}

if (!secret) {
  fail("Erreur : définis RECHERCHEIMMO_API_SECRET (le même que API_SECRET du site).");
}

// Appelle l'API et renvoie le JSON de la réponse ; quitte le script en cas
// d'erreur (réseau ou statut HTTP), avec un message explicite.
export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    fail(`Échec de la requête ${method} ${apiUrl}${path} : ${e.message}`);
  }
  if (!res.ok) fail(`Erreur API ${res.status} sur ${method} ${path} : ${await res.text()}`);
  return res.json();
}

export async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    fail(`Impossible de lire ${file} : ${e.message}`);
  }
}
