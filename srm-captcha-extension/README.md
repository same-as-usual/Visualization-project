# SRM Portal Captcha Autofill

A Manifest V3 browser extension (built for **Brave**, works in any Chromium browser)
that auto-fills your **NetID**, **password**, and the **captcha** on the
[SRM Student Portal](https://sp.srmist.edu.in/srmiststudentportal/students/loginManager/youLogin.jsp)
login page — and can optionally click **Login** for you.

> Personal-use convenience tool for your own login. Use responsibly.

## How it solves the captcha

The real captcha image on the SRM portal is generated server-side (`SCaptchaServlet`)
and its answer is never exposed to the page — the page's `SECURE_CONFIG.captchaText`
is only a decoy the anti-phishing script uses. So the extension reads the **displayed
image** with vision OCR:

1. Capture the currently displayed captcha pixels via `<canvas>` (without
   re-requesting the server, which would rotate the captcha).
2. Send the image to the **Google Gemini vision API** and read the characters.
3. Fill the `#captcha` field with real input events.

A **free Gemini API key is required** (see below). The service worker auto-selects a
working free Flash model, and the extension re-solves automatically when you click the
captcha refresh icon.

## Install (Brave / Chrome / Edge)

1. Open `brave://extensions` (or `chrome://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `srm-captcha-extension/` folder.
4. Pin the extension and click its icon to open **Settings**.

## Configure

In the popup:

- **NetID** and **Password** — saved locally and auto-filled on the login page.
- **Autofill NetID & password** — toggle credential filling.
- **Auto-solve captcha** — toggle captcha filling.
- **Auto-click Login** — if on, submits automatically (capped at **2 attempts** per
  page session to avoid account lockout on a bad login).
- **Gemini API key** (required) — paste a free key from
  [Google AI Studio](https://aistudio.google.com/apikey). Leave the model blank to
  auto-pick a working free Flash model, or set one under **Advanced**.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 config; scopes scripts to the SRM login URL |
| `content.js` | Autofill + capture image + solve + fill + bounded auto-submit; status pill |
| `background.js` | Service worker; calls the Gemini vision API (with model fallback) |
| `popup.html` / `popup.js` | Settings UI stored in `chrome.storage.local` |

## Privacy & security

- Credentials and the API key are stored in `chrome.storage.local` (this browser
  profile only, not synced, not sent anywhere except: the password goes to the SRM
  login form, and the API key goes to Google only when the Gemini fallback runs).
- The primary solver never contacts any server — everything stays on the page.
- Leave **Auto-click Login** off if you'd rather review before submitting.

## Troubleshooting

- **Nothing fills:** confirm you're on the `.../loginManager/...` URL and that the
  toggles are on in the popup.
- **Captcha wrong after refresh:** the reader re-syncs every 0.5s; just wait a
  moment or click the recycle icon again.
- **Gemini errors:** check the API key and model name in the popup; the free tier
  has daily limits.

## Scope

Currently targets only the SRM Student Portal. The solver is structured to be
extended to other sites/captcha types later.
