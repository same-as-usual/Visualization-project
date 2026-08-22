// Service worker: solves the displayed captcha image via the Google Gemini
// vision API. Runs in the extension context so the fetch is not subject to page
// CORS (host_permissions covers generativelanguage.googleapis.com).

// Tried in order until one works; if the user set a model it is tried first.
const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-1.5-flash"
];

function modelList(userModel) {
  const list = [];
  if (userModel) list.push(userModel);
  for (const m of FALLBACK_MODELS) if (!list.includes(m)) list.push(m);
  return list;
}

function isModelMissing(status, message) {
  const m = (message || "").toLowerCase();
  return (
    status === 404 ||
    m.includes("not found") ||
    m.includes("is not supported") ||
    m.includes("does not exist") ||
    m.includes("unsupported")
  );
}

async function callGemini(model, apiKey, mimeType, b64) {
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  const body = {
    contents: [
      {
        parts: [
          {
            text:
              "This image is a text CAPTCHA. Reply with ONLY the exact characters " +
              "shown in the image, preserving upper/lower case. No spaces, no " +
              "punctuation, no explanation."
          },
          { inline_data: { mime_type: mimeType, data: b64 } }
        ]
      }
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 32 }
  };

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, json };
}

async function solveWithGemini(dataUrl) {
  const store = await chrome.storage.local.get(["geminiApiKey", "geminiModel"]);
  const apiKey = store.geminiApiKey;
  if (!apiKey) {
    throw new Error("No Gemini API key set. Open the extension popup and add a free key.");
  }
  if (!dataUrl || dataUrl.indexOf(",") === -1) {
    throw new Error("No captcha image available to send to Gemini.");
  }

  const commaIdx = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, commaIdx);
  const b64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = meta.match(/data:(.*?)(;|$)/);
  const mimeType = (mimeMatch && mimeMatch[1]) || "image/png";

  const models = modelList((store.geminiModel || "").trim());
  let lastErr = "Gemini request failed.";

  for (const model of models) {
    let res;
    try {
      res = await callGemini(model, apiKey, mimeType, b64);
    } catch (e) {
      lastErr = String((e && e.message) || e);
      continue;
    }
    if (res.ok) {
      let text = "";
      try {
        text = res.json.candidates[0].content.parts.map((p) => p.text || "").join("");
      } catch (e) {
        text = "";
      }
      text = (text || "").replace(/[^A-Za-z0-9]/g, "");
      if (text) return text;
      lastErr = "Gemini returned no readable characters.";
      continue;
    }
    const msg = (res.json && res.json.error && res.json.error.message) || ("HTTP " + res.status);
    lastErr = "Gemini error: " + msg;
    // Only try the next model when this one doesn't exist for the key.
    if (!isModelMissing(res.status, msg)) throw new Error(lastErr);
  }
  throw new Error(lastErr);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "solveGemini") {
    solveWithGemini(msg.dataUrl)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true; // async response
  }
  return false;
});
