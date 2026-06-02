// État courant : données extraites de la page active.
let current = null;

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

  const photo = data.photos && data.photos[0];
  if (photo) {
    $("photo").src = photo;
    show($("photo"));
    hide($("no-photo"));
  } else {
    hide($("photo"));
    show($("no-photo"));
  }
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

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/listings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ ...current, notes: $("notes").value.trim() }),
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
