import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings, type Listing, type PricePoint } from "@/db/schema";

// Veille des annonces sauvegardées : détecte les changements de prix et les
// annonces disparues (vendues / retirées).
//
// Deux voies alimentent la veille :
// - la routine (skill) visite les annonces avec ses propres outils, plus
//   robustes face aux protections anti-bot, et POSTe les résultats sur
//   /api/listings/check ;
// - le bouton « Lancer la veille » du site fait un contrôle simple par fetch
//   (checkUrl). Beaucoup de portails bloquent ce genre de requête : dans ce
//   cas le résultat est « unknown » et rien n'est modifié.

export type CheckResult = {
  state: "ok" | "gone" | "unknown";
  price: number | null;
};

const GONE_PATTERNS = [
  /annonce (n['’]est plus|est désormais) (disponible|en ligne|active)/i,
  /cette annonce (a été|est) (supprimée|retirée|désactivée|expirée)/i,
  /annonce (expirée|désactivée|supprimée|retirée)/i,
  /ce bien (a été|est) (vendu|loué)/i,
  /n['’]est plus disponible/i,
];

function priceFromHtml(html: string): number | null {
  const toNum = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string") {
      const n = parseInt(v.replace(/[^\d]/g, ""), 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return null;
  };
  // JSON-LD : offers.price, offers.priceSpecification.price…
  const scripts = html.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const m of scripts) {
    try {
      const parsed = JSON.parse(m[1]);
      const stack: unknown[] = [parsed];
      while (stack.length) {
        const o = stack.pop();
        if (!o || typeof o !== "object") continue;
        if (Array.isArray(o)) {
          stack.push(...o);
          continue;
        }
        const rec = o as Record<string, unknown>;
        const offers = rec.offers as Record<string, unknown> | undefined;
        const candidates = [
          offers?.price,
          (offers?.priceSpecification as Record<string, unknown> | undefined)?.price,
          rec["@type"] === "Offer" ? rec.price : undefined,
        ];
        for (const c of candidates) {
          const n = toNum(c);
          if (n) return n;
        }
        for (const v of Object.values(rec)) {
          if (v && typeof v === "object") stack.push(v);
        }
      }
    } catch {
      /* JSON-LD invalide */
    }
  }
  const meta = html.match(
    /<meta[^>]+(?:property|name)=["'](?:product|og):price:amount["'][^>]+content=["']([^"']+)["']/i
  );
  return meta ? toNum(meta[1]) : null;
}

export async function checkUrl(url: string): Promise<CheckResult> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(7000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
    });
    if (res.status === 404 || res.status === 410) {
      return { state: "gone", price: null };
    }
    if (!res.ok) return { state: "unknown", price: null };
    const html = await res.text();
    const text = html.replace(/<[^>]+>/g, " ");
    if (GONE_PATTERNS.some((re) => re.test(text))) {
      return { state: "gone", price: null };
    }
    return { state: "ok", price: priceFromHtml(html) };
  } catch {
    return { state: "unknown", price: null };
  }
}

// Applique un résultat de contrôle à une annonce : ajoute l'ancien prix à
// l'historique si le prix change, met à jour le drapeau « disparue » et la
// date de contrôle. Un résultat « unknown » ne modifie rien.
export async function applyCheck(
  row: Listing,
  result: CheckResult
): Promise<{ priceChanged: boolean; goneChanged: boolean }> {
  if (result.state === "unknown") return { priceChanged: false, goneChanged: false };

  const now = new Date();
  const patch: Partial<Listing> = { lastCheckedAt: now };
  let priceChanged = false;
  const gone = result.state === "gone";
  const goneChanged = gone !== (row.gone ?? false);
  patch.gone = gone;

  if (!gone && result.price != null && result.price > 0 && result.price !== row.price) {
    if (row.price != null) {
      const history: PricePoint[] = [...(row.priceHistory ?? [])];
      history.push({ date: now.toISOString(), price: row.price });
      patch.priceHistory = history.slice(-20);
    }
    patch.price = result.price;
    priceChanged = true;
  }

  await db.update(listings).set(patch).where(eq(listings.id, row.id));
  return { priceChanged, goneChanged };
}
