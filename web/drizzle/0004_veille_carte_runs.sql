-- Migration additive appliquée via `node scripts/apply-sql.mjs drizzle/0004_veille_carte_runs.sql`
-- (pas via drizzle-kit : le snapshot contient des tables users/profiles orphelines
-- qu'on ne veut surtout pas supprimer).

ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "price_history" jsonb;
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "last_checked_at" timestamp with time zone;
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "gone" boolean DEFAULT false;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "score_details" jsonb;

-- Colonnes lat/lng : finalement inutilisées (la carte passe par la table
-- geocache). Elles restent vides en base ; on peut les supprimer sans risque.
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "lat" double precision;
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "lng" double precision;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "lat" double precision;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "lng" double precision;

CREATE TABLE IF NOT EXISTS "runs" (
  "id" uuid PRIMARY KEY,
  "received" integer NOT NULL DEFAULT 0,
  "inserted" integer NOT NULL DEFAULT 0,
  "skipped" integer NOT NULL DEFAULT 0,
  "blacklisted" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "geocache" (
  "location" text PRIMARY KEY,
  "lat" double precision,
  "lng" double precision,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
