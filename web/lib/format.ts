import type { Kind, PricePoint, ProfileData } from "@/db/schema";

// Formatage et petits calculs partagés par les cartes (annonces, candidats,
// comparateur) : prix, €/m², baisse de prix, mensualité estimée.

export function formatPrice(price: number | null, kind: Kind): string | null {
  if (price == null) return null;
  const p = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
  return kind === "location" ? `${p}/mois` : p;
}

export function formatEuros(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

// Extrait la surface en m² d'un texte libre ("120 m²", "surface 95m2"…).
export function parseSurfaceM2(surface: string | null): number | null {
  if (!surface) return null;
  const m = surface.replace(/ /g, " ").match(/(\d+(?:[.,]\d+)?)\s*m[²2]?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Prix au m² (achat) ou loyer au m² (location), arrondi.
export function pricePerM2(
  price: number | null,
  surface: string | null
): number | null {
  const m2 = parseSurfaceM2(surface);
  if (price == null || m2 == null) return null;
  return Math.round(price / m2);
}

// Baisse (ou hausse) de prix depuis le dernier point d'historique : renvoie
// le pourcentage signé (négatif = baisse) et l'ancien prix, ou null si pas
// d'historique exploitable.
export function priceChange(
  price: number | null,
  history: PricePoint[] | null
): { pct: number; from: number } | null {
  if (price == null || !history || history.length === 0) return null;
  const from = history[history.length - 1]?.price;
  if (typeof from !== "number" || from <= 0 || from === price) return null;
  return { pct: Math.round(((price - from) / from) * 100), from };
}

// Mensualité estimée d'un prêt amortissable classique, à partir du plan de
// financement du profil achat (apport, taux annuel %, durée en années).
// Renvoie null si le profil ne permet pas le calcul ou si l'apport couvre tout.
export function monthlyPayment(
  price: number | null,
  financing: ProfileData["financing"] | undefined
): number | null {
  if (price == null || !financing) return null;
  const { apport, taux, duree } = financing;
  if (taux == null || duree == null || duree <= 0) return null;
  const loan = price - (apport ?? 0);
  if (loan <= 0) return null;
  const n = duree * 12;
  const r = taux / 100 / 12;
  const m = r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
  return Math.round(m);
}

export const STATUS_LABELS: Record<string, string> = {
  a_contacter: "À contacter",
  contactee: "Contactée",
  visite_prevue: "Visite prévue",
  visitee: "Visitée",
  ecartee: "Écartée",
};
