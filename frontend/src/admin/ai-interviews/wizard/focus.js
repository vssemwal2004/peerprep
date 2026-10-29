// Scrolls to and focuses the first rendered [data-field] whose key is listed,
// preferring its invalid control, then any usable control inside it.
export function focusFields(fields = []) {
  if (!fields.length || typeof document === "undefined") return false;
  const element = [...document.querySelectorAll("[data-field]")].find((node) =>
    fields.includes(node.dataset.field),
  );
  if (!element) return false;
  element.scrollIntoView?.({ block: "center", behavior: "smooth" });
  const target =
    element.querySelector('[aria-invalid="true"]') ||
    element.querySelector(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [role="radio"][tabindex="0"], button:not([disabled])',
    );
  target?.focus({ preventScroll: true });
  return Boolean(target);
}

export const nonce = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
