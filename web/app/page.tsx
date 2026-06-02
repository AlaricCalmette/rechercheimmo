import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings, type Listing } from "@/db/schema";
import { deleteListing, logout } from "./actions";

export const dynamic = "force-dynamic";

function formatPrice(price: number | null): string | null {
  if (price == null) return null;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

function Card({ item }: { item: Listing }) {
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
        <span className="badge">{item.source}</span>
        <a
          className="title"
          href={item.url}
          target="_blank"
          rel="noreferrer"
        >
          {item.title ?? item.url}
        </a>
        <div className="meta">
          {price && <span className="price">{price}</span>}
          {item.surface && <span>{item.surface}</span>}
          {item.rooms && <span>{item.rooms}</span>}
          {item.location && <span>{item.location}</span>}
        </div>
        {item.notes && <div className="note">{item.notes}</div>}
        <div className="actions">
          <a href={item.url} target="_blank" rel="noreferrer">
            Voir l&apos;annonce →
          </a>
          <form action={deleteListing}>
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

export default async function Home() {
  const rows = await db
    .select()
    .from(listings)
    .orderBy(desc(listings.createdAt));

  return (
    <>
      <header className="header">
        <h1>
          Mes annonces<span className="count">{rows.length} sauvegardée{rows.length > 1 ? "s" : ""}</span>
        </h1>
        <form action={logout}>
          <button type="submit">Se déconnecter</button>
        </form>
      </header>
      <div className="container">
        {rows.length === 0 ? (
          <div className="empty">
            Aucune annonce pour l&apos;instant. Sauvegarde-en une depuis
            l&apos;extension Chrome.
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
