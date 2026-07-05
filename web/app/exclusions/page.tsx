import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { blacklist } from "@/db/schema";
import { restoreBlacklisted } from "../actions";
import { Nav } from "../Nav";

export const dynamic = "force-dynamic";

export default async function Exclusions() {
  const rows = await db.select().from(blacklist).orderBy(desc(blacklist.createdAt));

  return (
    <>
      <Nav active="exclusions" />
      <div className="page-head">
        <h1>
          Annonces exclues
          <span className="count">
            {rows.length} URL{rows.length > 1 ? "s" : ""} en liste noire
          </span>
        </h1>
      </div>
      <p className="page-sub">
        Ces annonces ne seront plus jamais proposées par la routine, ni
        réinsérées dans les candidats. « Réintégrer » les retire de la liste
        noire.
      </p>
      <div className="container">
        {rows.length === 0 ? (
          <div className="empty">
            Aucune annonce exclue. Utilise le bouton « Exclure » sur une carte
            pour bannir définitivement une annonce.
          </div>
        ) : (
          <div className="bl-list">
            {rows.map((r) => (
              <div className="bl-row" key={r.id}>
                <div className="bl-main">
                  <span className="bl-title">{r.title ?? r.url}</span>
                  <a
                    className="bl-url"
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.url}
                  </a>
                </div>
                {r.source && <span className="badge">{r.source}</span>}
                <span className="bl-date">
                  {new Date(r.createdAt).toLocaleDateString("fr-FR")}
                </span>
                <form action={restoreBlacklisted}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="small" type="submit">
                    Réintégrer
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
