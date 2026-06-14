"use client";

import { useState } from "react";

// Galerie d'annonce : parcourt toutes les photos sauvegardées (flèches +
// compteur). Affichée sur les cartes du site. S'il n'y a qu'une photo, se
// comporte comme une simple image ; aucune si la liste est vide.
export function Gallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [i, setI] = useState(0);

  if (!photos || photos.length === 0) {
    return <div className="no-photo">Pas de photo</div>;
  }

  const count = photos.length;
  const go = (delta: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setI((prev) => (prev + delta + count) % count);
  };

  return (
    <div className="gallery">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="photo" src={photos[i]} alt={alt} loading="lazy" />
      {count > 1 && (
        <>
          <button
            type="button"
            className="gallery-nav gallery-prev"
            onClick={go(-1)}
            aria-label="Photo précédente"
          >
            ‹
          </button>
          <button
            type="button"
            className="gallery-nav gallery-next"
            onClick={go(1)}
            aria-label="Photo suivante"
          >
            ›
          </button>
          <span className="gallery-counter">
            {i + 1} / {count}
          </span>
        </>
      )}
    </div>
  );
}
