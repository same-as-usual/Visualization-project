// Isolated-world content script for the SRM Student Portal login page.
//
// IMPORTANT: The page's guardlogin.js loads the REAL captcha image from the
// server (SCaptchaServlet). Its answer lives only on the server — the
// SECURE_CONFIG.captchaText value is a decoy used only for anti-phishing.
// So we must read the displayed image with OCR/vision (Gemini).
//
// Responsibilities:
//   1. Autofill NetID + password from saved settings.
//   2. Solve the captcha by sending the DISPLAYED image to Gemini vision.
//   3. Fill the captcha field with proper input events.
//   4. Optionally auto-click Login, with a bounded retry to avoid lockout.
(function () {
  "use strict";

  const SEL = {
    form: "#login_form",
    username: "#username",
    password: "#password",
    captcha: "#captcha",
    captchaImg: "#secure_captcha",
    refresh: "#btnRefresh",
    login: "#btnLogin"
  };

  const MAX_AUTOSUBMIT_ATTEMPTS = 2;
  const ATTEMPT_KEY = "srm_autologin_attempts";

  const DEFAULTS = {
    netid: "",
    password: "",
    autofillCreds: true,
    autoSolve: true,
    autoSubmit: false
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (sel) => document.querySelector(sel);

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(DEFAULTS, (items) => resolve(items || DEFAULTS));
    });
  }

  // Set a value the way a real user would, so any listeners fire.
  function setNativeValue(el, value) {
    if (!el) return;
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }

  // ---------- status pill ----------
  let pill;
  function status(text, tone) {
    if (!pill) {
      pill = document.createElement("div");
      pill.id = "srm-captcha-pill";
      Object.assign(pill.style, {
        position: "fixed",
        right: "12px",
        bottom: "12px",
        zIndex: "2147483647",
        padding: "8px 12px",
        borderRadius: "8px",
        font: "13px/1.3 system-ui, sans-serif",
        color: "#fff",
        boxShadow: "0 2px 10px rgba(0,0,0,.25)",
        maxWidth: "300px"
      });
      document.body.appendChild(pill);
    }
    pill.style.background =
      tone === "error" ? "#c0392b" : tone === "ok" ? "#2e7d32" : "#34495e";
    pill.textContent = "SRM: " + text;
  }

  // ---------- captcha image capture ----------
  function waitForImage(img, timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function check() {
        if (img.complete && (img.naturalWidth || 0) > 0) return resolve(true);
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(check, 150);
      })();
    });
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  // Capture the CURRENTLY DISPLAYED captcha pixels. We deliberately do NOT
  // re-request SCaptchaServlet, because that would rotate the server captcha
  // and desync from what's on screen.
  async function getCaptchaImageDataUrl() {
    const img = $(SEL.captchaImg);
    if (!img) return null;
    await waitForImage(img, 8000);

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    // Preferred: draw the loaded element to a canvas.
    try {
      if (w && h) {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        return canvas.toDataURL("image/png");
      }
    } catch (e) {
      /* canvas tainted or failed — fall through */
    }

    // Fallback: fetch the element's current src (a blob: URL set by the page,
    // or a same-origin URL). This does not rotate the server captcha.
    try {
      const src = img.currentSrc || img.src;
      if (src) {
        const resp = await fetch(src, { credentials: "include", cache: "no-store" });
        const blob = await resp.blob();
        return await blobToDataURL(blob);
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  async function solveViaGemini() {
    const dataUrl = await getCaptchaImageDataUrl();
    if (!dataUrl) {
      status("Captcha image not ready — try the refresh icon.", "error");
      return null;
    }
    try {
      const res = await chrome.runtime.sendMessage({ type: "solveGemini", dataUrl });
      if (res && res.ok) return res.text;
      status(res && res.error ? res.error : "Gemini failed.", "error");
    } catch (e) {
      status("Gemini call failed: " + e.message, "error");
    }
    return null;
  }

  // ---------- fill flow ----------
  async function solveAndFill(reason) {
    status(reason || "Solving captcha with Gemini…");
    const text = await solveViaGemini();
    const field = $(SEL.captcha);
    if (text && field) {
      setNativeValue(field, text);
      status("Captcha filled: " + text, "ok");
      return text;
    }
    if (!text) status("Could not solve captcha — fill it manually.", "error");
    return null;
  }

  // Re-solve automatically whenever a new captcha image loads (e.g. the user
  // clicks the recycle icon).
  let lastSolvedSrc = null;
  function watchForRefresh() {
    const img = $(SEL.captchaImg);
    if (!img) return;
    img.addEventListener("load", () => {
      const src = img.currentSrc || img.src;
      if (src && src !== lastSolvedSrc) {
        lastSolvedSrc = src;
        solveAndFill("Captcha refreshed — re-solving…");
      }
    });
  }

  // ---------- main ----------
  async function run() {
    if (window.__srmCaptchaRan) return;
    window.__srmCaptchaRan = true;

    const settings = await getSettings();

    if (settings.autofillCreds) {
      const u = $(SEL.username);
      const p = $(SEL.password);
      if (u && settings.netid) setNativeValue(u, settings.netid);
      if (p && settings.password) setNativeValue(p, settings.password);
    }

    let solvedText = null;
    if (settings.autoSolve) {
      const img = $(SEL.captchaImg);
      if (img) lastSolvedSrc = img.currentSrc || img.src || null;
      solvedText = await solveAndFill();
      watchForRefresh();
    }

    if (settings.autoSubmit) {
      await maybeAutoSubmit(settings, solvedText);
    }
  }

  async function maybeAutoSubmit(settings, solvedText) {
    if (!(settings.autofillCreds && settings.netid && settings.password)) {
      status("Auto-submit skipped: set NetID + password in the popup.", "error");
      return;
    }
    if (!solvedText) {
      status("Auto-submit skipped: captcha unsolved.", "error");
      return;
    }

    let attempts = 0;
    try {
      attempts = parseInt(sessionStorage.getItem(ATTEMPT_KEY) || "0", 10) || 0;
    } catch (e) {
      attempts = 0;
    }
    if (attempts >= MAX_AUTOSUBMIT_ATTEMPTS) {
      status("Auto-submit stopped after " + attempts + " tries (avoiding lockout).", "error");
      return;
    }
    try {
      sessionStorage.setItem(ATTEMPT_KEY, String(attempts + 1));
    } catch (e) {
      /* ignore */
    }

    status("Logging in… (attempt " + (attempts + 1) + ")");
    await sleep(400);
    const btn = $(SEL.login);
    if (btn) {
      btn.click();
    } else {
      const form = $(SEL.form);
      if (form) (form.requestSubmit ? form.requestSubmit() : form.submit());
    }
  }

  run();
})();
