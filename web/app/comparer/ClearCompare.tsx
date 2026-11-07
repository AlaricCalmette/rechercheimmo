"use client";

import { useCompare } from "../CompareKit";

export function ClearCompare() {
  const { keys, clear } = useCompare();
  if (keys.length === 0) return null;
  return (
    <button
      type="button"
      className="small"
      onClick={() => {
        clear();
        window.location.href = "/comparer";
      }}
    >
      Vider la sélection
    </button>
  );
}
