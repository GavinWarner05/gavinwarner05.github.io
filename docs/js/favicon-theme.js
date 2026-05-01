function setFaviconForTheme(theme) {
  const isDark = theme === "dark";
  const faviconShortcut = document.getElementById("favicon-shortcut");
  const favicon32 = document.getElementById("favicon-32");
  const favicon16 = document.getElementById("favicon-16");
  const version = "?v=4";

  if (!faviconShortcut || !favicon32 || !favicon16) return;

  faviconShortcut.href = isDark
    ? "/images/favicons/favicon-dark-32.png" + version
    : "/images/favicons/favicon-light-32.png" + version;

  favicon32.href = isDark
    ? "/images/favicons/favicon-dark-32.png" + version
    : "/images/favicons/favicon-light-32.png" + version;
  favicon16.href = isDark
    ? "/images/favicons/favicon-dark-16.png" + version
    : "/images/favicons/favicon-light-16.png" + version;
}

function getActiveTheme() {
  const body = document.body;
  if (body.classList.contains("colorscheme-dark")) return "dark";
  if (body.classList.contains("colorscheme-light")) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

document.addEventListener("DOMContentLoaded", function () {
  setFaviconForTheme(getActiveTheme());
});

document.addEventListener("themeChanged", function () {
  setFaviconForTheme(getActiveTheme());
});
