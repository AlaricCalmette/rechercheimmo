"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { STATUS_LABELS } from "@/lib/format";

// Barre de tri / filtres / recherche commune aux pages Mes annonces et
// Candidats. Tout vit dans l'URL : chaque changement met à jour les
// searchParams (en conservant l'onglet achat/location).

const SORT_OPTIONS: { value: string; label: string; needsScore?: boolean }[] = [
  { value: "", label: "Tri par défaut" },
  { value: "score", label: "Meilleur score", needsScore: true },
  { value: "date", label: "Plus récentes" },
  { value: "prix", label: "Prix croissant" },
  { value: "prix_desc", label: "Prix décroissant" },
  { value: "m2", label: "€/m² croissant" },
  { value: "surface_desc", label: "Surface décroissante" },
];

export function FilterBar({
  sources,
  showScoreSort = false,
  showStatus = false,
}: {
  sources: string[];
  showScoreSort?: boolean;
  showStatus?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const hasFilters = ["q", "sort", "source", "min", "max", "status"].some((k) =>
    params.get(k)
  );

  return (
    <div className="filterbar">
      <input
        type="search"
        className="filter-search"
        placeholder="Rechercher (titre, ville, notes…)"
        defaultValue={params.get("q") ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          // Petite temporisation pour ne pas naviguer à chaque frappe.
          window.clearTimeout((window as unknown as { _fbT?: number })._fbT);
          (window as unknown as { _fbT?: number })._fbT = window.setTimeout(
            () => set({ q: v }),
            350
          );
        }}
      />
      <select
        value={params.get("sort") ?? ""}
        onChange={(e) => set({ sort: e.target.value })}
        title="Ordre de tri"
      >
        {SORT_OPTIONS.filter((o) => showScoreSort || !o.needsScore).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {sources.length > 1 && (
        <select
          value={params.get("source") ?? ""}
          onChange={(e) => set({ source: e.target.value })}
          title="Filtrer par portail"
        >
          <option value="">Tous les portails</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      <div className="filter-range" title="Fourchette de prix">
        <input
          inputMode="numeric"
          placeholder="€ min"
          defaultValue={params.get("min") ?? ""}
          onChange={(e) => set({ min: e.target.value.replace(/[^\d]/g, "") })}
        />
        <span>–</span>
        <input
          inputMode="numeric"
          placeholder="€ max"
          defaultValue={params.get("max") ?? ""}
          onChange={(e) => set({ max: e.target.value.replace(/[^\d]/g, "") })}
        />
      </div>
      {showStatus && (
        <select
          value={params.get("status") ?? ""}
          onChange={(e) => set({ status: e.target.value })}
          title="Filtrer par statut de suivi"
        >
          <option value="">Tous les suivis</option>
          <option value="aucun">Sans statut</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      )}
      {hasFilters && (
        <button
          type="button"
          className="ghost small"
          onClick={() =>
            set({ q: "", sort: "", source: "", min: "", max: "", status: "" })
          }
        >
          Réinitialiser
        </button>
      )}
    </div>
  );
}
