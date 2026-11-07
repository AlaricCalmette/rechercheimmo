import { db } from "@/lib/db";
import { profile, type Kind, type ProfileData } from "@/db/schema";

// Lit le profil d'un type de projet. Le profil achat retombe sur l'ancienne
// ligne "default" (historique d'avant la séparation achat/location).
export async function loadProfile(kind: Kind): Promise<ProfileData | null> {
  const rows = await db.select().from(profile);
  const row =
    rows.find((r) => r.id === kind) ??
    (kind === "achat" ? rows.find((r) => r.id === "default") : undefined);
  return (row?.data ?? null) as ProfileData | null;
}
