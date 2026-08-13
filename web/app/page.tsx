import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings, type Listing, type Kind } from "@/db/schema";
import {
  deleteListing,
  excludeListing,
  setListingKind,
  setListingRequested,
} from "./actions";
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

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
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

// Bouton d'envoi : bascule l'annonce dans (ou hors de) l'onglet « Demande
// envoyée ».
function RequestButton({ item }: { item: Listing }) {
  const sent = item.requestedAt != null;
  return (
    <form action={setListingRequested}>
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="requested" value={sent ? "0" : "1"} />
      <button
        className={`small${sent ? " on-request" : ""}`}
        type="submit"
        title={
          sent
            ? "Annule le marquage : l'annonce sort de l'onglet « Demande envoyée »"
            : "Marque l'annonce comme contactée : elle rejoint l'onglet « Demande envoyée »"
        }
      >
        {sent ? "Annuler la demande" : "Demande envoyée"}
      </button>
    </form>
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
          {item.requestedAt && (
            <span
              className="request-badge"
              title={`Demande envoyée le ${formatDate(item.requestedAt)}`}
            >
              ✉ {formatDate(item.requestedAt)}
            </span>
          )}
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
            <RequestButton item={item} />
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
  searchParams: Promise<{ kind?: string; envoi?: string }>;
}) {
  const { kind: kindParam, envoi } = await searchParams;
  // L'onglet « Demande envoyée » est transverse : il ignore le filtre
  // achat/location et montre toutes les annonces marquées.
  const sentTab = envoi === "1";
  const kind: Kind | null =
    !sentTab && (kindParam === "achat" || kindParam === "location")
      ? kindParam
      : null;

  const all = await db.select().from(listings).orderBy(desc(listings.createdAt));
  const rows = sentTab
    ? all
        .filter((r) => r.requestedAt != null)
        // Demandes les plus récentes en tête.
        .sort((a, b) => b.requestedAt!.getTime() - a.requestedAt!.getTime())
    : kind
      ? all.filter((r) => r.kind === kind)
      : all;
  const countAchat = all.filter((r) => r.kind === "achat").length;
  const countLocation = all.length - countAchat;
  const countSent = all.filter((r) => r.requestedAt != null).length;

  return (
    <>
      <Nav active="annonces" />
      <div className="page-head">
        <h1>
          Mes annonces
          <span className="count">
            {rows.length}{" "}
            {sentTab
              ? `demande${rows.length > 1 ? "s" : ""} envoyée${rows.length > 1 ? "s" : ""}`
              : `sauvegardée${rows.length > 1 ? "s" : ""}`}
          </span>
        </h1>
        <div className="tabs">
          <a
            className={`tab${!sentTab && kind === null ? " active" : ""}`}
            href="/"
          >
            Toutes <span className="tab-count">{all.length}</span>
          </a>
          <a
            className={`tab tab-achat${!sentTab && kind === "achat" ? " active" : ""}`}
            href="/?kind=achat"
          >
            Achat <span className="tab-count">{countAchat}</span>
          </a>
          <a
            className={`tab tab-location${!sentTab && kind === "location" ? " active" : ""}`}
            href="/?kind=location"
          >
            Location <span className="tab-count">{countLocation}</span>
          </a>
          <a
            className={`tab tab-envoi${sentTab ? " active" : ""}`}
            href="/?envoi=1"
          >
            Demande envoyée <span className="tab-count">{countSent}</span>
          </a>
        </div>
      </div>
      <div className="container">
        {rows.length === 0 ? (
          sentTab ? (
            <div className="empty">
              Aucune demande envoyée pour l&apos;instant. Sur chaque carte, le
              bouton « Demande envoyée » marque une annonce comme contactée :
              elle apparaîtra ici.
            </div>
          ) : (
            <div className="empty">
              Aucune annonce {kind ? `« ${kind} » ` : ""}pour l&apos;instant.
              Sauvegarde-en une depuis l&apos;extension Chrome — le badge
              Achat/Location de chaque carte alimente le profil correspondant.
            </div>
          )
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
