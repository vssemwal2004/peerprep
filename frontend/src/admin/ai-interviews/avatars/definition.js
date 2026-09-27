export const renderActive = (doc) =>
  ["queued", "processing"].includes(doc?.render?.status);
export function languagePreview(doc, language) {
  if (doc?.languagePreviews?.[language]) return doc.languagePreviews[language];
  const asset = doc?.assets?.preview;
  if (asset && (asset.language || doc.data.language) === language)
    return { ...asset, stale: doc.previewStale, introduction: asset.introduction || doc.data.introduction };
  return null;
}
export const renderStageLabel = (stage) => ({
  queued: "Waiting for the renderer",
  awaiting_confirmation: "Confirming the render request",
  downloading: "Preparing source media",
  validating: "Checking source and audio",
  synthesizing: "Creating the introduction voice",
  rendering: "Animating the introduction",
  saving_preview: "Saving your preview",
  preview_transfer_retry: "Retrying preview storage",
  ready: "Preview ready",
  complete: "Preview ready",
})[stage] || "Preparing preview";
export const previewReady = (doc) =>
  Boolean(
    doc?.active !== false &&
      doc?.assets?.preview?.url &&
      doc?.render?.status === "ready" &&
      !doc.previewStale,
  );
export const languageName = (value) =>
  ({ en: "English", hi: "Hindi", hinglish: "Hinglish · Experimental" })[
    value
  ] || value;
