#!/usr/bin/env node
// Vérifie un profil affiné AVANT de l'enregistrer, en le comparant au profil
// chargé en début de passage.
//
// Erreurs (code de sortie 1, ne pas enregistrer tant qu'elles restent) :
//   - un trait épinglé (pinned) a disparu ou a changé (thème, poids, rédhibitoire) ;
//   - les consignes (instructions) ou le plan de financement ont changé.
// Avertissements (à corriger, sans bloquer) :
//   - plus de 5 préférences à 5/5 (le score ne distingue plus rien) ;
//   - thèmes quasi identiques (à fusionner) ;
//   - plus de 15 localisations ;
//   - budget max relevé alors que l'utilisateur le fixe sur /profil.
//
// Usage : node check_profile.mjs <profil-chargé.json> <profil-affiné.json>

import { fail, readJson } from "./lib.mjs";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) fail("Usage : node check_profile.mjs <profil-chargé.json> <profil-affiné.json>");

const before = (await readJson(beforePath)) ?? {};
const after = await readJson(afterPath);
if (!after || typeof after !== "object") fail(`${afterPath} : profil invalide.`);

const errors = [];
const warnings = [];
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

for (const key of ["preferences", "repulsions"]) {
  const now = new Map((after[key] ?? []).map((t) => [norm(t.theme), t]));
  for (const t of (before[key] ?? []).filter((t) => t.pinned)) {
    const n = now.get(norm(t.theme));
    if (!n) errors.push(`trait épinglé supprimé (${key}) : « ${t.theme} »`);
    else if (n.weight !== t.weight || !n.pinned || Boolean(n.redhibitory) !== Boolean(t.redhibitory))
      errors.push(`trait épinglé modifié (${key}) : « ${t.theme} » doit rester tel quel`);
  }
}
if (norm(before.instructions) !== norm(after.instructions))
  errors.push("les consignes (instructions) ont changé : recopie-les à l'identique");
if (JSON.stringify(before.financing ?? null) !== JSON.stringify(after.financing ?? null))
  errors.push("le plan de financement (financing) a changé : recopie-le à l'identique");

const fives = (after.preferences ?? []).filter((t) => t.weight >= 5);
if (fives.length > 5)
  warnings.push(
    `${fives.length} préférences à 5/5 : n'en garde que 5 au plus (les épinglées comptent), ` +
      "les autres à 4 ou moins selon le nombre d'annonces qui les confirment"
  );

const words = (s) => new Set(norm(s).split(/[^a-zà-ÿ0-9]+/).filter((w) => w.length > 3));
for (const key of ["preferences", "repulsions"]) {
  const list = after[key] ?? [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = words(list[i].theme);
      const b = words(list[j].theme);
      const inter = [...a].filter((w) => b.has(w)).length;
      const union = new Set([...a, ...b]).size;
      if (union > 0 && inter / union >= 0.6)
        warnings.push(`thèmes proches à fusionner : « ${list[i].theme} » / « ${list[j].theme} »`);
    }
  }
}

if ((after.locations ?? []).length > 15)
  warnings.push(`${after.locations.length} localisations : regroupe-les (15 au plus)`);
if (before.budget?.max != null && after.budget?.max != null && after.budget.max > before.budget.max)
  warnings.push(`budget max relevé de ${before.budget.max} à ${after.budget.max} : la valeur de l'utilisateur fait foi`);

console.log(JSON.stringify({ ok: errors.length === 0, erreurs: errors, avertissements: warnings }, null, 2));
process.exit(errors.length > 0 ? 1 : 0);
