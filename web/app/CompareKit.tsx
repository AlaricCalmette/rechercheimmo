"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname } from "next/navigation";

// Comparateur : on coche jusqu'à 4 annonces (favoris ou candidats) puis une
// barre flottante ouvre /comparer. La sélection survit à la navigation via
// sessionStorage ; les clés sont "l:<id>" (favori) ou "c:<id>" (candidat).

const STORAGE_KEY = "rechercheimmo-compare";
export const COMPARE_MAX = 4;

type CompareCtx = {
  keys: string[];
  toggle: (key: string) => void;
  clear: () => void;
};

const Ctx = createContext<CompareCtx>({
  keys: [],
  toggle: () => {},
  clear: () => {},
});

function readStored(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    setKeys(readStored());
  }, []);

  const persist = (next: string[]) => {
    setKeys(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* stockage indisponible : la sélection reste en mémoire */
    }
  };

  const toggle = (key: string) =>
    persist(
      keys.includes(key)
        ? keys.filter((k) => k !== key)
        : [...keys, key].slice(-COMPARE_MAX)
    );

  return (
    <Ctx.Provider value={{ keys, toggle, clear: () => persist([]) }}>
      {children}
      <CompareBar />
    </Ctx.Provider>
  );
}

export function useCompare() {
  return useContext(Ctx);
}

export function CompareToggle({ compareKey }: { compareKey: string }) {
  const { keys, toggle } = useContext(Ctx);
  const on = keys.includes(compareKey);
  return (
    <label
      className={`compare-toggle${on ? " on" : ""}`}
      title="Ajouter au comparateur"
    >
      <input
        type="checkbox"
        checked={on}
        onChange={() => toggle(compareKey)}
      />
      ⚖
    </label>
  );
}

function CompareBar() {
  const { keys, clear } = useContext(Ctx);
  const pathname = usePathname();
  if (keys.length === 0 || pathname === "/comparer" || pathname === "/login") {
    return null;
  }
  return (
    <div className="compare-bar">
      <span>
        {keys.length} annonce{keys.length > 1 ? "s" : ""} à comparer
      </span>
      {keys.length >= 2 ? (
        <a className="btn small primary-link" href={`/comparer?ids=${keys.join(",")}`}>
          Comparer →
        </a>
      ) : (
        <span className="compare-hint">coche-en une 2ᵉ</span>
      )}
      <button type="button" className="ghost small" onClick={clear}>
        Vider
      </button>
    </div>
  );
}
