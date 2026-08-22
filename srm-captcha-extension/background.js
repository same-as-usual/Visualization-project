// Service worker: solves a captcha image via the Google Gemini vision API.
// Runs in the extension context so the fetch is not subject to page CORS
// (host_permissions covers generativelanguage.googleapis.com).

const DEFAULT_MODEL = "gemini-flash-latest";

async function solveWithGemini(dataUrl) {
  const store = await chrome.storage.local.get(["geminiApiKey", "geminiModel"]);
  const apiKey = store.geminiApiKey;
  const model = (store.geminiModel || DEFAULT_MODEL).trim();

  if (!apiKey) {
    throw new Error("No Gemini API key set. Open the extension popup and add one.");
  }
  if (!dataUrl || dataUrl.indexOf(",") === -1) {
    throw new Error("No captcha image available to send to Gemini.");
  }

  const commaIdx = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, commaIdx);
  const b64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = meta.match(/data:(.*?)(;|$)/);
  const mimeType = (mimeMatch && mimeMatch[1]) || "image/png";

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
    generationConfig: { temperature: 0, maxOutputTokens: 20 }
  };

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = (json && json.error && json.error.message) || ("HTTP " + resp.status);
    throw new Error("Gemini error: " + msg);
  }

  let text = "";
  try {
    const parts = json.candidates[0].content.parts;
    text = parts.map((p) => p.text || "").join("");
  } catch (e) {
    text = "";
  }

  text = (text || "").replace(/[^A-Za-z0-9]/g, "");
  if (!text) {
    throw new Error("Gemini returned no readable characters.");
  }
  return text;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "solveGemini") {
    solveWithGemini(msg.dataUrl)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
    return true; // keep the message channel open for the async response
  }
  return false;
});
