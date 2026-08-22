# SRM Portal Captcha Autofill

A Manifest V3 browser extension (built for **Brave**, works in any Chromium browser)
that auto-fills your **NetID**, **password**, and the **captcha** on the
[SRM Student Portal](https://sp.srmist.edu.in/srmiststudentportal/students/loginManager/youLogin.jsp)
login page — and can optionally click **Login** for you.

> Personal-use convenience tool for your own login. Use responsibly.

## How it solves the captcha

The SRM login page renders the captcha from a value it embeds in the page itself
(`window.SECURE_CONFIG.captchaText`). The extension reads that value directly, so
solving is **instant, 100% accurate, and fully offline** in the normal case.

Solver precedence:

1. **Page value** — read `captchaText` from the page (via a MAIN-world reader script).
2. **Inline-script regex** — recover it from the page's `<script>` text if needed.
3. **Gemini vision (fallback)** — if the value is ever missing, the captcha image is
   sent to the Google Gemini API and read with OCR. Requires a free API key (below).

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
- **Gemini fallback** (optional) — paste a free API key from
  [Google AI Studio](https://aistudio.google.com/apikey). Default model is
  `gemini-flash-latest`; change it if you prefer another Flash model.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 config; scopes scripts to the SRM login URL |
| `reader.js` | MAIN-world script; mirrors `captchaText` to a DOM attribute |
| `content.js` | Autofill + solve + fill + bounded auto-submit; status pill |
| `background.js` | Service worker; calls the Gemini vision API (fallback) |
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
