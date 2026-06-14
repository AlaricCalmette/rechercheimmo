import { db } from "@/lib/db";
import { profile, type ProfileData } from "@/db/schema";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

function formatPrice(price: number | null | undefined): string | null {
  if (price == null) return null;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

function range(r: { min: number | null; max: number | null } | undefined, suffix = ""): string | null {
  if (!r) return null;
  const min = r.min != null ? `${r.min}${suffix}` : null;
  const max = r.max != null ? `${r.max}${suffix}` : null;
  if (min && max) return `${min} – ${max}`;
  return min ?? max ?? null;
}

export default async function Profil() {
  const [row] = await db.select().from(profile).limit(1);
  const data = (row?.data ?? null) as ProfileData | null;

  const budget =
    data?.budget && (data.budget.min != null || data.budget.max != null)
      ? `${formatPrice(data.budget.min) ?? "?"} – ${formatPrice(data.budget.max) ?? "?"}`
      : null;
  const surface = range(data?.surface, " m²");
  const rooms = range(data?.rooms, " p.");
  const preferences = [...(data?.preferences ?? [])].sort((a, b) => b.weight - a.weight);
  const repulsions = [...(data?.repulsions ?? [])].sort((a, b) => b.weight - a.weight);
  const analyzedCount = data?.analyzedListings ? Object.keys(data.analyzedListings).length : 0;
  const updatedAt = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString("fr-FR")
    : row?.updatedAt
      ? new Date(row.updatedAt).toLocaleString("fr-FR")
      : null;

  return (
    <>
      <header className="header">
        <h1>
          Profil de goût
          {updatedAt && <span className="count">mis à jour le {updatedAt}</span>}
        </h1>
        <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <a href="/">← Mes annonces</a>
          <a href="/candidats">Candidats →</a>
          <form action={logout}>
            <button type="submit">Se déconnecter</button>
          </form>
        </nav>
      </header>
      <div className="container">
        {!data ? (
          <div className="empty">
            Aucun profil pour l&apos;instant. La routine <code>recherche-immo</code> le
            construit et l&apos;affine à chaque passage, à partir de tes annonces aimées.
          </div>
        ) : (
          <>
            <p className="readonly-hint">
              Profil déduit automatiquement par le skill — consultable ici, modifiable
              seulement en aimant / annotant des annonces depuis l&apos;extension.
            </p>

            <div className="profile-grid">
              {budget && (
                <div className="profile-field">
                  <span className="profile-label">Budget</span>
                  <span className="profile-value">{budget}</span>
                </div>
              )}
              {data.locations && data.locations.length > 0 && (
                <div className="profile-field">
                  <span className="profile-label">Localisations</span>
                  <span className="profile-value">{data.locations.join(" · ")}</span>
                </div>
              )}
              {data.propertyTypes && data.propertyTypes.length > 0 && (
                <div className="profile-field">
                  <span className="profile-label">Type de bien</span>
                  <span className="profile-value">{data.propertyTypes.join(" · ")}</span>
                </div>
              )}
              {surface && (
                <div className="profile-field">
                  <span className="profile-label">Surface</span>
                  <span className="profile-value">{surface}</span>
                </div>
              )}
              {rooms && (
                <div className="profile-field">
                  <span className="profile-label">Pièces</span>
                  <span className="profile-value">{rooms}</span>
                </div>
              )}
              <div className="profile-field">
                <span className="profile-label">Annonces analysées</span>
                <span className="profile-value">{analyzedCount}</span>
              </div>
            </div>

            {preferences.length > 0 && (
              <section className="profile-section">
                <h2>Ce qui te plaît</h2>
                <div className="chips">
                  {preferences.map((p) => (
                    <span className="chip chip-pos" key={p.theme}>
                      {p.theme}
                      <span className="chip-weight">{p.weight}</span>
                    </span>
                  ))}
                </div>
              </section>
            )}

            {repulsions.length > 0 && (
              <section className="profile-section">
                <h2>Ce que tu veux éviter</h2>
                <div className="chips">
                  {repulsions.map((r) => (
                    <span className={`chip chip-neg${r.redhibitory ? " chip-redhibitory" : ""}`} key={r.theme}>
                      {r.redhibitory && "⛔ "}
                      {r.theme}
                      <span className="chip-weight">{r.weight}</span>
                    </span>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
