// État courant : données extraites de la page active.
let current = null;
// Index de la photo choisie comme couverture (la 1re envoyée à l'API).
let selectedIndex = 0;

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

  const photos = data.photos || [];
  selectedIndex = 0;
  renderPhoto();
  renderThumbs(photos);
}

// Affiche la photo de couverture courante (celle d'index selectedIndex).
function renderPhoto() {
  const photo = current?.photos?.[selectedIndex];
  if (photo) {
    $("photo").src = photo;
    show($("photo"));
    hide($("no-photo"));
  } else {
    hide($("photo"));
    show($("no-photo"));
  }
}

// Bande de vignettes : un clic choisit la photo de couverture. Masquée s'il
// n'y a pas plus d'une photo (rien à choisir).
function renderThumbs(photos) {
  const container = $("thumbs");
  container.innerHTML = "";
  if (!photos || photos.length < 2) {
    hide(container);
    return;
  }
  photos.forEach((src, i) => {
    const img = document.createElement("img");
    img.src = src;
    img.className = i === selectedIndex ? "thumb selected" : "thumb";
    img.alt = `Photo ${i + 1}`;
    img.addEventListener("click", () => {
      selectedIndex = i;
      renderPhoto();
      container.querySelectorAll(".thumb").forEach((t, j) =>
        t.classList.toggle("selected", j === selectedIndex)
      );
    });
    container.appendChild(img);
  });
  show(container);
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

  // On place la photo choisie en tête : le site utilise photos[0] comme couverture.
  const photos = current.photos || [];
  const ordered =
    selectedIndex > 0
      ? [photos[selectedIndex], ...photos.filter((_, i) => i !== selectedIndex)]
      : photos;

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
