// Script de contenu, injecté sur les portails immobiliers : surligne les
// annonces déjà connues de RechercheImmo (♥ favori, ★ candidat, ⛔ exclue)
// dans les listes de résultats, et affiche un bandeau sur une page d'annonce
// connue (avec « Exclure » pour une annonce pas encore en liste noire).
(() => {
  const CACHE_KEY = "rechercheimmo-known";
  const CACHE_TTL = 10 * 60 * 1000;

  // Clé de comparaison d'URL : hôte sans www + chemin sans slash final.
  // On ignore la query et le fragment (paramètres de tracking, de tri…).
  const norm = (href) => {
    try {
      const u = new URL(href, location.href);
      return (
        u.hostname.replace(/^www\./, "").toLowerCase() +
        u.pathname.replace(/\/+$/, "").toLowerCase()
      );
    } catch {
      return null;
    }
  };

  async function loadKnown(apiUrl, secret, force = false) {
    const cached = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY];
    if (!force && cached && Date.now() - cached.at < CACHE_TTL) return cached.data;
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/known`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await chrome.storage.local.set({ [CACHE_KEY]: { at: Date.now(), data } });
    return data;
  }

  function buildIndex(data) {
    const index = new Map();
    for (const u of data.candidats || []) {
      const k = norm(u.url);
      if (k) index.set(k, { type: "candidat", score: u.score });
    }
    for (const u of data.favoris || []) {
      const k = norm(u);
      if (k) index.set(k, { type: "favori" });
    }
    // L'exclusion l'emporte sur tout le reste.
    for (const u of data.exclus || []) {
      const k = norm(u);
      if (k) index.set(k, { type: "exclu" });
    }
    return index;
  }

  const LABEL = {
    favori: "♥ Dans tes favoris",
    candidat: "★ Déjà proposée",
    exclu: "⛔ Exclue",
  };

  // Remonte depuis le lien jusqu'au conteneur « carte d'annonce » le plus
  // proche (article, li…) pour le surligner en entier.
  function cardOf(a) {
    return (
      a.closest("article, li, [data-testid*='card' i], [class*='card' i], [class*='Card']") || a
    );
  }

  function decorate(index) {
    document.querySelectorAll("a[href]").forEach((a) => {
      if (a.dataset.riDone) return;
      a.dataset.riDone = "1";
      const k = norm(a.getAttribute("href"));
      const hit = k && index.get(k);
      if (!hit) return;
      const card = cardOf(a);
      if (card.dataset.riMarked) return;
      card.dataset.riMarked = hit.type;
      card.classList.add("ri-mark", `ri-${hit.type}`);
      const tag = document.createElement("span");
      tag.className = `ri-tag ri-tag-${hit.type}`;
      tag.textContent =
        LABEL[hit.type] + (hit.type === "candidat" && hit.score != null ? ` (${hit.score}/100)` : "");
      if (getComputedStyle(card).position === "static") card.style.position = "relative";
      card.appendChild(tag);
    });
  }

  function banner(hit, onExclude) {
    if (document.getElementById("ri-banner")) return;
    const el = document.createElement("div");
    el.id = "ri-banner";
    el.className = `ri-banner ri-banner-${hit.type}`;
    const text = document.createElement("span");
    text.textContent = `RechercheImmo · ${LABEL[hit.type]}`;
    el.appendChild(text);
    if (hit.type !== "exclu") {
      const btn = document.createElement("button");
      btn.textContent = "Exclure";
      btn.title = "Met cette annonce en liste noire : elle ne sera plus jamais proposée";
      btn.addEventListener("click", async () => {
        if (!confirm("Exclure définitivement cette annonce ?")) return;
        btn.disabled = true;
        try {
          await onExclude();
          text.textContent = `RechercheImmo · ${LABEL.exclu}`;
          el.className = "ri-banner ri-banner-exclu";
          btn.remove();
        } catch (e) {
          btn.disabled = false;
          btn.textContent = "Échec, réessayer";
        }
      });
      el.appendChild(btn);
    }
    const close = document.createElement("button");
    close.className = "ri-close";
    close.textContent = "✕";
    close.addEventListener("click", () => el.remove());
    el.appendChild(close);
    document.body.appendChild(el);
  }

  async function main() {
    const { apiUrl, secret } = await chrome.storage.sync.get(["apiUrl", "secret"]);
    if (!apiUrl || !secret) return;
    let index;
    try {
      index = buildIndex(await loadKnown(apiUrl, secret));
    } catch {
      return; // site injoignable : on ne gêne pas la navigation
    }

    const ogUrl = document.querySelector('meta[property="og:url"]')?.content;
    const here = index.get(norm(location.href)) || (ogUrl && index.get(norm(ogUrl)));
    if (here) {
      banner(here, async () => {
        const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/blacklist`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
          body: JSON.stringify({
            url: ogUrl || location.href,
            title: document.title,
            reason: "exclue depuis l'extension",
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await chrome.storage.local.remove(CACHE_KEY);
      });
    }

    decorate(index);
    // Les portails chargent les résultats au fil du défilement.
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        decorate(index);
      }, 400);
    }).observe(document.body, { childList: true, subtree: true });
  }

  main();
})();
