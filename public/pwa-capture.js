// Captures the browser's install prompt as early as possible, before React
// hydrates. beforeinstallprompt fires once per page load and is lost forever
// if no listener is attached yet — this script runs before-interactive so
// later-mounting components never miss it.
(function () {
  window.__heimdellInstallPrompt = null;

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    window.__heimdellInstallPrompt = event;
    window.dispatchEvent(new CustomEvent("heimdell:beforeinstallprompt"));
  });

  window.addEventListener("appinstalled", function () {
    window.__heimdellInstallPrompt = null;
    window.dispatchEvent(new CustomEvent("heimdell:appinstalled"));
  });
})();
