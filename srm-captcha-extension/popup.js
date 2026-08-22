// Loads and saves extension settings to chrome.storage.local.
const FIELDS = {
  netid: "text",
  password: "text",
  geminiApiKey: "text",
  geminiModel: "text",
  autofillCreds: "check",
  autoSolve: "check",
  autoSubmit: "check"
};

const DEFAULTS = {
  netid: "",
  password: "",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  autofillCreds: true,
  autoSolve: true,
  autoSubmit: false
};

function load() {
  chrome.storage.local.get(DEFAULTS, (items) => {
    for (const [key, kind] of Object.entries(FIELDS)) {
      const el = document.getElementById(key);
      if (!el) continue;
      if (kind === "check") el.checked = !!items[key];
      else el.value = items[key] != null ? items[key] : "";
    }
  });
}

function save() {
  const data = {};
  for (const [key, kind] of Object.entries(FIELDS)) {
    const el = document.getElementById(key);
    if (!el) continue;
    data[key] = kind === "check" ? el.checked : el.value.trim();
  }
  // Blank model = let the background service worker auto-pick a working model.
  chrome.storage.local.set(data, () => {
    const saved = document.getElementById("saved");
    saved.textContent = "Saved ✓";
    setTimeout(() => (saved.textContent = ""), 1500);
  });
}

document.addEventListener("DOMContentLoaded", load);
document.getElementById("save").addEventListener("click", save);
