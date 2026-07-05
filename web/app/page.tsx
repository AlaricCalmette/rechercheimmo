import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings, type Listing, type Kind } from "@/db/schema";
import { deleteListing, excludeListing, setListingKind } from "./actions";
import { Gallery } from "./Gallery";
import { NotesEditor } from "./NotesEditor";
import { Nav } from "./Nav";

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

function KindSwitch({ item }: { item: Listing }) {
  return (
    <div className="kind-switch" title="Type de projet : sert à séparer les profils achat et location">
      <form action={setListingKind}>
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="kind" value="achat" />
        <button type="submit" className={item.kind === "achat" ? "on-achat" : ""}>
          Achat
        </button>
      </form>
      <form action={setListingKind}>
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="kind" value="location" />
        <button
          type="submit"
          className={item.kind === "location" ? "on-location" : ""}
        >
          Location
        </button>
      </form>
    </div>
  );
}

function Card({ item }: { item: Listing }) {
  const price = formatPrice(item.price, item.kind);
  return (
    <div className="card">
      <Gallery photos={item.photos ?? []} alt={item.title ?? ""} />
      <div className="body">
        <div className="head-row">
          <span className="badge">{item.source}</span>
          <span className="spacer" />
          <KindSwitch item={item} />
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
        <NotesEditor id={item.id} notes={item.notes} dislikes={item.dislikes} />
        <div className="actions">
          <a href={item.url} target="_blank" rel="noreferrer">
            Voir l&apos;annonce →
          </a>
          <div className="btn-group">
            <form action={deleteListing}>
              <input type="hidden" name="id" value={item.id} />
              <button className="ghost small" type="submit" title="Retire l'annonce de la liste">
                Retirer
              </button>
            </form>
            <form action={excludeListing}>
              <input type="hidden" name="id" value={item.id} />
              <button
                className="danger small"
                type="submit"
                title="Retire l'annonce ET la met en liste noire : elle ne sera plus jamais proposée"
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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind: kindParam } = await searchParams;
  const kind: Kind | null =
    kindParam === "achat" || kindParam === "location" ? kindParam : null;

  const all = await db.select().from(listings).orderBy(desc(listings.createdAt));
  const rows = kind ? all.filter((r) => r.kind === kind) : all;
  const countAchat = all.filter((r) => r.kind === "achat").length;
  const countLocation = all.length - countAchat;

  return (
    <>
      <Nav active="annonces" />
      <div className="page-head">
        <h1>
          Mes annonces
          <span className="count">
            {rows.length} sauvegardée{rows.length > 1 ? "s" : ""}
          </span>
        </h1>
        <div className="tabs">
          <a className={`tab${kind === null ? " active" : ""}`} href="/">
            Toutes <span className="tab-count">{all.length}</span>
          </a>
          <a
            className={`tab tab-achat${kind === "achat" ? " active" : ""}`}
            href="/?kind=achat"
          >
            Achat <span className="tab-count">{countAchat}</span>
          </a>
          <a
            className={`tab tab-location${kind === "location" ? " active" : ""}`}
            href="/?kind=location"
          >
            Location <span className="tab-count">{countLocation}</span>
          </a>
        </div>
      </div>
      <div className="container">
        {rows.length === 0 ? (
          <div className="empty">
            Aucune annonce {kind ? `« ${kind} » ` : ""}pour l&apos;instant.
            Sauvegarde-en une depuis l&apos;extension Chrome — le badge
            Achat/Location de chaque carte alimente le profil correspondant.
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
