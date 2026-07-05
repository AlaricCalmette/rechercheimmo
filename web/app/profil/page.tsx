import { db } from "@/lib/db";
import { profile, type ProfileData, type Kind } from "@/db/schema";
import { Nav } from "../Nav";
import { ProfileEditor } from "./ProfileEditor";

export const dynamic = "force-dynamic";

export default async function Profil({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind: kindParam } = await searchParams;
  const kind: Kind = kindParam === "location" ? "location" : "achat";

  const rows = await db.select().from(profile);
  // Le profil achat retombe sur l'ancienne ligne "default" (historique).
  const row =
    rows.find((r) => r.id === kind) ??
    (kind === "achat" ? rows.find((r) => r.id === "default") : undefined);
  const data = (row?.data ?? null) as ProfileData | null;

  const analyzedCount = data?.analyzedListings
    ? Object.keys(data.analyzedListings).length
    : 0;
  const updatedAt = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString("fr-FR")
    : row?.updatedAt
      ? new Date(row.updatedAt).toLocaleString("fr-FR")
      : null;

  return (
    <>
      <Nav active="profil" />
      <div className="page-head">
        <h1>
          Profil {kind}
          {updatedAt && <span className="count">mis à jour le {updatedAt}</span>}
        </h1>
        <div className="tabs">
          <a
            className={`tab tab-achat${kind === "achat" ? " active" : ""}`}
            href="/profil?kind=achat"
          >
            Achat
          </a>
          <a
            className={`tab tab-location${kind === "location" ? " active" : ""}`}
            href="/profil?kind=location"
          >
            Location
          </a>
        </div>
      </div>
      <div className="container">
        <p className="profile-hint">
          Ce profil guide la routine <code>recherche-immo</code> pour la liste{" "}
          <strong>{kind}</strong>. Il est affiné automatiquement à partir de tes
          annonces aimées ({analyzedCount} analysée{analyzedCount > 1 ? "s" : ""}),
          et tout ce que tu modifies ici est pris en compte au prochain passage —
          les traits « fixés » ne seront jamais retouchés par la routine.
        </p>
        <ProfileEditor key={kind} kind={kind} initial={data} />
      </div>
    </>
  );
}
