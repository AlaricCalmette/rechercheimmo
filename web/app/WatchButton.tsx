"use client";

import { useState, useTransition } from "react";

type Report = { checked: number; blocked: number; priceChanges: number; gone: number };

// Bouton « Lancer la veille » de la page Mes annonces : contrôle les annonces
// (prix, disparition) et affiche un bilan.
export function WatchButton({ action }: { action: () => Promise<Report> }) {
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<Report | null>(null);

  return (
    <div className="watch-button">
      <button
        type="button"
        className="small"
        disabled={pending}
        title="Revisite les annonces pour détecter une baisse de prix ou une annonce retirée"
        onClick={() =>
          startTransition(async () => {
            setReport(await action());
          })
        }
      >
        {pending ? "Veille en cours…" : "🔎 Lancer la veille"}
      </button>
      {report && !pending && (
        <span className="watch-report">
          {report.checked} vérifiée{report.checked > 1 ? "s" : ""}
          {report.priceChanges > 0 && ` · ${report.priceChanges} changement(s) de prix`}
          {report.gone > 0 && ` · ${report.gone} disparue(s)`}
          {report.blocked > 0 &&
            ` · ${report.blocked} non lisible(s) (portail protégé, la routine s'en charge)`}
        </span>
      )}
    </div>
  );
}
