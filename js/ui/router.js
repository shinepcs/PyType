export function createScreenRouter({ root = document, onBeforeChange = () => {} } = {}) {
  const screens = new Map(
    [...root.querySelectorAll("[data-screen]")].map((screen) => [screen.dataset.screen, screen]),
  );
  let current = null;

  function show(name, { focus = true } = {}) {
    const next = screens.get(name);
    if (!next) {
      throw new Error(`Unknown screen: ${name}`);
    }

    onBeforeChange(current, name);
    for (const [screenName, screen] of screens) {
      screen.hidden = screenName !== name;
      screen.setAttribute("aria-hidden", String(screenName !== name));
    }
    current = name;
    document.body.dataset.screen = name;
    if (focus) {
      requestAnimationFrame(() => {
        const heading = next.querySelector("h1, [tabindex='-1']") ?? next;
        if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      });
    }
  }

  return {
    show,
    get current() {
      return current;
    },
    has: (name) => screens.has(name),
  };
}
