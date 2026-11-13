#!/usr/bin/env node
// Diagnostique (et au besoin restaure) une base vidée à partir de la
// sauvegarde etat/ du repo (écrite par snapshot_state.mjs).
//
// Une base est considérée RÉINITIALISÉE quand les deux profils sont absents
// alors que la sauvegarde en contient : le skill réécrit les profils à chaque
// passage, ils ne disparaissent donc jamais en usage normal. Dans ce seul cas,
// --apply restaure tout : profils, liste noire, annonces aimées.
//
// Une table vide isolée (liste noire ou annonces aimées) alors que les profils
// sont là est seulement signalée « suspecte » : l'utilisateur a pu vider sa
// liste lui-même, on ne réinjecte rien sans preuve de perte.
//
// Usage : node restore_state.mjs [dossier] [--apply]
// Imprime un diagnostic JSON ; avec --apply, effectue la restauration.

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "./lib.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dir =
  args.find((a) => !a.startsWith("--")) ??
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../../etat");

async function load(name) {
  try {
    return JSON.parse(await readFile(join(dir, name), "utf8"));
  } catch {
    return null;
  }
}

const saved = {
  achat: await load("profil-achat.json"),
  location: await load("profil-location.json"),
  blacklist: (await load("liste-noire.json")) ?? [],
  listings: (await load("annonces-aimees.json")) ?? [],
};

const [achat, location, blacklist, listings] = await Promise.all([
  api("/api/profile?kind=achat"),
  api("/api/profile?kind=location"),
  api("/api/blacklist"),
  api("/api/listings"),
]);

const db = {
  profilAchat: achat != null,
  profilLocation: location != null,
  listeNoire: blacklist.count,
  annoncesAimees: listings.length,
};
const sauvegarde = {
  profilAchat: saved.achat != null,
  profilLocation: saved.location != null,
  listeNoire: saved.blacklist.length,
  annoncesAimees: saved.listings.length,
};

const wiped = !achat && !location && (saved.achat != null || saved.location != null);
const suspects = [];
if (!wiped) {
  if (db.listeNoire === 0 && sauvegarde.listeNoire > 0)
    suspects.push(`liste noire vide en base, ${sauvegarde.listeNoire} URL dans la sauvegarde`);
  if (db.annoncesAimees === 0 && sauvegarde.annoncesAimees > 0)
    suspects.push(`aucune annonce aimée en base, ${sauvegarde.annoncesAimees} dans la sauvegarde`);
}

const report = { baseReinitialisee: wiped, suspects, db, sauvegarde, restaure: null };

if (wiped && apply) {
  const done = { profils: [], listeNoire: 0, annoncesAimees: 0 };
  for (const kind of ["achat", "location"]) {
    if (saved[kind]) {
      await api(`/api/profile?kind=${kind}`, { method: "PUT", body: saved[kind] });
      done.profils.push(kind);
    }
  }
  const banned = new Set(blacklist.urls);
  for (const e of saved.blacklist) {
    if (banned.has(e.url)) continue;
    await api("/api/blacklist", {
      method: "POST",
      body: { url: e.url, title: e.title, source: e.source, reason: e.reason, snapshot: e.snapshot },
    });
    done.listeNoire++;
  }
  const liked = new Set(listings.map((l) => l.url));
  for (const l of saved.listings) {
    if (liked.has(l.url)) continue;
    await api("/api/listings", {
      method: "POST",
      body: {
        url: l.url, source: l.source, kind: l.kind, title: l.title, price: l.price,
        location: l.location, surface: l.surface, rooms: l.rooms,
        description: l.description, photos: l.photos, notes: l.notes,
        dislikes: l.dislikes, raw: l.raw,
      },
    });
    done.annoncesAimees++;
  }
  report.restaure = done;
}

console.log(JSON.stringify(report, null, 2));
