"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup } from "leaflet";

// Carte interactive Leaflet (fond OpenStreetMap assombri).
// Pas de cadrage fixe : la vue s'ajuste à l'ensemble des annonces placées,
// où qu'elles soient. Plusieurs annonces d'une même commune sont légèrement
// écartées pour rester cliquables.

export type MapPoint = {
  id: string;
  type: "favori" | "achat" | "location";
  lat: number;
  lng: number;
  title: string;
  url: string;
  price: string | null;
  location: string;
  photo: string | null;
  score?: number | null;
  gone?: boolean;
};

const LABELS: Record<MapPoint["type"], string> = {
  favori: "♥ Favoris",
  achat: "Candidats achat",
  location: "Candidats location",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

export function MapView({ points }: { points: MapPoint[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const [visible, setVisible] = useState<Record<MapPoint["type"], boolean>>({
    favori: true,
    achat: true,
    location: true,
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      map.current = L.map(el.current, { zoomControl: true }).setView([46.6, 2.4], 6);
      // Tuiles OpenStreetMap standard, assombries en CSS (.leaflet-tile-pane)
      // pour s'accorder au thème du site.
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current || !layer.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !map.current || !layer.current) return;
      layer.current.clearLayers();

      const shown = points.filter((p) => visible[p.type]);
      // Décale les points superposés (même commune) en petite spirale.
      const seen = new Map<string, number>();
      const placed = shown.map((p) => {
        const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
        const n = seen.get(key) ?? 0;
        seen.set(key, n + 1);
        if (n === 0) return { p, lat: p.lat, lng: p.lng };
        const angle = n * 2.4;
        const r = 0.004 * Math.sqrt(n);
        return { p, lat: p.lat + r * Math.sin(angle), lng: p.lng + r * Math.cos(angle) };
      });

      for (const { p, lat, lng } of placed) {
        const icon = L.divIcon({
          className: "",
          html: `<span class="map-pin map-pin-${p.type}${p.gone ? " map-pin-gone" : ""}">${
            p.type === "favori" ? "♥" : p.score != null ? p.score : ""
          }</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        const popup = `
          <div class="map-popup">
            ${p.photo ? `<img src="${escapeHtml(p.photo)}" alt="" />` : ""}
            <div class="map-popup-kind">${LABELS[p.type]}${p.gone ? " · disparue" : ""}</div>
            <a href="${escapeHtml(p.url)}" target="_blank" rel="noreferrer">${escapeHtml(p.title)}</a>
            <div class="map-popup-meta">${p.price ? `<strong>${escapeHtml(p.price)}</strong> · ` : ""}${escapeHtml(p.location)}${
              p.score != null ? ` · ${p.score}/100` : ""
            }</div>
          </div>`;
        L.marker([lat, lng], { icon }).bindPopup(popup, { maxWidth: 260 }).addTo(layer.current);
      }

      if (placed.length > 0) {
        const bounds = L.latLngBounds(placed.map((x) => [x.lat, x.lng] as [number, number]));
        map.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [points, visible, ready]);

  const counts = {
    favori: points.filter((p) => p.type === "favori").length,
    achat: points.filter((p) => p.type === "achat").length,
    location: points.filter((p) => p.type === "location").length,
  };

  return (
    <div className="map-wrap">
      <div className="map-legend">
        {(Object.keys(LABELS) as MapPoint["type"][]).map((t) => (
          <label key={t} className={`map-legend-item map-legend-${t}`}>
            <input
              type="checkbox"
              checked={visible[t]}
              onChange={(e) => setVisible((v) => ({ ...v, [t]: e.target.checked }))}
            />
            <span className={`map-dot map-pin-${t}`} />
            {LABELS[t]} <span className="tab-count">{counts[t]}</span>
          </label>
        ))}
      </div>
      <div ref={el} className="map" />
    </div>
  );
}
