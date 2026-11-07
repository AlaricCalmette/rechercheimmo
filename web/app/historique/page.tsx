import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidates, runs } from "@/db/schema";
import { Nav } from "../Nav";

export const dynamic = "force-dynamic";

type RunView = {
  id: string;
  date: Date;
  // Statistiques enregistrées à l'insertion (null pour les passages
  // antérieurs à la table runs).
  received: number | null;
  inserted: number | null;
  skipped: number | null;
  blacklisted: number | null;
  // Candidats de ce passage encore présents dans la liste aujourd'hui.
  stillAchat: number;
  stillLocation: number;
  bestScore: number | null;
};

export default async function Historique() {
  const [runRows, cands] = await Promise.all([
    db.select().from(runs).orderBy(desc(runs.createdAt)),
    db
      .select({
        runId: candidates.runId,
        kind: candidates.kind,
        score: candidates.score,
        createdAt: candidates.createdAt,
      })
      .from(candidates),
  ]);

  const map = new Map<string, RunView>();
  for (const r of runRows) {
    map.set(r.id, {
      id: r.id,
      date: r.createdAt,
      received: r.received,
      inserted: r.inserted,
      skipped: r.skipped,
      blacklisted: r.blacklisted,
      stillAchat: 0,
      stillLocation: 0,
      bestScore: null,
    });
  }
  for (const c of cands) {
    let v = map.get(c.runId);
    if (!v) {
      v = {
        id: c.runId,
        date: c.createdAt,
        received: null,
        inserted: null,
        skipped: null,
        blacklisted: null,
        stillAchat: 0,
        stillLocation: 0,
        bestScore: null,
      };
      map.set(c.runId, v);
    }
    if (c.createdAt < v.date && v.received == null) v.date = c.createdAt;
    if (c.kind === "achat") v.stillAchat++;
    else v.stillLocation++;
    if (c.score != null && (v.bestScore == null || c.score > v.bestScore)) {
      v.bestScore = c.score;
    }
  }
  const list = [...map.values()].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <>
      <Nav active="historique" />
      <div className="page-head">
        <h1>
          Historique des passages
          <span className="count">
            {list.length} passage{list.length > 1 ? "s" : ""}
          </span>
        </h1>
      </div>
      <p className="page-sub">
        Chaque exécution de la routine <code>recherche-immo</code>. « Reçus » =
        annonces envoyées par la routine, « ajoutés » = vraiment nouvelles,
        « doublons » = déjà connues (candidat ou favori), « bloqués » = en liste
        noire. « Encore listés » = candidats de ce passage toujours dans ta liste.
      </p>
      <div className="container">
        {list.length === 0 ? (
          <div className="empty">Aucun passage enregistré pour l&apos;instant.</div>
        ) : (
          <div className="table-wrap">
            <table className="runs-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reçus</th>
                  <th>Ajoutés</th>
                  <th>Doublons</th>
                  <th>Bloqués</th>
                  <th>Encore listés</th>
                  <th>Meilleur score</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td>{r.received ?? "—"}</td>
                    <td className="num-strong">{r.inserted ?? "—"}</td>
                    <td>{r.skipped ?? "—"}</td>
                    <td>{r.blacklisted ?? "—"}</td>
                    <td>
                      {r.stillAchat + r.stillLocation === 0 ? (
                        "0"
                      ) : (
                        <>
                          {r.stillAchat > 0 && (
                            <span className="kind-badge kind-achat">{r.stillAchat} achat</span>
                          )}{" "}
                          {r.stillLocation > 0 && (
                            <span className="kind-badge kind-location">
                              {r.stillLocation} location
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td>{r.bestScore != null ? `${r.bestScore}/100` : "—"}</td>
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
