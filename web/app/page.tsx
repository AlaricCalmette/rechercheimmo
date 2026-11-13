import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings, type Listing, type Kind, type ProfileData } from "@/db/schema";
import {
  deleteListing,
  excludeListing,
  setListingKind,
  setListingStatus,
  runWatchAction,
} from "./actions";
import { WatchButton } from "./WatchButton";
import { Gallery } from "./Gallery";
import { NotesEditor } from "./NotesEditor";
import { Nav } from "./Nav";
import { ConfirmForm } from "./ConfirmForm";
import { StatusSelect } from "./StatusSelect";
import { FilterBar } from "./FilterBar";
import { CompareToggle } from "./CompareKit";
import { PriceMeta } from "./CardBits";
import { readFilters, filterRows, sortRows } from "@/lib/filters";
import { loadProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";
// La veille (action serveur de cette page) contrôle jusqu'à 40 annonces.
export const maxDuration = 30;

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

function Card({
  item,
  financing,
}: {
  item: Listing;
  financing?: ProfileData["financing"];
}) {
  return (
    <div className={`card${item.gone ? " card-gone" : ""}`}>
      <Gallery photos={item.photos ?? []} alt={item.title ?? ""} />
      <div className="body">
        <div className="head-row">
          <span className="badge">{item.source}</span>
          {item.gone && (
            <span
              className="gone-badge"
              title={
                item.lastCheckedAt
                  ? `Constaté le ${new Date(item.lastCheckedAt).toLocaleDateString("fr-FR")}`
                  : undefined
              }
            >
              Annonce disparue
            </span>
          )}
          <span className="spacer" />
          <CompareToggle compareKey={`l:${item.id}`} />
          <KindSwitch item={item} />
        </div>
        <a className="title" href={item.url} target="_blank" rel="noreferrer">
          {item.title ?? item.url}
        </a>
        <PriceMeta
          price={item.price}
          surface={item.surface}
          rooms={item.rooms}
          location={item.location}
          kind={item.kind}
          financing={financing}
          history={item.priceHistory}
        />
        <div className="status-row">
          <StatusSelect id={item.id} status={item.status} action={setListingStatus} />
          {item.lastCheckedAt && !item.gone && (
            <span className="card-date">
              vérifiée le {new Date(item.lastCheckedAt).toLocaleDateString("fr-FR")}
            </span>
          )}
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
            <ConfirmForm
              action={excludeListing}
              askReason
              confirmText="Exclure définitivement cette annonce ? Elle est retirée de tes favoris et ne sera plus jamais proposée."
            >
              <input type="hidden" name="id" value={item.id} />
              <button
                className="danger small"
                type="submit"
                title="Retire l'annonce ET la met en liste noire : elle ne sera plus jamais proposée"
              >
                Exclure
              </button>
            </ConfirmForm>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const kind: Kind | null =
    params.kind === "achat" || params.kind === "location" ? params.kind : null;
  const filters = readFilters(params);

  const [all, achatProfile] = await Promise.all([
    db.select().from(listings).orderBy(desc(listings.createdAt)),
    loadProfile("achat"),
  ]);
  const ofKind = kind ? all.filter((r) => r.kind === kind) : all;
  const countAchat = all.filter((r) => r.kind === "achat").length;
  const countLocation = all.length - countAchat;

  const rows = sortRows(filterRows(ofKind, filters), filters.sort, "date");
  const sources = [...new Set(ofKind.map((r) => r.source))].sort();
  const drops = ofKind.filter((r) => {
    const last = r.priceHistory?.[r.priceHistory.length - 1]?.price;
    return r.price != null && last != null && r.price < last;
  }).length;
  const gone = ofKind.filter((r) => r.gone).length;

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
      {(drops > 0 || gone > 0) && (
        <p className="page-sub watch-summary">
          Veille :{" "}
          {drops > 0 && (
            <span className="price-change down">
              {drops} baisse{drops > 1 ? "s" : ""} de prix
            </span>
          )}
          {drops > 0 && gone > 0 && " · "}
          {gone > 0 && (
            <span className="gone-badge">
              {gone} annonce{gone > 1 ? "s" : ""} disparue{gone > 1 ? "s" : ""}
            </span>
          )}
        </p>
      )}
      <div className="container">
        <div className="toolbar-row">
          <FilterBar sources={sources} showStatus />
          <WatchButton action={runWatchAction} />
        </div>
        {rows.length === 0 ? (
          <div className="empty">
            {ofKind.length > 0 ? (
              <>Aucune annonce ne correspond à ces filtres.</>
            ) : (
              <>
                Aucune annonce {kind ? `« ${kind} » ` : ""}pour l&apos;instant.
                Sauvegarde-en une depuis l&apos;extension Chrome ou avec
                « ♥ J&apos;aime » sur un candidat.
              </>
            )}
          </div>
        ) : (
          <div className="grid">
            {rows.map((item) => (
              <Card key={item.id} item={item} financing={achatProfile?.financing} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
