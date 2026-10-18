// Applies the saved (or system) colour theme and palette before first paint.
(() => {
  let theme;
  let palette;
  try {
    theme = localStorage.getItem("incident-desk-theme");
    palette = localStorage.getItem("incident-desk-palette");
  } catch {}
  if (!["light", "dark"].includes(theme)) {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.palette = ["harbor", "forest", "sunset", "graphite", "arcade"].includes(palette) ? palette : "harbor";
})();
