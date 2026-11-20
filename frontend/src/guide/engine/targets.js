// Where a guide step points. A step's `target` is one of:
//   "@name"                    the element marked data-tour="name" inside the chart card (ctx.root)
//   "#name"                    the element marked data-tour="name" anywhere on the page
//   (ctx) => Element | null    any element
//   (ctx) => { series, index } one bar, slice or point inside the chart's canvas (ECharts)
//   null / undefined           no spotlight: the card sits in the middle of the screen

const PAD = 6;

export function findElement(target, ctx) {
  if (!target) return null;
  if (typeof target === "string") {
    const scope = target.startsWith("@") ? ctx?.root : document;
    const name = target.slice(1);
    return scope?.querySelector?.(`[data-tour="${CSS.escape(name)}"]`) || null;
  }
  if (typeof target === "function") {
    const value = target(ctx);
    return value instanceof Element ? value : null;
  }
  return null;
}

/** A chart item's box in page (client) pixels, from the chart instance's own layout. */
export function chartItemRect(instance, series = 0, index = 0) {
  try {
    const data = instance?.getModel?.().getSeriesByIndex(series)?.getData?.();
    const layout = data?.getItemLayout?.(index);
    const box = instance.getDom().getBoundingClientRect();
    if (!layout) return null;
    // Bars: { x, y, width, height } (width or height can be negative).
    if (Number.isFinite(layout.width) && Number.isFinite(layout.height)) {
      const x = Math.min(layout.x, layout.x + layout.width);
      const y = Math.min(layout.y, layout.y + layout.height);
      return { left: box.left + x, top: box.top + y, width: Math.max(8, Math.abs(layout.width)), height: Math.max(8, Math.abs(layout.height)) };
    }
    // Pie slices: { cx, cy, r, r0, startAngle, endAngle } — the box around the slice's middle.
    if (Number.isFinite(layout.cx) && Number.isFinite(layout.r)) {
      const angle = (layout.startAngle + layout.endAngle) / 2;
      const radius = ((layout.r0 || 0) + layout.r) / 2;
      const size = Math.max(28, (layout.r - (layout.r0 || 0)) * 1.3);
      return { left: box.left + layout.cx + Math.cos(angle) * radius - size / 2, top: box.top + layout.cy + Math.sin(angle) * radius - size / 2, width: size, height: size };
    }
    // Line points: [x, y].
    if (Array.isArray(layout) && Number.isFinite(layout[0])) return { left: box.left + layout[0] - 14, top: box.top + layout[1] - 14, width: 28, height: 28 };
  } catch { /* the chart may have been redrawn; fall back to the whole chart */ }
  return null;
}

const asRect = (rect) => (rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null);

/** The spotlight box for a step (padded), or null for a centred card. */
export function targetRect(step, ctx) {
  const target = step?.target;
  if (!target) return null;
  let rect = null;
  if (typeof target === "function") {
    const value = target(ctx);
    if (value instanceof Element) rect = asRect(value.getBoundingClientRect());
    else if (value && Number.isInteger(value.index)) rect = chartItemRect(ctx?.instance?.current, value.series || 0, value.index);
  } else {
    rect = asRect(findElement(target, ctx)?.getBoundingClientRect());
  }
  // A step whose part is not drawn (empty data, another view) spotlights the chart instead.
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    const fallback = ctx?.root?.querySelector?.('[data-tour="body"]');
    rect = fallback ? asRect(fallback.getBoundingClientRect()) : null;
  }
  return rect ? { left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 } : null;
}

/** The element to scroll into view for a step (its own element, else the chart card). */
export function scrollElement(step, ctx) {
  const target = step?.target;
  if (!target) return null;
  if (typeof target === "string") return findElement(target, ctx) || ctx?.root || null;
  if (typeof target === "function") {
    const value = target(ctx);
    if (value instanceof Element) return value;
  }
  return ctx?.root?.querySelector?.('[data-tour="body"]') || ctx?.root || null;
}

/** Card placement next to a box: below, above, right or left, whichever fits; else centred low. */
export function placeCard(rect, card, viewport) {
  const gap = 14;
  const margin = 12;
  if (!rect) return { left: (viewport.width - card.width) / 2, top: Math.max(margin, (viewport.height - card.height) / 2), placement: "center" };
  const clampX = (x) => Math.min(Math.max(margin, x), viewport.width - card.width - margin);
  const clampY = (y) => Math.min(Math.max(margin, y), viewport.height - card.height - margin);
  const centerX = rect.left + rect.width / 2 - card.width / 2;
  const centerY = rect.top + rect.height / 2 - card.height / 2;
  if (rect.top + rect.height + gap + card.height <= viewport.height - margin) return { left: clampX(centerX), top: rect.top + rect.height + gap, placement: "bottom" };
  if (rect.top - gap - card.height >= margin) return { left: clampX(centerX), top: rect.top - gap - card.height, placement: "top" };
  if (rect.left + rect.width + gap + card.width <= viewport.width - margin) return { left: rect.left + rect.width + gap, top: clampY(centerY), placement: "right" };
  if (rect.left - gap - card.width >= margin) return { left: rect.left - gap - card.width, top: clampY(centerY), placement: "left" };
  return { left: clampX(centerX), top: viewport.height - card.height - margin, placement: "overlap" };
}
