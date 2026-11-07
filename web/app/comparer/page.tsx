import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings, candidates, type Kind, type ScorePoint } from "@/db/schema";
import { Nav } from "../Nav";
import {
  STATUS_LABELS,
  formatEuros,
  formatPrice,
  monthlyPayment,
  parseSurfaceM2,
  priceChange,
  pricePerM2,
} from "@/lib/format";
import { loadProfile } from "@/lib/profiles";
import { ClearCompare } from "./ClearCompare";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Item = {
  key: string;
  origin: "Favori" | "Candidat";
  kind: Kind;
  title: string;
  url: string;
  source: string;
  photo: string | null;
  price: number | null;
  surface: string | null;
  rooms: string | null;
  location: string | null;
  score: number | null;
  status: string | null;
  gone: boolean;
  likes: string | null;
  dislikes: string | null;
  scoreDetails: ScorePoint[] | null;
  change: { pct: number; from: number } | null;
};

export default async function Comparer({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids = "" } = await searchParams;
  const keys = ids.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const lIds = keys.filter((k) => k.startsWith("l:")).map((k) => k.slice(2)).filter((id) => UUID.test(id));
  const cIds = keys.filter((k) => k.startsWith("c:")).map((k) => k.slice(2)).filter((id) => UUID.test(id));

  const [ls, cs, achatProfile] = await Promise.all([
    lIds.length ? db.select().from(listings).where(inArray(listings.id, lIds)) : [],
    cIds.length ? db.select().from(candidates).where(inArray(candidates.id, cIds)) : [],
    loadProfile("achat"),
  ]);

  const items: Item[] = [];
  for (const k of keys) {
    const id = k.slice(2);
    if (k.startsWith("l:")) {
      const r = ls.find((x) => x.id === id);
      if (r)
        items.push({
          key: k,
          origin: "Favori",
          kind: r.kind,
          title: r.title ?? r.url,
          url: r.url,
          source: r.source,
          photo: r.photos?.[0] ?? null,
          price: r.price,
          surface: r.surface,
          rooms: r.rooms,
          location: r.location,
          score: null,
          status: r.status,
          gone: r.gone ?? false,
          likes: r.notes,
          dislikes: r.dislikes,
          scoreDetails: null,
          change: priceChange(r.price, r.priceHistory),
        });
    } else {
      const r = cs.find((x) => x.id === id);
      if (r)
        items.push({
          key: k,
          origin: "Candidat",
          kind: r.kind,
          title: r.title ?? r.url,
          url: r.url,
          source: r.source,
          photo: r.photos?.[0] ?? null,
          price: r.price,
          surface: r.surface,
          rooms: r.rooms,
          location: r.location,
          score: r.score,
          status: null,
          gone: false,
          likes: r.reasons,
          dislikes: null,
          scoreDetails: r.scoreDetails,
          change: null,
        });
    }
  }

  // Meilleure valeur de chaque ligne chiffrée, mise en évidence.
  const best = (vals: (number | null)[], dir: "min" | "max") => {
    const nums = vals.filter((v): v is number => v != null);
    if (nums.length < 2) return null;
    return dir === "min" ? Math.min(...nums) : Math.max(...nums);
  };
  const prices = items.map((i) => i.price);
  const m2s = items.map((i) => pricePerM2(i.price, i.surface));
  const surfaces = items.map((i) => parseSurfaceM2(i.surface));
  const scores = items.map((i) => i.score);
  const bestPrice = best(prices, "min");
  const bestM2 = best(m2s, "min");
  const bestSurface = best(surfaces, "max");
  const bestScore = best(scores, "max");
  const hl = (v: number | null, b: number | null) => (v != null && v === b ? "best" : "");

  const allTraits = [
    ...new Set(items.flatMap((i) => (i.scoreDetails ?? []).map((d) => d.label))),
  ];

  return (
    <>
      <Nav active="comparer" />
      <div className="page-head">
        <h1>
          Comparateur
          <span className="count">
            {items.length} annonce{items.length > 1 ? "s" : ""}
          </span>
        </h1>
        <ClearCompare />
      </div>
      <p className="page-sub">
        Coche l&apos;icône ⚖ sur 2 à 4 cartes (favoris ou candidats) pour les
        comparer ici. La meilleure valeur de chaque ligne est surlignée.
      </p>
      <div className="container">
        {items.length < 2 ? (
          <div className="empty">
            Sélectionne au moins deux annonces avec l&apos;icône ⚖ depuis{" "}
            <a href="/">Mes annonces</a> ou <a href="/candidats">Candidats</a>.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="compare-table">
              <tbody>
                <tr>
                  <th />
                  {items.map((i) => (
                    <td key={i.key} className="compare-head">
                      {i.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.photo} alt="" />
                      ) : (
                        <div className="no-photo">Pas de photo</div>
                      )}
                      <a href={i.url} target="_blank" rel="noreferrer">
                        {i.title}
                      </a>
                      <div className="compare-tags">
                        <span className="badge">{i.source}</span>
                        <span className={`kind-badge kind-${i.kind}`}>{i.kind}</span>
                        <span className="badge">{i.origin}</span>
                        {i.gone && <span className="gone-badge">disparue</span>}
                      </div>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Prix</th>
                  {items.map((i) => (
                    <td key={i.key} className={hl(i.price, bestPrice)}>
                      <strong>{formatPrice(i.price, i.kind) ?? "—"}</strong>
                      {i.change && (
                        <span className={`price-change ${i.change.pct < 0 ? "down" : "up"}`}>
                          {" "}
                          {i.change.pct < 0 ? "↓" : "↑"} {Math.abs(i.change.pct)} %
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>€/m²</th>
                  {items.map((i, n) => (
                    <td key={i.key} className={hl(m2s[n], bestM2)}>
                      {m2s[n] != null ? formatEuros(m2s[n]!) : "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Mensualité estimée</th>
                  {items.map((i) => {
                    const m = i.kind === "achat" ? monthlyPayment(i.price, achatProfile?.financing) : null;
                    return (
                      <td key={i.key}>
                        {m != null
                          ? `≈ ${formatEuros(m)}/mois`
                          : i.kind === "location"
                            ? "loyer"
                            : "—"}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th>Surface</th>
                  {items.map((i, n) => (
                    <td key={i.key} className={hl(surfaces[n], bestSurface)}>
                      {i.surface ?? "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Pièces</th>
                  {items.map((i) => (
                    <td key={i.key}>{i.rooms ?? "—"}</td>
                  ))}
                </tr>
                <tr>
                  <th>Localisation</th>
                  {items.map((i) => (
                    <td key={i.key}>{i.location ?? "—"}</td>
                  ))}
                </tr>
                <tr>
                  <th>Score</th>
                  {items.map((i) => (
                    <td key={i.key} className={hl(i.score, bestScore)}>
                      {i.score != null ? `${i.score}/100` : "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Suivi</th>
                  {items.map((i) => (
                    <td key={i.key}>{i.status ? STATUS_LABELS[i.status] : "—"}</td>
                  ))}
                </tr>
                <tr>
                  <th>Ce qui plaît</th>
                  {items.map((i) => (
                    <td key={i.key} className="compare-text">
                      {i.likes ?? "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Ce qui plaît moins</th>
                  {items.map((i) => (
                    <td key={i.key} className="compare-text">
                      {i.dislikes ?? "—"}
                    </td>
                  ))}
                </tr>
                {allTraits.map((label) => (
                  <tr key={label} className="compare-trait">
                    <th>{label}</th>
                    {items.map((i) => {
                      const d = i.scoreDetails?.find((x) => x.label === label);
                      return (
                        <td key={i.key} className={d ? (d.points < 0 ? "neg" : "pos") : ""}>
                          {d ? `${d.points > 0 ? "+" : ""}${d.points}` : "·"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
