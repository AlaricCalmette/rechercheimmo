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

function renderPreview(data) {
  $("source").textContent = data.source || "generic";
  $("title").textContent = data.title || data.url || "(sans titre)";
  $("price").textContent = formatPrice(data.price);

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
  $("open-options-2").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  try {
    current = await extractFromActiveTab();
    renderPreview(current);
  } catch (e) {
    const status = $("status");
    status.textContent = `Lecture de la page impossible : ${e.message}`;
    status.classList.add("err");
  }
}

init();
