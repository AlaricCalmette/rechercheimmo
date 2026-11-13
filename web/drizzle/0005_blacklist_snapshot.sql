-- Migration additive appliquée via `node scripts/apply-sql.mjs drizzle/0005_blacklist_snapshot.sql`
-- Instantané du bien au moment de son exclusion (exemple négatif pour la routine).

ALTER TABLE "blacklist" ADD COLUMN IF NOT EXISTS "snapshot" jsonb;
