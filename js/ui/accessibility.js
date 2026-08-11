export function announce(message, { node = document.querySelector("#sr-status"), clearAfterMs = 1500 } = {}) {
  if (!node) return;
  node.textContent = "";
  requestAnimationFrame(() => {
    node.textContent = String(message ?? "");
  });
  if (clearAfterMs > 0) {
    window.setTimeout(() => {
      if (node.textContent === String(message ?? "")) node.textContent = "";
    }, clearAfterMs);
  }
}
export function applyAccessibilitySettings(settings = {}) {
  const reducedMotion = Boolean(settings.reducedMotion);
  const fontScale = Number.isFinite(Number(settings.fontScale)) ? Number(settings.fontScale) : 1;
  document.documentElement.dataset.reducedMotion = String(reducedMotion);
  document.documentElement.style.setProperty("--font-scale", String(Math.min(1.3, Math.max(0.9, fontScale))));
}

export function trapDialogCancel(dialog, onCancel) {
  const handler = (event) => {
    event.preventDefault();
    onCancel?.();
  };
  dialog.addEventListener("cancel", handler);
  return () => dialog.removeEventListener("cancel", handler);
}
