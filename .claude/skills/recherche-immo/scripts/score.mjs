#!/usr/bin/env node
// Calcule le score 0-100 et son détail (scoreDetails) de chaque candidat, de
// façon déterministe, à partir du profil et des correspondances relevées par
// le skill. Le skill juge (quels traits sont présents) ; ce script compte.
//
// Usage : node score.mjs <profil.json> <candidats.json> [sortie.json]
//   (sans sortie, réécrit candidats.json)
//
// Entrée : le lot au format post_candidates.mjs, où chaque candidat porte en
// plus un champ `match` :
//   "match": {
//     "preferences": [{ "trait": "<theme exact du profil>", "status": "confirmé" | "à confirmer" }],
//     "repulsions":  [{ "trait": "<theme exact du profil>", "status": "confirmé" | "à confirmer" }],
//     "location": "exacte" | "proche" | "hors zone"
//   }
// Sortie : même lot, candidats triés par score décroissant, avec `score` et
// `scoreDetails` remplis et `match` retiré. Les candidats éliminés (défaut
// rédhibitoire confirmé, prix > budget max + 10 %) sont retirés et listés dans
// `excluded` (champ ignoré par l'API).
//
// Barème (cf. SKILL.md, Étape 3) :
//   préférences   : poids × 3 par trait confirmé, poids × 1,5 si « à confirmer », plafond 50
//   surface/pièces: 12 (surface) + 8 (pièces), moitié si inconnu ou un peu hors fourchette
//   budget        : 15 dans la fourchette, 8 sous le min, 6 jusqu'à +10 %, 7 si prix inconnu
//   localisation  : 15 exacte, 8 proche, 3 hors zone
//   répulsions    : −poids × 3 (confirmé) ou −poids × 1,5 (à confirmer), plancher −40

import { writeFile } from "node:fs/promises";
import { fail, readJson } from "./lib.mjs";

const [profilePath, inputPath, outputPath = inputPath] = process.argv.slice(2);
if (!profilePath || !inputPath) fail("Usage : node score.mjs <profil.json> <candidats.json> [sortie.json]");

const profile = await readJson(profilePath);
const batch = await readJson(inputPath);
if (!Array.isArray(batch?.candidates)) fail(`${inputPath} : champ "candidates" manquant.`);

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const prefs = new Map((profile.preferences ?? []).map((t) => [norm(t.theme), t]));
const reps = new Map((profile.repulsions ?? []).map((t) => [norm(t.theme), t]));

function firstNumber(text, unit) {
  if (text == null) return null;
  const s = String(text).replace(/ /g, " ");
  const m = unit ? s.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${unit}`, "i")) : null;
  const n = m ? m[1] : s.match(/\d+(?:[.,]\d+)?/)?.[0];
  return n ? parseFloat(n.replace(",", ".")) : null;
}

function inRange(value, range, tolerance) {
  if (value == null || !range || (range.min == null && range.max == null)) return "inconnu";
  const { min, max } = range;
  if ((min == null || value >= min) && (max == null || value <= max)) return "dedans";
  const near =
    (min != null && value < min && value >= min * (1 - tolerance)) ||
    (max != null && value > max && value <= max * (1 + tolerance));
  return near ? "proche" : "loin";
}

// Plafonne une liste de lignes positives à `cap` en réduisant
// proportionnellement, en gardant une somme exacte après arrondi.
function capLines(lines, cap) {
  const total = lines.reduce((s, l) => s + l.points, 0);
  if (total <= cap) return lines.map((l) => ({ ...l, points: Math.round(l.points) }));
  const scaled = lines.map((l) => ({ ...l, points: Math.floor((l.points * cap) / total) }));
  let rest = cap - scaled.reduce((s, l) => s + l.points, 0);
  for (const l of [...scaled].sort((a, b) => b.points - a.points)) {
    if (rest-- <= 0) break;
    l.points += 1;
  }
  return scaled.filter((l) => l.points !== 0);
}

const unknownTraits = new Set();
const scored = [];
const excluded = [];

for (const c of batch.candidates) {
  const match = c.match ?? {};
  const details = [];

  const prefLines = [];
  for (const m of match.preferences ?? []) {
    const t = prefs.get(norm(m.trait));
    if (!t) { unknownTraits.add(`préférence « ${m.trait} »`); continue; }
    const factor = m.status === "à confirmer" ? 1.5 : 3;
    prefLines.push({ label: t.theme, points: t.weight * factor });
  }
  details.push(...capLines(prefLines, 50));

  const surface = inRange(firstNumber(c.surface, "m"), profile.surface, 0.15);
  const rooms = inRange(firstNumber(c.rooms, "pi[eè]ce"), profile.rooms, 0.25);
  const surfacePts = { dedans: 12, proche: 6, inconnu: 6, loin: 0 }[surface];
  const roomsPts = { dedans: 8, proche: 4, inconnu: 4, loin: 0 }[rooms];
  details.push({ label: "surface / pièces", points: surfacePts + roomsPts });

  const price = typeof c.price === "number" ? c.price : firstNumber(c.price);
  const budget = profile.budget ?? {};
  let budgetPts;
  if (price == null) budgetPts = 7;
  else if (budget.max != null && price > budget.max * 1.1) {
    excluded.push({ url: c.url, title: c.title, raison: `prix ${price} > budget max ${budget.max} + 10 %` });
    continue;
  } else if (budget.max != null && price > budget.max) budgetPts = 6;
  else if (budget.min != null && price < budget.min) budgetPts = 8;
  else budgetPts = 15;
  details.push({ label: "budget", points: budgetPts });

  const locPts = { exacte: 15, proche: 8, "hors zone": 3 }[match.location] ?? 8;
  details.push({ label: "localisation", points: locPts });

  let redhibitory = null;
  const repLines = [];
  for (const m of match.repulsions ?? []) {
    const t = reps.get(norm(m.trait));
    if (!t) { unknownTraits.add(`répulsion « ${m.trait} »`); continue; }
    const confirmed = m.status !== "à confirmer";
    if (t.redhibitory && confirmed) { redhibitory = t.theme; break; }
    repLines.push({ label: t.theme, points: t.weight * (confirmed ? 3 : 1.5) });
  }
  if (redhibitory) {
    excluded.push({ url: c.url, title: c.title, raison: `défaut rédhibitoire : ${redhibitory}` });
    continue;
  }
  details.push(...capLines(repLines, 40).map((l) => ({ ...l, points: -l.points })));

  const sum = details.reduce((s, d) => s + d.points, 0);
  const { match: _drop, ...rest } = c;
  scored.push({ ...rest, score: Math.max(0, Math.min(100, sum)), scoreDetails: details });
}

if (unknownTraits.size > 0) {
  fail(
    "Traits inconnus du profil (utilise exactement un `theme` de preferences/repulsions) :\n  - " +
      [...unknownTraits].join("\n  - ")
  );
}

scored.sort((a, b) => b.score - a.score);
await writeFile(outputPath, JSON.stringify({ ...batch, candidates: scored, excluded }, null, 2) + "\n", "utf8");

console.log(`${scored.length} candidat(s) scorés, ${excluded.length} éliminé(s) → ${outputPath}`);
for (const c of scored) console.log(`  ${String(c.score).padStart(3)}  ${c.title ?? c.url}`);
for (const e of excluded) console.log(`  éliminé  ${e.title ?? e.url} (${e.raison})`);
