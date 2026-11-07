import type { Kind, PricePoint, ProfileData, ScorePoint } from "@/db/schema";
import {
  formatEuros,
  formatPrice,
  monthlyPayment,
  priceChange,
  pricePerM2,
} from "@/lib/format";

// Morceaux de carte partagés entre Mes annonces, Candidats et le comparateur.

export function PriceMeta({
  price,
  surface,
  rooms,
  location,
  kind,
  financing,
  history,
}: {
  price: number | null;
  surface: string | null;
  rooms: string | null;
  location: string | null;
  kind: Kind;
  financing?: ProfileData["financing"];
  history?: PricePoint[] | null;
}) {
  const p = formatPrice(price, kind);
  const m2 = pricePerM2(price, surface);
  const monthly = kind === "achat" ? monthlyPayment(price, financing) : null;
  const change = priceChange(price, history ?? null);
  return (
    <>
      <div className="meta">
        {p && <span className="price">{p}</span>}
        {change && (
          <span
            className={`price-change ${change.pct < 0 ? "down" : "up"}`}
            title={`Ancien prix : ${formatEuros(change.from)}`}
          >
            {change.pct < 0 ? "↓" : "↑"} {Math.abs(change.pct)} %
          </span>
        )}
        {surface && <span>{surface}</span>}
        {rooms && <span>{rooms}</span>}
        {location && <span>{location}</span>}
      </div>
      {(m2 != null || monthly != null) && (
        <div className="meta meta-sub">
          {m2 != null && (
            <span title="Prix rapporté à la surface">
              {formatEuros(m2)}/m²{kind === "location" ? " /mois" : ""}
            </span>
          )}
          {monthly != null && (
            <span title="Mensualité estimée d'après le plan de financement du profil achat (hors assurance)">
              ≈ {formatEuros(monthly)}/mois de crédit
            </span>
          )}
        </div>
      )}
    </>
  );
}

// Détail du score : barres positives (vert) et négatives (rouge) par trait.
export function ScoreDetails({ details }: { details: ScorePoint[] | null }) {
  if (!details || details.length === 0) return null;
  const sorted = [...details].sort((a, b) => b.points - a.points);
  const maxAbs = Math.max(...sorted.map((d) => Math.abs(d.points)), 1);
  return (
    <details className="score-details">
      <summary>Pourquoi ce score ?</summary>
      <ul>
        {sorted.map((d, i) => (
          <li key={i} className={d.points < 0 ? "neg" : "pos"}>
            <span className="sd-label">{d.label}</span>
            <span className="sd-bar">
              <span
                style={{ width: `${(Math.abs(d.points) / maxAbs) * 100}%` }}
              />
            </span>
            <span className="sd-points">
              {d.points > 0 ? "+" : ""}
              {d.points}
            </span>
          </li>
        ))}
      </ul>
      <a className="sd-link" href="/profil">
        Ajuster les poids dans le profil →
      </a>
    </details>
  );
}
