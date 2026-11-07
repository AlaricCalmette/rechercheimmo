"use client";

import { useTransition } from "react";
import { STATUS_LABELS } from "@/lib/format";

// Sélecteur de statut de suivi d'une annonce (pipeline de recherche) :
// enregistre dès le changement via l'action serveur passée en prop.
export function StatusSelect({
  id,
  status,
  action,
}: {
  id: string;
  status: string | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      className={`status-select${status ? ` status-${status}` : ""}`}
      value={status ?? ""}
      disabled={pending}
      title="Statut de suivi de cette annonce"
      onChange={(e) => {
        const formData = new FormData();
        formData.set("id", id);
        formData.set("status", e.target.value);
        startTransition(() => action(formData));
      }}
    >
      <option value="">— suivi —</option>
      {Object.entries(STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
