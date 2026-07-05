"use client";

import { useState, useTransition } from "react";
import type { ProfileData, Kind } from "@/db/schema";
import { saveProfile } from "../actions";

// Éditeur du profil de goût d'un type de projet (achat ou location).
// Tout est modifiable : fourchettes, zones, types de bien, consignes libres,
// et surtout les traits (préférences / répulsions) avec leur importance (1-5)
// et un épinglage « fixé » que le skill n'a pas le droit de modifier.

type Pref = {
  theme: string;
  weight: number;
  pinned?: boolean;
  sources?: string[];
};
type Rep = { theme: string; weight: number; redhibitory?: boolean; pinned?: boolean };

const WEIGHT_LABELS: Record<number, string> = {
  1: "1 — anecdotique",
  2: "2 — appréciable",
  3: "3 — important",
  4: "4 — très important",
  5: "5 — essentiel",
};

function WeightSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (w: number) => void;
}) {
  return (
    <select
      value={Math.min(5, Math.max(1, value))}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      title="Importance de ce trait dans le classement"
    >
      {[1, 2, 3, 4, 5].map((w) => (
        <option key={w} value={w}>
          {WEIGHT_LABELS[w]}
        </option>
      ))}
    </select>
  );
}

export function ProfileEditor({
  kind,
  initial,
}: {
  kind: Kind;
  initial: ProfileData | null;
}) {
  const [prefs, setPrefs] = useState<Pref[]>(
    (initial?.preferences ?? []).map((p) => ({ ...p }))
  );
  const [reps, setReps] = useState<Rep[]>(
    (initial?.repulsions ?? []).map((r) => ({ ...r }))
  );
  const [newPref, setNewPref] = useState("");
  const [newRep, setNewRep] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const updatePref = (i: number, patch: Partial<Pref>) =>
    setPrefs((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const updateRep = (i: number, patch: Partial<Rep>) =>
    setReps((l) => l.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const addPref = () => {
    const theme = newPref.trim();
    if (!theme) return;
    setPrefs((l) => [...l, { theme, weight: 4, pinned: true }]);
    setNewPref("");
  };
  const addRep = () => {
    const theme = newRep.trim();
    if (!theme) return;
    setReps((l) => [...l, { theme, weight: 4, pinned: true }]);
    setNewRep("");
  };

  const sortedPrefs = prefs
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.weight - a.p.weight);
  const sortedReps = reps
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        Number(b.r.redhibitory ?? false) - Number(a.r.redhibitory ?? false) ||
        b.r.weight - a.r.weight
    );

  return (
    <form
      className="profile-form"
      action={(formData) => {
        startTransition(async () => {
          await saveProfile(formData);
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        });
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="preferences" value={JSON.stringify(prefs)} />
      <input type="hidden" name="repulsions" value={JSON.stringify(reps)} />

      <div className="profile-grid">
        <div className="profile-field">
          <span className="profile-label">
            Budget {kind === "location" ? "(€ / mois)" : "(€)"}
          </span>
          <div className="range-inputs">
            <input
              name="budgetMin"
              inputMode="numeric"
              placeholder="min"
              defaultValue={initial?.budget?.min ?? ""}
            />
            <span>–</span>
            <input
              name="budgetMax"
              inputMode="numeric"
              placeholder="max"
              defaultValue={initial?.budget?.max ?? ""}
            />
          </div>
        </div>
        <div className="profile-field">
          <span className="profile-label">Surface (m²)</span>
          <div className="range-inputs">
            <input
              name="surfaceMin"
              inputMode="numeric"
              placeholder="min"
              defaultValue={initial?.surface?.min ?? ""}
            />
            <span>–</span>
            <input
              name="surfaceMax"
              inputMode="numeric"
              placeholder="max"
              defaultValue={initial?.surface?.max ?? ""}
            />
          </div>
        </div>
        <div className="profile-field">
          <span className="profile-label">Pièces</span>
          <div className="range-inputs">
            <input
              name="roomsMin"
              inputMode="numeric"
              placeholder="min"
              defaultValue={initial?.rooms?.min ?? ""}
            />
            <span>–</span>
            <input
              name="roomsMax"
              inputMode="numeric"
              placeholder="max"
              defaultValue={initial?.rooms?.max ?? ""}
            />
          </div>
        </div>
        <div className="profile-field">
          <span className="profile-label">Types de bien</span>
          <input
            name="propertyTypes"
            placeholder="maison, appartement…"
            defaultValue={(initial?.propertyTypes ?? []).join(", ")}
          />
        </div>
        <div className="profile-field" style={{ gridColumn: "1 / -1" }}>
          <span className="profile-label">Localisations (une par ligne ou séparées par des virgules)</span>
          <textarea
            name="locations"
            rows={2}
            placeholder="Villeneuve-sur-Lot (47), Bergerac (24)…"
            defaultValue={(initial?.locations ?? []).join(", ")}
          />
        </div>
        <div className="profile-field" style={{ gridColumn: "1 / -1" }}>
          <span className="profile-label">Consignes libres pour la routine</span>
          <textarea
            name="instructions"
            rows={3}
            placeholder="Ex : privilégie les biens à moins de 20 min d'une gare ; ignore les maisons mitoyennes…"
            defaultValue={initial?.instructions ?? ""}
          />
        </div>
      </div>

      <section className="profile-section">
        <h2>Ce qui te plaît</h2>
        <p className="section-hint">
          Règle l&apos;importance de chaque trait (5 = essentiel). Coche
          « fixé » pour verrouiller un trait : la routine ne pourra ni le
          supprimer ni changer son poids.
        </p>
        <div className="trait-list">
          {sortedPrefs.map(({ p, i }) => (
            <div className={`trait-row${p.pinned ? " pinned" : ""}`} key={i}>
              <input
                type="text"
                value={p.theme}
                onChange={(e) => updatePref(i, { theme: e.target.value })}
              />
              <WeightSelect
                value={p.weight}
                onChange={(weight) => updatePref(i, { weight, pinned: true })}
              />
              <label className="trait-toggle" title="La routine ne modifie pas un trait fixé">
                <input
                  type="checkbox"
                  checked={p.pinned ?? false}
                  onChange={(e) => updatePref(i, { pinned: e.target.checked })}
                />
                fixé
              </label>
              <button
                type="button"
                className="trait-remove"
                aria-label="Supprimer ce trait"
                onClick={() => setPrefs((l) => l.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="trait-add">
          <input
            type="text"
            value={newPref}
            placeholder="Ajouter une préférence (ex : pierre apparente)"
            onChange={(e) => setNewPref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPref();
              }
            }}
          />
          <button type="button" className="small" onClick={addPref}>
            + Ajouter
          </button>
        </div>
      </section>

      <section className="profile-section">
        <h2>Ce que tu veux éviter</h2>
        <p className="section-hint">
          « Rédhibitoire » élimine directement une annonce ; sinon le trait
          pénalise seulement le score.
        </p>
        <div className="trait-list">
          {sortedReps.map(({ r, i }) => (
            <div className={`trait-row neg${r.pinned ? " pinned" : ""}`} key={i}>
              <input
                type="text"
                value={r.theme}
                onChange={(e) => updateRep(i, { theme: e.target.value })}
              />
              <WeightSelect
                value={r.weight}
                onChange={(weight) => updateRep(i, { weight, pinned: true })}
              />
              <label className="trait-toggle" title="Élimine l'annonce au lieu de seulement baisser son score">
                <input
                  type="checkbox"
                  checked={r.redhibitory ?? false}
                  onChange={(e) =>
                    updateRep(i, { redhibitory: e.target.checked, pinned: true })
                  }
                />
                ⛔ rédhibitoire
              </label>
              <label className="trait-toggle" title="La routine ne modifie pas un trait fixé">
                <input
                  type="checkbox"
                  checked={r.pinned ?? false}
                  onChange={(e) => updateRep(i, { pinned: e.target.checked })}
                />
                fixé
              </label>
              <button
                type="button"
                className="trait-remove"
                aria-label="Supprimer ce trait"
                onClick={() => setReps((l) => l.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="trait-add">
          <input
            type="text"
            value={newRep}
            placeholder="Ajouter une répulsion (ex : route passante)"
            onChange={(e) => setNewRep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRep();
              }
            }}
          />
          <button type="button" className="small" onClick={addRep}>
            + Ajouter
          </button>
        </div>
      </section>

      <div className="profile-save-bar">
        <button className="primary" type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer le profil"}
        </button>
        {saved && <span className="save-status">Profil enregistré ✓</span>}
      </div>
    </form>
  );
}
