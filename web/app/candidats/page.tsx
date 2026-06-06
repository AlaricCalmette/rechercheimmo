import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidates, type Candidate } from "@/db/schema";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

function formatPrice(price: number | null): string | null {
  if (price == null) return null;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

function Card({ item }: { item: Candidate }) {
  const photo = item.photos?.[0] ?? null;
  const price = formatPrice(item.price);
  return (
    <div className="card">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="photo" src={photo} alt={item.title ?? ""} loading="lazy" />
      ) : (
        <div className="no-photo">Pas de photo</div>
      )}
      <div className="body">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="badge">{item.source}</span>
          {item.score != null && <span className="score">Score {item.score}/100</span>}
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
        </div>
      </div>
    </div>
  );
}

export default async function Candidats() {
  const latest = await db
    .select({ runId: candidates.runId, createdAt: candidates.createdAt })
    .from(candidates)
    .orderBy(desc(candidates.createdAt))
    .limit(1);

  const rows =
    latest.length === 0
      ? []
      : await db
          .select()
          .from(candidates)
          .where(eq(candidates.runId, latest[0].runId))
          .orderBy(desc(candidates.score));

  const runDate =
    latest.length > 0
      ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(
          latest[0].createdAt
        )
      : null;

  return (
    <>
      <header className="header">
        <h1>
          Candidats trouvés
          <span className="count">{rows.length} annonce{rows.length > 1 ? "s" : ""}</span>
        </h1>
        <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <a href="/">← Mes annonces</a>
          <form action={logout}>
            <button type="submit">Se déconnecter</button>
          </form>
        </nav>
      </header>
      <div className="container">
        {runDate && (
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            Dernier passage du skill : {runDate}
          </p>
        )}
        {rows.length === 0 ? (
          <div className="empty">
            Aucun candidat pour l&apos;instant. Lance le skill <code>recherche-immo</code>{" "}
            (ou attends la prochaine routine planifiée).
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
