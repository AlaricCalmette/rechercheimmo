"use client";

import { useEffect, useRef, useTransition } from "react";

// Géocode les localisations manquantes par lots de 10 (Nominatim impose
// ~1 requête/s). Se lance automatiquement à l'ouverture de la carte et
// enchaîne les lots tant que chaque lot fait baisser le nombre restant
// (l'action revalide la page, qui renvoie un nouveau `missing`).
export function GeocodeButton({
  action,
  missing,
}: {
  action: () => Promise<void>;
  missing: number;
}) {
  const [pending, startTransition] = useTransition();
  const lastMissing = useRef<number | null>(null);

  useEffect(() => {
    if (pending || missing === 0) return;
    if (lastMissing.current !== null && missing >= lastMissing.current) return;
    lastMissing.current = missing;
    startTransition(() => action());
  }, [action, missing, pending]);

  return (
    <button
      type="button"
      className="small"
      disabled={pending}
      onClick={() => {
        lastMissing.current = missing;
        startTransition(() => action());
      }}
    >
      {pending
        ? `Placement sur la carte… (${missing} restante${missing > 1 ? "s" : ""})`
        : `Placer ${missing} localisation${missing > 1 ? "s" : ""} manquante${missing > 1 ? "s" : ""}`}
    </button>
  );
}
