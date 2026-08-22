// Isolated-world content script for the SRM Student Portal login page.
// Responsibilities:
//   1. Autofill NetID + password from saved settings.
//   2. Solve the captcha (page value -> inline-script regex -> Gemini fallback).
//   3. Fill the captcha field with proper input events.
//   4. Optionally auto-click Login, with a bounded retry (refresh + re-solve).
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

  // ---------- small helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (sel) => document.querySelector(sel);

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(DEFAULTS, (items) => resolve(items || DEFAULTS));
    });
  }

  // Set a value on an input the way a real user would, so any listeners fire.
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
        maxWidth: "280px"
      });
      document.body.appendChild(pill);
    }
    pill.style.background =
      tone === "error" ? "#c0392b" : tone === "ok" ? "#2e7d32" : "#34495e";
    pill.textContent = "SRM: " + text;
  }

  // ---------- captcha solving ----------
  function readFromDataset() {
    const v = document.documentElement.dataset.srmCaptchaText;
    return v && v.length ? v : null;
  }

  function readFromScripts() {
    const scripts = document.querySelectorAll("script:not([src])");
    for (const s of scripts) {
      const m = s.textContent && s.textContent.match(/captchaText\s*=\s*['"]([^'"]+)['"]/);
      if (m) return m[1];
    }
    return null;
  }

  async function waitForPageCaptcha(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const v = readFromDataset() || readFromScripts();
      if (v) return v;
      await sleep(150);
    }
    return null;
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  async function getCaptchaImageDataUrl() {
    const img = $(SEL.captchaImg);
    if (!img) return null;
    // The live <img> may only carry data-src until the page's own JS sets src.
    let url = img.currentSrc || img.src || img.getAttribute("data-src");
    if (!url) return null;
    try {
      // Same-origin fetch (with cookies) so the servlet returns the current image.
      const resp = await fetch(url, { credentials: "include", cache: "no-store" });
      const blob = await resp.blob();
      return await blobToDataURL(blob);
    } catch (e) {
      return null;
    }
  }

  async function solveViaGemini() {
    const dataUrl = await getCaptchaImageDataUrl();
    if (!dataUrl) return null;
    try {
      const res = await chrome.runtime.sendMessage({ type: "solveGemini", dataUrl });
      if (res && res.ok) return res.text;
      if (res && res.error) status(res.error, "error");
    } catch (e) {
      status("Gemini call failed: " + e.message, "error");
    }
    return null;
  }

  // Precedence: page value -> inline script regex -> Gemini vision fallback.
  async function solveCaptcha() {
    const fromPage = await waitForPageCaptcha(4000);
    if (fromPage) return { text: fromPage, source: "page" };

    status("Reading captcha with Gemini…");
    const fromGemini = await solveViaGemini();
    if (fromGemini) return { text: fromGemini, source: "gemini" };

    return null;
  }

  // ---------- main flow ----------
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

    let solved = null;
    if (settings.autoSolve) {
      status("Solving captcha…");
      solved = await solveCaptcha();
      const field = $(SEL.captcha);
      if (solved && field) {
        setNativeValue(field, solved.text);
        status("Captcha filled (" + solved.source + "): " + solved.text, "ok");
      } else {
        status("Could not solve captcha — fill it manually.", "error");
      }
    }

    if (settings.autoSubmit) {
      await maybeAutoSubmit(settings, solved);
    }
  }

  async function maybeAutoSubmit(settings, solved) {
    const haveCreds =
      settings.autofillCreds && settings.netid && settings.password;
    if (!haveCreds) {
      status("Auto-submit skipped: set NetID + password in the popup.", "error");
      return;
    }
    if (!solved) {
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
      status(
        "Auto-submit stopped after " + attempts + " tries (avoiding lockout). Log in manually.",
        "error"
      );
      return;
    }

    try {
      sessionStorage.setItem(ATTEMPT_KEY, String(attempts + 1));
    } catch (e) {
      /* ignore */
    }

    status("Logging in… (attempt " + (attempts + 1) + ")");
    const btn = $(SEL.login);
    // Let the field events settle, then click the real button so the page's
    // own JS (token/fingerprint generation) runs normally.
    await sleep(300);
    if (btn) {
      btn.click();
    } else {
      const form = $(SEL.form);
      if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
    }
  }

  // Clear the attempt counter if we ever land somewhere that isn't the login
  // page (i.e. login succeeded). This content script only runs on loginManager,
  // so reaching here again means we're still on login -> a prior attempt failed.
  run();
})();
