// Plain-text editing for the standard PeerPrep student email (the layout of the ready-made
// templates, backend modules/prepAnalysis/prepAnalysis.emailLayout.js, which marks each part with
// data-pp). The admin edits simple text; the HTML is rebuilt from it in the same layout.
//
// Text format:
//   # Title                      the heading in the coloured header
//   A paragraph.                 a blank line starts a new paragraph
//   - a bullet                   consecutive "- " lines make one list
//   [Button text](link)          a button (the link is usually {{dashboardUrl}})

const escape = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
const BUTTON = /^\[([^\]]+)\]\(([^)\s]+)\)$/;
const DEFAULT_META = Object.freeze({ eyebrow: "PeerPrep · Prep Coding", accent: "#0284c7" });

/** A node's text with <br> kept as a line break. */
function nodeText(node) {
  let text = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) text += child.nodeValue;
    else if (child.nodeName === "BR") text += "\n";
    else text += nodeText(child);
  });
  return text;
}
const tidy = (text) => text.replace(/[ \t\r]+/g, " ").replace(/ *\n */g, "\n").trim();

/**
 * The text of an email in the standard layout: { text, meta: { eyebrow, accent } }, or null when the
 * HTML is not in that layout (a custom design), which is then edited as HTML only.
 */
export function htmlToEmailText(html, parser = typeof DOMParser !== "undefined" ? new DOMParser() : null) {
  if (!parser || !html) return null;
  const doc = parser.parseFromString(String(html), "text/html");
  const body = doc.querySelector('[data-pp="body"]');
  if (!doc.querySelector('[data-pp="email"]') || !body) return null;
  const title = doc.querySelector('[data-pp="title"]');
  const eyebrow = doc.querySelector('[data-pp="eyebrow"]');
  const accent = /background-color:\s*(#[0-9a-f]{3,8})/i.exec(title?.parentElement?.getAttribute("style") || "")?.[1];
  const blocks = [];
  for (const element of body.children) {
    const button = element.matches('a[data-pp="button"]') ? element : element.querySelector('a[data-pp="button"]');
    if (button) blocks.push(`[${tidy(nodeText(button))}](${button.getAttribute("href") || ""})`);
    else if (element.matches('[data-pp="list"]')) blocks.push([...element.querySelectorAll("li")].map((item) => `- ${tidy(nodeText(item))}`).join("\n"));
    else if (tidy(nodeText(element))) blocks.push(tidy(nodeText(element)));
  }
  return {
    text: [title ? `# ${tidy(nodeText(title))}` : "", ...blocks].filter(Boolean).join("\n\n"),
    meta: { eyebrow: eyebrow ? tidy(nodeText(eyebrow)) : DEFAULT_META.eyebrow, accent: accent || DEFAULT_META.accent },
  };
}

/** The email HTML for this text, in the standard layout (same markup as the backend). */
export function emailTextToHtml(text, meta = DEFAULT_META) {
  const accent = /^#[0-9a-f]{3,8}$/i.test(meta?.accent || "") ? meta.accent : DEFAULT_META.accent;
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  let title = "";
  if (/^#\s+/.test(lines[0] || "")) title = lines.shift().replace(/^#\s+/, "").trim();
  const chunks = lines.join("\n").split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean);
  const body = chunks.map((chunk) => {
    const rows = chunk.split("\n").map((row) => row.trim());
    const button = BUTTON.exec(chunk);
    if (button) {
      return `      <p style="margin:6px 0 24px;text-align:center;"><a data-pp="button" href="${escape(button[2])}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:10px;">${escape(button[1])}</a></p>`;
    }
    if (rows.every((row) => /^[-*]\s+/.test(row))) {
      return `      <ul data-pp="list" style="margin:0 0 18px;padding-left:20px;color:#334155;">\n${rows.map((row) => `        <li style="margin:4px 0;">${escape(row.replace(/^[-*]\s+/, ""))}</li>`).join("\n")}\n      </ul>`;
    }
    return `      <p data-pp="p" style="margin:0 0 14px;">${rows.map(escape).join("<br>")}</p>`;
  }).join("\n");
  return `<div data-pp="email" style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
    <tr><td style="background-color:${accent};padding:22px 28px;color:#ffffff;">
      <div data-pp="eyebrow" style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.85;">${escape(meta?.eyebrow || DEFAULT_META.eyebrow)}</div>
      <div data-pp="title" style="margin-top:6px;font-size:22px;font-weight:800;line-height:1.3;">${escape(title)}</div>
    </td></tr>
    <tr><td data-pp="body" style="padding:26px 28px 8px;color:#0f172a;font-size:15px;line-height:1.65;">
${body}
    </td></tr>
    <tr><td style="padding:16px 28px 22px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.5;">
      Sent by your placement team at {{college}} through PeerPrep.
    </td></tr>
  </table>
</div>`;
}
