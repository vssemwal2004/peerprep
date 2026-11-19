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
  const hoverRef = useRef(null);
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
      // Trend charts: show the nearest point's tooltip wherever the pointer is on the canvas, even
      // outside the plot rectangle (edge points, Safari's pointer offsets). A tap does the same.
      const showNearest = (event, force = false) => {
        if (hoverRef.current !== "nearest-x") return;
        const count = hoverRef.count || 0;
        if (!count) return;
        let index;
        // The plot's own conversion works for any pixel, inside the plot or beside it.
        try { [index] = chart.convertFromPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY]) || []; } catch { return; }
        if (!Number.isFinite(index)) return;
        index = Math.max(0, Math.min(count - 1, Math.round(index)));
        if (hoverRef.index === index && !force) return;
        hoverRef.index = index;
        chart.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: index });
      };
      chart.getZr().on("mousemove", (event) => {
        if (!event.target) chart.getZr().setCursorStyle(blankRef.current ? "pointer" : "default");
        showNearest(event);
      });
      chart.getZr().on("mousedown", (event) => showNearest(event, true));
      chart.getZr().on("globalout", () => {
        if (hoverRef.current !== "nearest-x") return;
        hoverRef.index = null;
        chart.dispatchAction({ type: "hideTip" });
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
    const built = buildOption(chartTheme(dark));
    if (!built) return;
    // `peerprepHover` is ours, not an ECharts option: how the pointer picks a point.
    const { peerprepHover, ...option } = built;
    hoverRef.current = peerprepHover || null;
    hoverRef.count = Array.isArray(option.xAxis) ? option.xAxis[0]?.data?.length : option.xAxis?.data?.length;
    hoverRef.index = null;
    chartRef.current.setOption({ aria: { enabled: true }, ...option }, { notMerge: true, lazyUpdate: true });
  }, [buildOption, dark, ready]);

  return (
    <div style={{ height }} className="relative w-full" role="img" aria-label={ariaLabel}>
      <div ref={containerRef} className="absolute inset-0" />
      {!ready && <div className="absolute inset-0 animate-pulse rounded-lg bg-slate-100/70 dark:bg-white/[0.03]" />}
    </div>
  );
}
