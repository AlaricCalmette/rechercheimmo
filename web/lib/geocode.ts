import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { geocache } from "@/db/schema";

// Géocodage des localisations libres ("Villeréal (47)", "Bergerac"…) via
// Nominatim (OpenStreetMap), avec cache en base : une localisation n'est
// géocodée qu'une seule fois, échec compris (lat/lng null = déjà tenté).

export type Coords = { lat: number; lng: number };

function cleanLocation(location: string): string {
  // "Villeréal (47)" → "Villeréal" : le numéro de département entre
  // parenthèses perturbe Nominatim plus qu'il ne l'aide.
  return location.replace(/\(([^)]*)\)/g, " ").replace(/\s+/g, " ").trim();
}

// Renvoie la table location → coordonnées pour les localisations déjà en cache.
export async function cachedCoords(
  locations: string[]
): Promise<Map<string, Coords | null>> {
  const distinct = [...new Set(locations.filter(Boolean))];
  const map = new Map<string, Coords | null>();
  if (distinct.length === 0) return map;
  const rows = await db
    .select()
    .from(geocache)
    .where(inArray(geocache.location, distinct));
  for (const r of rows) {
    map.set(r.location, r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null);
  }
  return map;
}

// Géocode jusqu'à `limit` localisations absentes du cache (1 requête/s,
// politique Nominatim). Renvoie le nombre restant à géocoder.
export async function geocodeMissing(
  locations: string[],
  limit = 10
): Promise<{ done: number; remaining: number }> {
  const distinct = [...new Set(locations.filter(Boolean))];
  const known = await cachedCoords(distinct);
  const missing = distinct.filter((l) => !known.has(l));
  const batch = missing.slice(0, limit);

  const query = async (q: string, countrycodes?: string): Promise<Coords | null> => {
    const url =
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}` +
      `&format=jsonv2&limit=1${countrycodes ? `&countrycodes=${countrycodes}` : ""}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "RechercheImmo/1.0 (suivi personnel d'annonces)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { lat?: string; lon?: string }[];
    const hit = json?.[0];
    return hit?.lat && hit?.lon
      ? { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) }
      : null;
  };

  let done = 0;
  for (const loc of batch) {
    let coords: Coords | null = null;
    try {
      // La plupart des annonces sont françaises : on essaie d'abord en France
      // (évite qu'un « Villeréal » parte à l'étranger), puis partout ailleurs.
      coords = await query(cleanLocation(loc), "fr");
      if (!coords) {
        await new Promise((r) => setTimeout(r, 1100));
        coords = await query(cleanLocation(loc));
      }
    } catch {
      /* réseau : on enregistre l'échec, réessayable en vidant geocache */
    }
    await db
      .insert(geocache)
      .values({ location: loc, lat: coords?.lat ?? null, lng: coords?.lng ?? null })
      .onConflictDoNothing({ target: geocache.location });
    done++;
    // Politique d'usage Nominatim : au plus une requête par seconde.
    if (loc !== batch[batch.length - 1]) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
  return { done, remaining: missing.length - batch.length };
}
