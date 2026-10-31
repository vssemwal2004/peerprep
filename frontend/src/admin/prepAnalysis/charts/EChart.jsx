import { useEffect, useRef, useState } from "react";
import { chartTheme, isDarkMode } from "./chartTheme";

let echartsPromise = null;
const loadEcharts = () => {
  echartsPromise ||= import("./echartsSetup").then((module) => module.default);
  return echartsPromise;
};

/** Follows the `dark` class on <html> so charts redraw when the theme changes. */
function useDarkMode() {
  const [dark, setDark] = useState(isDarkMode);
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return undefined;
    const observer = new MutationObserver(() => setDark(isDarkMode()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/**
 * Renders an ECharts option produced by buildOption(theme).
 * The instance is created once per mount, resized with its box, and disposed on unmount.
 * onClick(params) receives clicks on data (and on clickable labels such as radar topics);
 * onBlankClick({ x, y }, chart) receives clicks on empty chart space; instanceRef (optional)
 * gets the instance.
 */
export default function EChart({ buildOption, height, ariaLabel, onClick, onBlankClick, instanceRef }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const blankRef = useRef(onBlankClick);
  blankRef.current = onBlankClick;
  const dark = useDarkMode();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let observer;
    loadEcharts().then((echarts) => {
      if (disposed || !containerRef.current) return;
      chartRef.current = echarts.init(containerRef.current, null, { renderer: "canvas" });
      const chart = chartRef.current;
      // The chart's click and zrender's click share one event object: the chart marks it, and
      // a click it never marked (empty space, a bar's background track) is passed on with its
      // position once both have run, whatever order they run in.
      chart.on("click", (params) => {
        if (params.event) params.event.peerprepHandled = true;
        clickRef.current?.(params);
      });
      chart.getZr().on("click", (event) => {
        setTimeout(() => { if (!event.peerprepHandled) blankRef.current?.({ x: event.offsetX, y: event.offsetY }, chart); }, 0);
      });
      chart.getZr().on("mousemove", (event) => {
        if (!event.target) chart.getZr().setCursorStyle(blankRef.current ? "pointer" : "default");
      });
      if (instanceRef) instanceRef.current = chart;
      // Lets the local browser checks find bars and slices; never in a production build.
      if (import.meta.env?.DEV) containerRef.current.__peerprepChart = chart;
      observer = new ResizeObserver(() => chartRef.current?.resize());
      observer.observe(containerRef.current);
      setReady(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
      if (instanceRef) instanceRef.current = null;
    };
  }, [instanceRef]);

  useEffect(() => {
    if (!ready || !chartRef.current) return;
    const option = buildOption(chartTheme(dark));
    if (option) chartRef.current.setOption({ aria: { enabled: true }, ...option }, { notMerge: true, lazyUpdate: true });
  }, [buildOption, dark, ready]);

  return (
    <div style={{ height }} className="relative w-full" role="img" aria-label={ariaLabel}>
      <div ref={containerRef} className="absolute inset-0" />
      {!ready && <div className="absolute inset-0 animate-pulse rounded-lg bg-slate-100/70 dark:bg-white/[0.03]" />}
    </div>
  );
}
