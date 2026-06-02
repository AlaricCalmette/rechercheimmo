const $ = (id) => document.getElementById(id);

async function load() {
  const { apiUrl, secret } = await chrome.storage.sync.get(["apiUrl", "secret"]);
  if (apiUrl) $("apiUrl").value = apiUrl;
  if (secret) $("secret").value = secret;
}

async function save() {
  const apiUrl = $("apiUrl").value.trim();
  const secret = $("secret").value.trim();
  await chrome.storage.sync.set({ apiUrl, secret });
  const status = $("status");
  status.textContent = "Enregistré ✓";
  setTimeout(() => (status.textContent = ""), 2000);
}

$("save").addEventListener("click", save);
load();
