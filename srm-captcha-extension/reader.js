// Runs in the page's MAIN world so it can read window.SECURE_CONFIG (which the
// isolated content script cannot access directly). The SRM login page embeds the
// captcha plaintext at:  window.SECURE_CONFIG.captchaText
//
// We mirror that value onto a DOM dataset attribute so the isolated content
// script can pick it up. We poll on an interval so it stays correct even after
// the captcha is refreshed via the recycle button.
(function () {
  "use strict";

  function sync() {
    try {
      var cfg = window.SECURE_CONFIG;
      var text = cfg && cfg.captchaText;
      if (text != null && String(text).length > 0) {
        document.documentElement.dataset.srmCaptchaText = String(text);
      }
    } catch (e) {
      /* ignore */
    }
  }

  sync();
  document.addEventListener("DOMContentLoaded", sync);
  // Keep in sync across captcha refreshes.
  setInterval(sync, 500);
})();
