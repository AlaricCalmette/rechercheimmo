import { parseSurfaceM2, pricePerM2 } from "./format";

// Filtres et tris partagés par les pages Mes annonces et Candidats.
// Tout passe par l'URL (searchParams), donc partageable et sans état client.

export type SortKey =
  | "date"
  | "score"
  | "prix"
  | "prix_desc"
  | "surface_desc"
  | "m2";

export type ListFilters = {
  q: string;
  sort: SortKey | null;
  source: string;
  min: number | null;
  max: number | null;
  status: string;
};

const SORT_KEYS: SortKey[] = [
  "date",
  "score",
  "prix",
  "prix_desc",
  "surface_desc",
  "m2",
];

export function readFilters(
  params: Record<string, string | string[] | undefined>
): ListFilters {
  const str = (v: string | string[] | undefined) =>
    typeof v === "string" ? v.trim() : "";
  const num = (v: string | string[] | undefined) => {
    const raw = str(v).replace(/[^\d]/g, "");
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  };
  const sortRaw = str(params.sort);
  return {
    q: str(params.q),
    sort: (SORT_KEYS as string[]).includes(sortRaw)
      ? (sortRaw as SortKey)
      : null,
    source: str(params.source),
    min: num(params.min),
    max: num(params.max),
    status: str(params.status),
  };
}

type CommonRow = {
  title: string | null;
  location: string | null;
  price: number | null;
  surface: string | null;
  source: string;
  createdAt: Date;
  score?: number | null;
  notes?: string | null;
  reasons?: string | null;
  status?: string | null;
};

export function filterRows<T extends CommonRow>(
  rows: T[],
  f: ListFilters
): T[] {
  let out = rows;
  if (f.q) {
    const q = f.q.toLowerCase();
    out = out.filter((r) =>
      [r.title, r.location, r.notes, r.reasons]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(q))
    );
  }
  if (f.source) out = out.filter((r) => r.source === f.source);
  if (f.min != null) out = out.filter((r) => r.price != null && r.price >= f.min!);
  if (f.max != null) out = out.filter((r) => r.price != null && r.price <= f.max!);
  if (f.status) {
    out =
      f.status === "aucun"
        ? out.filter((r) => !r.status)
        : out.filter((r) => r.status === f.status);
  }
  return out;
}

// Tri stable ; les valeurs absentes partent en fin de liste.
export function sortRows<T extends CommonRow>(
  rows: T[],
  sort: SortKey | null,
  fallback: "date" | "score"
): T[] {
  const key = sort ?? fallback;
  const by = (fn: (r: T) => number | null, dir: 1 | -1) =>
    [...rows].sort((a, b) => {
      const va = fn(a);
      const vb = fn(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * dir;
    });
  switch (key) {
    case "prix":
      return by((r) => r.price, 1);
    case "prix_desc":
      return by((r) => r.price, -1);
    case "surface_desc":
      return by((r) => parseSurfaceM2(r.surface), -1);
    case "m2":
      return by((r) => pricePerM2(r.price, r.surface), 1);
    case "score":
      return by((r) => r.score ?? null, -1);
    case "date":
    default:
      return by((r) => r.createdAt.getTime(), -1);
  }
}
