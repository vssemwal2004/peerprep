// Pure page packing. Inputs are measured block boxes (CSS px, relative to the
// column's content top, spacing included in each block's own top padding).

/**
 * @param {{id:string, top:number, bottom:number, keepWithNext?:boolean}[]} boxes in flow order
 * @param {(pageIndex:number) => number} availableHeight usable height of the column on each page
 * @returns {string[][]} block ids per page
 */
export function packColumn(boxes, availableHeight) {
  const pages = [];
  let current = [];
  let start = 0;
  boxes.forEach((box) => {
    if (!current.length) {
      current.push(box);
      start = box.top;
      return;
    }
    if (box.bottom - start <= availableHeight(pages.length)) {
      current.push(box);
      return;
    }
    // Headings and entry headers travel with what follows them.
    const carried = [];
    while (current.length > 1 && current[current.length - 1].keepWithNext) carried.unshift(current.pop());
    pages.push(current.map((item) => item.id));
    current = [...carried, box];
    start = current[0].top;
  });
  if (current.length) pages.push(current.map((item) => item.id));
  return pages;
}

/** Combines per-column pages into [{ main:[ids], side:[ids] }]. */
export function combineColumns(columnPages) {
  const count = Math.max(1, ...Object.values(columnPages).map((pages) => pages.length));
  return Array.from({ length: count }, (_, index) => ({
    main: columnPages.main?.[index] || [],
    side: columnPages.side?.[index] || [],
  }));
}

export const pagesSignature = (pages) => JSON.stringify(pages);
