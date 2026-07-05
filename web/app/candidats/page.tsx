import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidates, type Candidate, type Kind } from "@/db/schema";
import { deleteCandidate, excludeCandidate } from "../actions";
import { Nav } from "../Nav";

export const dynamic = "force-dynamic";

function formatPrice(price: number | null, kind: Kind): string | null {
  if (price == null) return null;
  const p = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
  return kind === "location" ? `${p}/mois` : p;
}

function Card({ item }: { item: Candidate }) {
  const photo = item.photos?.[0] ?? null;
  const price = formatPrice(item.price, item.kind);
  return (
    <div className="card">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="photo" src={photo} alt={item.title ?? ""} loading="lazy" />
      ) : (
        <div className="no-photo">Pas de photo</div>
      )}
      <div className="body">
        <div className="head-row">
          <span className="badge">{item.source}</span>
          <span className={`kind-badge kind-${item.kind}`}>{item.kind}</span>
          <span className="spacer" />
          {item.score != null && <span className="score">{item.score}/100</span>}
        </div>
        <a className="title" href={item.url} target="_blank" rel="noreferrer">
          {item.title ?? item.url}
        </a>
        <div className="meta">
          {price && <span className="price">{price}</span>}
          {item.surface && <span>{item.surface}</span>}
          {item.rooms && <span>{item.rooms}</span>}
          {item.location && <span>{item.location}</span>}
        </div>
        {item.reasons && <div className="note">{item.reasons}</div>}
        <div className="actions">
          <a href={item.url} target="_blank" rel="noreferrer">
            Voir l&apos;annonce →
          </a>
          <div className="btn-group">
            <form action={deleteCandidate}>
              <input type="hidden" name="id" value={item.id} />
              <button
                className="ghost small"
                type="submit"
                title="Retire de la liste (peut réapparaître à un prochain passage)"
              >
                Retirer
              </button>
            </form>
            <form action={excludeCandidate}>
              <input type="hidden" name="id" value={item.id} />
              <button
                className="danger small"
                type="submit"
                title="Liste noire : cette annonce ne sera plus jamais proposée"
              >
                Exclure
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function Candidats({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind: kindParam } = await searchParams;
  const kind: Kind = kindParam === "location" ? "location" : "achat";

  // Tous les candidats accumulés, classés par score puis par date.
  const all = await db
    .select()
    .from(candidates)
    .orderBy(desc(candidates.score), desc(candidates.createdAt));
  const rows = all.filter((r) => r.kind === kind);
  const countAchat = all.filter((r) => r.kind === "achat").length;
  const countLocation = all.length - countAchat;

  return (
    <>
      <Nav active="candidats" />
      <div className="page-head">
        <h1>
          Candidats trouvés
          <span className="count">
            {rows.length} annonce{rows.length > 1 ? "s" : ""} en {kind}
          </span>
        </h1>
        <div className="tabs">
          <a
            className={`tab tab-achat${kind === "achat" ? " active" : ""}`}
            href="/candidats?kind=achat"
          >
            Achat <span className="tab-count">{countAchat}</span>
          </a>
          <a
            className={`tab tab-location${kind === "location" ? " active" : ""}`}
            href="/candidats?kind=location"
          >
            Location <span className="tab-count">{countLocation}</span>
          </a>
        </div>
      </div>
      <p className="page-sub">
        « Retirer » enlève simplement le candidat ; « Exclure » le met en liste
        noire pour qu&apos;il ne soit plus jamais reproposé par la routine.
      </p>
      <div className="container">
        {rows.length === 0 ? (
          <div className="empty">
            Aucun candidat {kind} pour l&apos;instant. La routine{" "}
            <code>recherche-immo</code> produit une liste achat et une liste
            location à chaque passage.
          </div>
        ) : (
          <div className="grid">
            {rows.map((item) => (
              <Card key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
