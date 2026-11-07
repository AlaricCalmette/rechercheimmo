// Applique un fichier SQL sur la base Postgres du projet.
// Usage : node scripts/apply-sql.mjs drizzle/0004_veille_carte_runs.sql
// Lit POSTGRES_URL depuis l'environnement ou depuis web/.env.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (!process.env.POSTGRES_URL) {
  try {
    const env = readFileSync(resolve(webDir, ".env"), "utf8");
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* pas de .env : POSTGRES_URL doit venir de l'environnement */
  }
}

const file = process.argv[2];
if (!file) {
  console.error("Usage : node scripts/apply-sql.mjs <fichier.sql>");
  process.exit(1);
}

const { sql } = await import("@vercel/postgres");
const text = readFileSync(resolve(webDir, file), "utf8");

// Découpe naïve par « ; » en fin de ligne : suffisant pour du DDL simple.
const statements = text
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) => s.replace(/^--.*$/gm, "").trim())
  .filter(Boolean);

for (const stmt of statements) {
  console.log("→", stmt.split("\n")[0].slice(0, 80));
  await sql.query(stmt);
}
console.log(`OK : ${statements.length} instruction(s) appliquée(s).`);
process.exit(0);
