#!/usr/bin/env node
// Sauvegarde l'état de la base dans le repo (dossier etat/ à la racine), pour
// pouvoir le restaurer à l'identique si la base est perdue :
//   etat/profil-achat.json, etat/profil-location.json — profils complets
//   etat/liste-noire.json   — annonces exclues (avec leur instantané)
//   etat/annonces-aimees.json — annonces sauvegardées (notes, photos…)
//
// Garde-fou : un fichier de sauvegarde non vide n'est JAMAIS remplacé par un
// contenu vide (base vidée = c'est justement là qu'on a besoin de la
// sauvegarde). Passe --force pour l'autoriser quand le vide est voulu.
//
// Usage : node snapshot_state.mjs [dossier] [--force]

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "./lib.mjs";

const args = process.argv.slice(2);
const force = args.includes("--force");
const dir =
  args.find((a) => !a.startsWith("--")) ??
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../../etat");

const isEmpty = (v) => v == null || (Array.isArray(v) && v.length === 0);
const byDate = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt));

async function existing(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

const [achat, location, blacklist, listings] = await Promise.all([
  api("/api/profile?kind=achat"),
  api("/api/profile?kind=location"),
  api("/api/blacklist"),
  api("/api/listings"),
]);

const files = {
  "profil-achat.json": achat,
  "profil-location.json": location,
  "liste-noire.json": [...blacklist.entries].sort(byDate),
  "annonces-aimees.json": [...listings].sort(byDate),
};

await mkdir(dir, { recursive: true });
const summary = {};
for (const [name, data] of Object.entries(files)) {
  const file = join(dir, name);
  const before = await existing(file);
  const count = Array.isArray(data) ? data.length : data ? 1 : 0;
  if (isEmpty(data) && !isEmpty(before) && !force) {
    summary[name] = `CONSERVÉ (base vide, sauvegarde non vide gardée)`;
    continue;
  }
  await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  summary[name] = Array.isArray(data) ? `${count} entrée(s)` : data ? "profil écrit" : "vide";
}

console.log(JSON.stringify({ dossier: dir, fichiers: summary }, null, 2));
