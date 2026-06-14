import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidates, type Candidate } from "@/db/schema";
import { logout, deleteCandidate } from "../actions";

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
          <form action={deleteCandidate}>
            <input type="hidden" name="id" value={item.id} />
            <button className="danger" type="submit">
              Supprimer
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default async function Candidats() {
  // Tous les candidats accumulés, classés par score puis par date.
  const rows = await db
    .select()
    .from(candidates)
    .orderBy(desc(candidates.score), desc(candidates.createdAt));

  return (
    <>
      <header className="header">
        <h1>
          Candidats trouvés
          <span className="count">{rows.length} annonce{rows.length > 1 ? "s" : ""}</span>
        </h1>
        <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <a href="/">← Mes annonces</a>
          <a href="/profil">Mon profil →</a>
          <form action={logout}>
            <button type="submit">Se déconnecter</button>
          </form>
        </nav>
      </header>
      <div className="container">
        {rows.length === 0 ? (
          <div className="empty">
            Aucun candidat pour l&apos;instant. La routine <code>recherche-immo</code>{" "}
            en ajoutera à chaque passage (sans doublon). Tu peux supprimer ceux qui ne
            t&apos;intéressent pas.
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
