import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidates, runs, type Candidate, type Kind, type ProfileData } from "@/db/schema";
import { deleteCandidate, excludeCandidate, likeCandidate } from "../actions";
import { Nav } from "../Nav";
import { Gallery } from "../Gallery";
import { ConfirmForm } from "../ConfirmForm";
import { FilterBar } from "../FilterBar";
import { CompareToggle } from "../CompareKit";
import { PriceMeta, ScoreDetails } from "../CardBits";
import { readFilters, filterRows, sortRows } from "@/lib/filters";
import { loadProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

function Card({
  item,
  isNew,
  financing,
}: {
  item: Candidate;
  isNew: boolean;
  financing?: ProfileData["financing"];
}) {
  return (
    <div className={`card${isNew ? " card-new" : ""}`}>
      <Gallery photos={item.photos ?? []} alt={item.title ?? ""} />
      <div className="body">
        <div className="head-row">
          <span className="badge">{item.source}</span>
          {isNew && <span className="new-badge">Nouveau</span>}
          <span className="spacer" />
          {item.score != null && <span className="score">{item.score}/100</span>}
          <CompareToggle compareKey={`c:${item.id}`} />
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
        />
        {item.reasons && <div className="note">{item.reasons}</div>}
        <ScoreDetails details={item.scoreDetails} />
        <div className="card-date">
          Trouvé le {new Date(item.createdAt).toLocaleDateString("fr-FR")}
        </div>
        <div className="actions">
          <form action={likeCandidate}>
            <input type="hidden" name="id" value={item.id} />
            <button
              className="like small"
              type="submit"
              title="Ajoute l'annonce à Mes annonces : la routine l'analysera pour affiner ton profil"
            >
              ♥ J&apos;aime
            </button>
          </form>
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
            <ConfirmForm
              action={excludeCandidate}
              confirmText="Exclure définitivement cette annonce ? Elle ne sera plus jamais proposée (réintégrable depuis la page Exclusions)."
            >
              <input type="hidden" name="id" value={item.id} />
              <button
                className="danger small"
                type="submit"
                title="Liste noire : cette annonce ne sera plus jamais proposée"
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

export default async function Candidats({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const kind: Kind = params.kind === "location" ? "location" : "achat";
  const filters = readFilters(params);

  const [all, lastRuns, achatProfile] = await Promise.all([
    db
      .select()
      .from(candidates)
      .orderBy(desc(candidates.score), desc(candidates.createdAt)),
    db.select().from(runs).orderBy(desc(runs.createdAt)).limit(1),
    loadProfile("achat"),
  ]);
  const ofKind = all.filter((r) => r.kind === kind);
  const countAchat = all.filter((r) => r.kind === "achat").length;
  const countLocation = all.length - countAchat;

  // Dernier passage : le runId du candidat le plus récent (tous types
  // confondus — la routine envoie achat et location dans le même passage).
  const newest = all.reduce<Candidate | null>(
    (acc, r) => (!acc || r.createdAt > acc.createdAt ? r : acc),
    null
  );
  const latestRunId = newest?.runId ?? null;
  const lastRunDate = lastRuns[0]?.createdAt ?? newest?.createdAt ?? null;
  const newCount = ofKind.filter((r) => r.runId === latestRunId).length;

  const rows = sortRows(filterRows(ofKind, filters), filters.sort, "score");
  const sources = [...new Set(ofKind.map((r) => r.source))].sort();

  return (
    <>
      <Nav active="candidats" />
      <div className="page-head">
        <h1>
          Candidats trouvés
          <span className="count">
            {rows.length} annonce{rows.length > 1 ? "s" : ""} en {kind}
            {newCount > 0 && ` · ${newCount} nouvelle${newCount > 1 ? "s" : ""}`}
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
        {lastRunDate && (
          <>
            Dernier passage de la routine le{" "}
            <strong>{new Date(lastRunDate).toLocaleString("fr-FR")}</strong> ·{" "}
            <a href="/historique">historique des passages</a>
            <br />
          </>
        )}
        « ♥ J&apos;aime » ajoute le candidat à tes annonces (il nourrit le
        profil) ; « Retirer » l&apos;enlève simplement ; « Exclure » le met en
        liste noire pour qu&apos;il ne soit plus jamais reproposé.
      </p>
      <div className="container">
        <FilterBar sources={sources} showScoreSort />
        {rows.length === 0 ? (
          <div className="empty">
            {ofKind.length > 0 ? (
              <>Aucun candidat ne correspond à ces filtres.</>
            ) : (
              <>
                Aucun candidat {kind} pour l&apos;instant. La routine{" "}
                <code>recherche-immo</code> produit une liste achat et une liste
                location à chaque passage.
              </>
            )}
          </div>
        ) : (
          <div className="grid">
            {rows.map((item) => (
              <Card
                key={item.id}
                item={item}
                isNew={item.runId === latestRunId}
                financing={achatProfile?.financing}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
