// Small interaction effects. Nothing here changes data; it only adds feedback.

// Expanding pixel-square ripple under the pointer on buttons, tabs and nav items.
export function installRipples(root = document) {
  const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  root.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target.closest?.(".button, .tab, .nav-button");
      if (!target || target.disabled || reduced()) return;
      const box = target.getBoundingClientRect();
      const size = Math.max(box.width, box.height) * 2;
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      ripple.style.left = `${event.clientX - box.left}px`;
      ripple.style.top = `${event.clientY - box.top}px`;
      ripple.style.width = ripple.style.height = `${size}px`;
      target.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove());
    },
    { passive: true },
  );
}

// Updates `from` in place to match `to`, keeping existing elements so CSS
// transitions (sidebar marker, theme switch, swatch ring) can play.
export function morph(from, to) {
  if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName) {
    from.replaceWith(to.cloneNode(true));
    return;
  }
  if (from.nodeType === 3) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  for (const attribute of [...from.attributes]) if (!to.hasAttribute(attribute.name)) from.removeAttribute(attribute.name);
  for (const attribute of [...to.attributes]) if (from.getAttribute(attribute.name) !== attribute.value) from.setAttribute(attribute.name, attribute.value);
  const current = [...from.childNodes];
  const next = [...to.childNodes];
  next.forEach((node, index) => (current[index] ? morph(current[index], node) : from.appendChild(node.cloneNode(true))));
  current.slice(next.length).forEach((node) => node.remove());
}
