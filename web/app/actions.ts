"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  listings,
  candidates,
  blacklist,
  profile,
  type ProfileData,
  type Kind,
  type ListingStatus,
} from "@/db/schema";
import { AUTH_COOKIE, expectedToken } from "@/lib/auth";
import { geocodeMissing } from "@/lib/geocode";
import { applyCheck, checkUrl } from "@/lib/watch";

async function requireAuth() {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (token !== (await expectedToken())) {
    redirect("/login");
  }
}

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password !== process.env.SITE_PASSWORD) {
    redirect("/login?error=1");
  }
  const token = await expectedToken();
  (await cookies()).set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(AUTH_COOKIE);
  redirect("/login");
}

export async function deleteListing(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) {
    await db.delete(listings).where(eq(listings.id, id));
    revalidatePath("/");
  }
}

export async function updateListingNotes(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const notes = String(formData.get("notes") ?? "").trim();
  const dislikes = String(formData.get("dislikes") ?? "").trim();
  await db
    .update(listings)
    .set({
      notes: notes.length > 0 ? notes : null,
      dislikes: dislikes.length > 0 ? dislikes : null,
    })
    .where(eq(listings.id, id));
  revalidatePath("/");
}

// Bascule une annonce aimée entre achat et location (corrige l'inférence
// automatique) : le skill s'en sert pour construire le bon profil.
export async function setListingKind(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!id || (kind !== "achat" && kind !== "location")) return;
  await db.update(listings).set({ kind: kind as Kind }).where(eq(listings.id, id));
  revalidatePath("/");
}

// Statut de suivi d'une annonce sauvegardée (à contacter, visitée…).
export async function setListingStatus(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("status") ?? "");
  const allowed: ListingStatus[] = [
    "a_contacter",
    "contactee",
    "visite_prevue",
    "visitee",
    "ecartee",
  ];
  if (!id) return;
  const status = (allowed as string[]).includes(raw)
    ? (raw as ListingStatus)
    : null;
  await db.update(listings).set({ status }).where(eq(listings.id, id));
  revalidatePath("/");
}

// Boucle de feedback positive : un candidat aimé devient une annonce
// sauvegardée (favori), que la routine analysera pour affiner le profil.
export async function likeCandidate(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const [row] = await db.select().from(candidates).where(eq(candidates.id, id));
  if (!row) return;
  await db.insert(listings).values({
    source: row.source,
    url: row.url,
    title: row.title,
    price: row.price,
    location: row.location,
    surface: row.surface,
    rooms: row.rooms,
    photos: row.photos ?? [],
    kind: row.kind,
    raw: { fromCandidate: { runId: row.runId, score: row.score, reasons: row.reasons } },
  });
  await db.delete(candidates).where(eq(candidates.id, id));
  revalidatePath("/");
  revalidatePath("/candidats");
  revalidatePath("/carte");
}

// Géocode une partie des localisations manquantes pour la carte (bouton sur
// /carte ; Nominatim impose ~1 requête/s, d'où le lot limité).
export async function geocodeMoreAction() {
  await requireAuth();
  const [ls, cs] = await Promise.all([
    db.select({ location: listings.location }).from(listings),
    db.select({ location: candidates.location }).from(candidates),
  ]);
  const locations = [...ls, ...cs]
    .map((r) => r.location)
    .filter((l): l is string => !!l);
  await geocodeMissing(locations, 10);
  revalidatePath("/carte");
}

// Veille rapide depuis le site : contrôle en parallèle (timeout 7 s chacune)
// les annonces encore en ligne. Les portails qui bloquent les requêtes
// automatiques restent inchangés (la routine prend le relais avec de
// meilleurs outils). Renvoie un petit bilan pour l'affichage.
export async function runWatchAction(): Promise<{
  checked: number;
  blocked: number;
  priceChanges: number;
  gone: number;
}> {
  await requireAuth();
  const all = await db.select().from(listings);
  const batch = all.filter((r) => !r.gone).slice(0, 40);
  const results = await Promise.all(
    batch.map(async (row) => {
      const res = await checkUrl(row.url);
      const applied = await applyCheck(row, res);
      return { res, applied };
    })
  );
  revalidatePath("/");
  return {
    checked: results.filter((r) => r.res.state !== "unknown").length,
    blocked: results.filter((r) => r.res.state === "unknown").length,
    priceChanges: results.filter((r) => r.applied.priceChanged).length,
    gone: results.filter((r) => r.res.state === "gone").length,
  };
}

