(function () {
  "use strict";

  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sports/service-worker.js", { scope: "/sports/" }).catch(function () {
      /* The Sports Center remains fully usable when installation is unavailable. */
    });
  });

  let installPrompt = null;
  const installButtons = Array.from(document.querySelectorAll("[data-install-sports]"));

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    installPrompt = event;
    installButtons.forEach(function (button) { button.hidden = false; });
  });

  installButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      if (!installPrompt) return;
      installPrompt.prompt();
      installPrompt.userChoice.finally(function () {
        installPrompt = null;
        installButtons.forEach(function (item) { item.hidden = true; });
      });
    });
  });

  window.addEventListener("appinstalled", function () {
    installPrompt = null;
    installButtons.forEach(function (button) { button.hidden = true; });
  });
}());
