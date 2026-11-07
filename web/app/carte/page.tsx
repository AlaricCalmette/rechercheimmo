import { db } from "@/lib/db";
import { listings, candidates } from "@/db/schema";
import { cachedCoords } from "@/lib/geocode";
import { formatPrice } from "@/lib/format";
import { geocodeMoreAction } from "../actions";
import { Nav } from "../Nav";
import { MapView, type MapPoint } from "./MapView";
import { GeocodeButton } from "./GeocodeButton";

export const dynamic = "force-dynamic";
// Le géocodage (Nominatim, ~1 requête/s) tourne dans l'action de cette page.
export const maxDuration = 60;

export default async function Carte() {
  const [ls, cs] = await Promise.all([
    db.select().from(listings),
    db.select().from(candidates),
  ]);

  const allLocations = [...ls, ...cs]
    .map((r) => r.location)
    .filter((l): l is string => !!l);
  const coords = await cachedCoords(allLocations);

  const points: MapPoint[] = [];
  let missing = 0;
  const push = (
    type: MapPoint["type"],
    r: (typeof ls)[number] | (typeof cs)[number],
    extra: Partial<MapPoint> = {}
  ) => {
    if (!r.location) return;
    const c = coords.get(r.location);
    if (c === undefined) {
      missing++;
      return;
    }
    if (c === null) return;
    points.push({
      id: r.id,
      type,
      lat: c.lat,
      lng: c.lng,
      title: r.title ?? r.url,
      url: r.url,
      price: formatPrice(r.price, r.kind),
      location: r.location,
      photo: r.photos?.[0] ?? null,
      ...extra,
    });
  };
  for (const l of ls) push("favori", l, { gone: l.gone ?? false });
  for (const c of cs) {
    push(c.kind === "location" ? "location" : "achat", c, { score: c.score });
  }

  const distinctMissing = new Set(
    allLocations.filter((l) => !coords.has(l))
  ).size;
  const noLocation = [...ls, ...cs].filter((r) => !r.location).length;
  const unknown = [...coords.values()].filter((v) => v === null).length;

  return (
    <>
      <Nav active="carte" />
      <div className="page-head">
        <h1>
          Carte
          <span className="count">
            {points.length} annonce{points.length > 1 ? "s" : ""} placée
            {points.length > 1 ? "s" : ""}
          </span>
        </h1>
        {distinctMissing > 0 && (
          <GeocodeButton action={geocodeMoreAction} missing={distinctMissing} />
        )}
      </div>
      <p className="page-sub">
        ♥ favoris · ● candidats achat · ● candidats location. Les positions
        sont approximatives (centre de la commune indiquée sur l&apos;annonce).
        {missing > 0 && ` ${missing} annonce(s) attendent leur géocodage.`}
        {(noLocation > 0 || unknown > 0) &&
          ` ${noLocation + unknown} sans localisation exploitable.`}
      </p>
      <div className="container">
        <MapView points={points} />
      </div>
    </>
  );
}