export async function deleteCandidate(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) {
    await db.delete(candidates).where(eq(candidates.id, id));
    revalidatePath("/candidats");
  }
}

// Exclusion définitive d'un candidat : blacklist (l'URL ne reviendra plus)
// puis suppression de la liste courante.
export async function excludeCandidate(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const [row] = await db.select().from(candidates).where(eq(candidates.id, id));
  if (!row) return;
  await db
    .insert(blacklist)
    .values({
      url: row.url,
      title: row.title,
      source: row.source,
      reason: "exclu depuis la page candidats",
    })
    .onConflictDoNothing({ target: blacklist.url });
  await db.delete(candidates).where(eq(candidates.id, id));
  revalidatePath("/candidats");
  revalidatePath("/exclusions");
}

// Exclusion définitive d'une annonce sauvegardée : suppression + blacklist,
// pour que le skill ne la repropose jamais en candidat.
export async function excludeListing(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const [row] = await db.select().from(listings).where(eq(listings.id, id));
  if (!row) return;
  await db
    .insert(blacklist)
    .values({
      url: row.url,
      title: row.title,
      source: row.source,
      reason: "annonce sauvegardée exclue",
    })
    .onConflictDoNothing({ target: blacklist.url });
  await db.delete(listings).where(eq(listings.id, id));
  revalidatePath("/");
  revalidatePath("/exclusions");
}

// Sort une URL de la blacklist (elle pourra de nouveau être proposée).
export async function restoreBlacklisted(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id") ?? "");
  if (id) {
    await db.delete(blacklist).where(eq(blacklist.id, id));
    revalidatePath("/exclusions");
  }
}

// Enregistre le profil édité depuis /profil. Le formulaire envoie les champs
// simples + les listes de traits sérialisées en JSON (préférences/répulsions,
// avec poids, épinglage et rédhibitoire). Les données internes du skill
// (analyzedListings, version, sources des thèmes) sont préservées.
export async function saveProfile(formData: FormData) {
  await requireAuth();
  const kind: Kind = formData.get("kind") === "location" ? "location" : "achat";

  const num = (name: string): number | null => {
    const raw = String(formData.get(name) ?? "").replace(/[^\d]/g, "");
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  };
  const list = (name: string): string[] =>
    String(formData.get(name) ?? "")
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  type Pref = NonNullable<ProfileData["preferences"]>[number];
  type Rep = NonNullable<ProfileData["repulsions"]>[number];
  const parseTraits = <T extends Pref | Rep>(name: string): T[] => {
    try {
      const parsed = JSON.parse(String(formData.get(name) ?? "[]"));
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (t) => t && typeof t.theme === "string" && t.theme.trim().length > 0
        )
        .map((t) => ({
          ...t,
          theme: t.theme.trim(),
          weight: Math.min(5, Math.max(1, Math.round(Number(t.weight) || 3))),
        })) as T[];
    } catch {
      return [];
    }
  };

  // Repart du profil existant pour préserver la mémoire du skill
  // (analyzedListings notamment). L'ancienne ligne "default" sert de repli
  // pour le profil achat.
  const rows = await db.select().from(profile);
  const existingRow =
    rows.find((r) => r.id === kind) ??
    (kind === "achat" ? rows.find((r) => r.id === "default") : undefined);
  const existing: ProfileData = existingRow?.data ?? {};

  const instructions = String(formData.get("instructions") ?? "").trim();

  // Taux d'intérêt : accepte les décimales ("3,4" ou "3.4").
  const dec = (name: string): number | null => {
    const raw = String(formData.get(name) ?? "")
      .replace(",", ".")
      .replace(/[^\d.]/g, "");
    if (!raw) return null;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  };

  const data: ProfileData = {
    ...existing,
    updatedAt: new Date().toISOString(),
    budget: { min: num("budgetMin"), max: num("budgetMax") },
    surface: { min: num("surfaceMin"), max: num("surfaceMax") },
    rooms: { min: num("roomsMin"), max: num("roomsMax") },
    financing:
      kind === "achat"
        ? {
            apport: num("finApport"),
            taux: dec("finTaux"),
            duree: num("finDuree"),
          }
        : existing.financing,
    locations: list("locations"),
    propertyTypes: list("propertyTypes"),
    instructions: instructions.length > 0 ? instructions : undefined,
    preferences: parseTraits<Pref>("preferences"),
    repulsions: parseTraits<Rep>("repulsions"),
  };

  await db
    .insert(profile)
    .values({ id: kind, data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: profile.id,
      set: { data, updatedAt: new Date() },
    });

  revalidatePath("/profil");
}
