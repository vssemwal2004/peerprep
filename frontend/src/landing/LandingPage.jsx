import { useEffect, useMemo, useState } from "react";
import { useHref } from "react-router-dom";
import { hideGlobalLoader } from "../utils/globalLoader";

const LANDING_DOCUMENT_URL = "/landing-page/index.html";
const LANDING_ASSET_BASE = "/landing-page/";

function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function prepareLandingDocument(source, appRoot, appOrigin) {
  const route = (path) => new URL(
    `${appRoot}${path.replace(/^\//, "")}`,
    appOrigin,
  ).href;

  return source
    .replace("<head>", `<head>\n  <base href="${LANDING_ASSET_BASE}" />`)
    .replaceAll(
      'href="https://peerprep.co.in/contact"',
      `href="${route("/contact")}" target="_top"`,
    )
    .replaceAll(
      'href="https://peerprep.co.in/privacy"',
      `href="${route("/privacy")}" target="_top"`,
    )
    .replaceAll(
      'href="https://peerprep.co.in/terms"',
      `href="${route("/terms")}" target="_top"`,
    )
    .replaceAll(
      'href="https://peerprep.co.in/"',
      `href="${route("/student")}" target="_top"`,
    );
}

export default function LandingPage() {
  const routerRoot = withTrailingSlash(useHref("/"));
  const [documentSource, setDocumentSource] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch(LANDING_DOCUMENT_URL, {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Landing page request failed with ${response.status}`);
        }
        return response.text();
      })
      .then((source) => {
        setDocumentSource(source);
        setLoadError(false);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setLoadError(true);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "PeerPrep — Learn. Practice. Prove you are ready.";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  // The index.html boot loader covers the page until the iframe has rendered or failed.
  // Navigating away from "/" earlier is handled by useHideGlobalLoader in App.jsx.
  useEffect(() => {
    if (frameReady || loadError) hideGlobalLoader();
  }, [frameReady, loadError]);

  const landingDocument = useMemo(
    () => (documentSource
      ? prepareLandingDocument(documentSource, routerRoot, window.location.origin)
      : ""),
    [documentSource, routerRoot],
  );

  return (
    <section
      aria-label="PeerPrep landing page"
      style={{
        position: "relative",
        width: "100%",
        height: "100svh",
        minHeight: "100vh",
        overflow: "hidden",
        background: "#0a0a0b",
      }}
    >
      {loadError && (
        <div
          role="alert"
          style={{
            minHeight: "100%",
            display: "grid",
            placeItems: "center",
            padding: "2rem",
            color: "#f2f2ef",
            fontFamily: "Manrope, system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          The landing page could not be loaded. Please refresh and try again.
        </div>
      )}

      {landingDocument && (
        <iframe
          title="PeerPrep — placement preparation platform"
          srcDoc={landingDocument}
          onLoad={() => setFrameReady(true)}
          allow="autoplay"
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            border: 0,
            display: "block",
            opacity: frameReady ? 1 : 0,
          }}
        />
      )}
    </section>
  );
}
