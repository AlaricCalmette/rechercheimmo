// État courant : données extraites de la page active.
let current = null;
// Indices des photos choisies, dans l'ordre de sélection. La première est la
// couverture (photos[0] côté site). Par défaut, toutes les photos sont cochées.
let selected = [];

const $ = (id) => document.getElementById(id);

function show(el) {
  el.classList.remove("hidden");
}
function hide(el) {
  el.classList.add("hidden");
}

function formatPrice(price) {
  if (price == null) return "";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

async function getConfig() {
  const { apiUrl, secret } = await chrome.storage.sync.get(["apiUrl", "secret"]);
  return { apiUrl, secret };
}

// Devine le type de projet : URL/titre parlant de location, ou prix au niveau
// d'un loyer mensuel. L'utilisateur peut corriger via le sélecteur.
function guessKind(data) {
  const text = `${data.url || ""} ${data.title || ""}`.toLowerCase();
  if (/louer|location|\bloyer\b|\/locations?\//.test(text)) return "location";
  if (data.price != null && data.price > 0 && data.price <= 10000) return "location";
  return "achat";
}

function renderPreview(data) {
  $("source").textContent = data.source || "generic";
  $("title").textContent = data.title || data.url || "(sans titre)";
  $("price").textContent = formatPrice(data.price);
  $("kind").value = guessKind(data);

  // Par défaut aucune photo cochée : l'utilisateur choisit explicitement.
  selected = [];
  renderPhoto();
  renderThumbs(data.photos || []);
}

// Affiche la photo de couverture = la 1re photo cochée. Tant que rien n'est
// coché, on montre quand même la 1re photo disponible (aperçu neutre).
function renderPhoto() {
  const photos = current?.photos || [];
  const photo = selected.length > 0 ? photos[selected[0]] : photos[0];
  if (photo) {
    $("photo").src = photo;
    show($("photo"));
    hide($("no-photo"));
  } else {
    hide($("photo"));
    show($("no-photo"));
  }
}

// Ajoute / retire une photo de la sélection (en préservant l'ordre des clics).
function toggle(i) {
  const pos = selected.indexOf(i);
  if (pos === -1) selected.push(i);
  else selected.splice(pos, 1);
}

// Bande de vignettes : clic = cocher/décocher. Un badge numéroté rappelle
// l'ordre (1 = couverture). Masquée s'il n'y a pas plus d'une photo.
function renderThumbs(photos) {
  const container = $("thumbs");
  const hint = $("thumbs-hint");
  container.innerHTML = "";
  if (!photos || photos.length < 2) {
    hide(container);
    hide(hint);
    return;
  }
  photos.forEach((src, i) => {
    const wrap = document.createElement("div");
    wrap.className = "thumb-wrap";

    const img = document.createElement("img");
    img.src = src;
    img.className = "thumb";
    img.alt = `Photo ${i + 1}`;

    const badge = document.createElement("span");
    badge.className = "thumb-num";

    wrap.appendChild(img);
    wrap.appendChild(badge);
    wrap.addEventListener("click", () => {
      toggle(i);
      refreshThumbs(container);
      renderPhoto();
    });
    container.appendChild(wrap);
  });
  refreshThumbs(container);
  show(container);
  show(hint);
}

// Met à jour l'état visuel des vignettes selon `selected` (surbrillance + n°).
function refreshThumbs(container) {
  container.querySelectorAll(".thumb-wrap").forEach((wrap, i) => {
    const pos = selected.indexOf(i);
    wrap.classList.toggle("selected", pos !== -1);
    wrap.querySelector(".thumb-num").textContent = pos === -1 ? "" : pos + 1;
  });
}

async function extractFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Onglet introuvable");
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractListing, // fournie par extract.js
  });
  return result;
}

async function save() {
  const { apiUrl, secret } = await getConfig();
  const status = $("status");
  status.className = "status";
  status.textContent = "";

  if (!current) {
    status.textContent = "Aucune donnée à sauvegarder.";
    status.classList.add("err");
    return;
  }

  const btn = $("save");
  btn.disabled = true;
  btn.textContent = "Sauvegarde…";

  // On n'envoie que les photos cochées, dans l'ordre de sélection : la 1re sert
  // de couverture (le site utilise photos[0]). Si rien n'est coché, on envoie
  // seulement la première photo (celle affichée en aperçu).
  const photos = current.photos || [];
  const ordered =
    selected.length > 0
      ? selected.map((i) => photos[i])
      : photos.slice(0, 1);

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/listings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        ...current,
        photos: ordered,
        notes: $("notes").value.trim(),
        dislikes: $("dislikes").value.trim(),
        kind: $("kind").value,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} — ${text.slice(0, 120)}`);
    }
    status.textContent = "Annonce sauvegardée ✓";
    status.classList.add("ok");
    btn.textContent = "Sauvegardé ✓";
  } catch (e) {
    status.textContent = `Échec : ${e.message}`;
    status.classList.add("err");
    btn.disabled = false;
    btn.textContent = "Réessayer";
  }
}

// Même normalisation que content.js : hôte sans www + chemin sans slash final.
function normUrl(href) {
  try {
    const u = new URL(href);
    return (
      u.hostname.replace(/^www\./, "").toLowerCase() +
      u.pathname.replace(/\/+$/, "").toLowerCase()
    );
  } catch {
    return null;
  }
}

// Indique si l'annonce courante est déjà connue (favori, candidat, exclue).
async function showKnownState() {
  const { apiUrl, secret } = await getConfig();
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/known`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const k = normUrl(current.url);
    const box = $("known");
    if ((data.exclus || []).some((u) => normUrl(u) === k)) {
      box.textContent = "⛔ Cette annonce est déjà exclue.";
      box.className = "known exclu";
      $("exclude").classList.add("hidden");
    } else if ((data.favoris || []).some((u) => normUrl(u) === k)) {
      box.textContent = "♥ Déjà dans tes favoris.";
      box.className = "known favori";
    } else {
      const c = (data.candidats || []).find((x) => normUrl(x.url) === k);
      if (!c) return;
      box.textContent = `★ Déjà proposée par la routine${c.score != null ? ` (${c.score}/100)` : ""}.`;
      box.className = "known candidat";
    }
  } catch {
    /* site injoignable : pas d'indication */
  }
}

async function exclude() {
  const { apiUrl, secret } = await getConfig();
  const status = $("status");
  status.className = "status";
  if (!current) return;
  const btn = $("exclude");
  btn.disabled = true;
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/blacklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        url: current.url,
        title: current.title,
        source: current.source,
        reason: "exclue depuis l'extension",
      }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    await chrome.storage.local.remove("rechercheimmo-known");
    status.textContent = "Annonce exclue ✓ — elle ne sera plus proposée.";
    status.classList.add("ok");
    btn.textContent = "Exclue ✓";
  } catch (e) {
    status.textContent = `Échec : ${e.message}`;
    status.classList.add("err");
    btn.disabled = false;
  }
}

async function init() {
  const { apiUrl, secret } = await getConfig();
  if (!apiUrl || !secret) {
    show($("needs-config"));
    $("open-options").addEventListener("click", () =>
      chrome.runtime.openOptionsPage()
    );
    return;
  }

  show($("main"));
  $("save").addEventListener("click", save);
  $("exclude").addEventListener("click", exclude);
  $("open-options-2").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  try {
    current = await extractFromActiveTab();
    renderPreview(current);
    showKnownState();
  } catch (e) {
    const status = $("status");
    status.textContent = `Lecture de la page impossible : ${e.message}`;
    status.classList.add("err");
  }
}

init();
