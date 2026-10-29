import { Line, Polygon, Rect, Svg, Text, View } from "@react-pdf/renderer";
import { C, FONT, toneOf } from "./theme";

// Whole words only (no automatic hyphenation inside chart labels).
const whole = (word) => [word];

// Charts of the report PDF drawn with react-pdf <Svg> primitives (no images): radar charts, the
// question-wise bar chart and star ratings. Labels are positioned <Text> views over the drawing, so they
// use the report font.

export const SERIES = Object.freeze({ you: "#0284C7", cohort: "#EA580C" });

const point = (cx, cy, radius, angle) => [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
const angleOf = (index, count) => -Math.PI / 2 + (index * 2 * Math.PI) / count;
const points = (list) => list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

/**
 * A radar of 0-100 values. rows: [{ key, label, you, cohort? }]; `cohort` draws the dashed comparison.
 * `size` is the drawing's width and height; labels sit around it.
 */
export function PdfRadar({ rows, cohort = false, size = 150, labelWidth = 74 }) {
  const count = rows.length;
  const pad = labelWidth;
  const width = size + pad * 2;
  const height = size + 36;
  const cx = width / 2;
  const cy = height / 2;
  const radius = size / 2 - 4;
  const ring = (fraction) => points(rows.map((_, index) => point(cx, cy, radius * fraction, angleOf(index, count))));
  const series = (key) => points(rows.map((row, index) => point(cx, cy, (radius * Math.max(0, Math.min(100, Number(row[key]) || 0))) / 100, angleOf(index, count))));
  return <View style={{ width, height, position: "relative", alignSelf: "center" }}>
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {[0.25, 0.5, 0.75, 1].map((fraction) => <Polygon key={fraction} points={ring(fraction)} fill="none" stroke={C.border} strokeWidth={0.6} />)}
      {rows.map((row, index) => {
        const [x, y] = point(cx, cy, radius, angleOf(index, count));
        return <Line key={row.key} x1={cx} y1={cy} x2={x} y2={y} stroke={C.border} strokeWidth={0.6} />;
      })}
      {cohort && <Polygon points={series("cohort")} fill={SERIES.cohort} fillOpacity={0.06} stroke={SERIES.cohort} strokeWidth={1.2} strokeDasharray="3 2" />}
      <Polygon points={series("you")} fill={SERIES.you} fillOpacity={0.16} stroke={SERIES.you} strokeWidth={1.4} />
      {rows.map((row, index) => {
        const [x, y] = point(cx, cy, (radius * Math.max(0, Math.min(100, Number(row.you) || 0))) / 100, angleOf(index, count));
        return <Rect key={row.key} x={x - 1.8} y={y - 1.8} width={3.6} height={3.6} rx={1.8} fill={SERIES.you} />;
      })}
    </Svg>
    {rows.map((row, index) => {
      const angle = angleOf(index, count);
      const [x, y] = point(cx, cy, radius + 8, angle);
      const cos = Math.cos(angle);
      const align = Math.abs(cos) < 0.2 ? "center" : cos > 0 ? "left" : "right";
      const left = align === "center" ? x - labelWidth / 2 : align === "left" ? x : x - labelWidth;
      const top = Math.sin(angle) < -0.5 ? y - 18 : Math.sin(angle) > 0.5 ? y + 1 : y - 9;
      return <View key={row.key} style={{ position: "absolute", left, top, width: labelWidth }}>
        <Text hyphenationCallback={whole} style={{ fontFamily: FONT, fontSize: 7, fontWeight: 600, color: C.ink, textAlign: align, lineHeight: 1.2 }}>{row.label}</Text>
        <Text style={{ fontFamily: FONT, fontSize: 7, color: C.muted, textAlign: align, lineHeight: 1.2 }}>{row.you}%{cohort && row.cohort !== null && row.cohort !== undefined ? ` · ${row.cohort}%` : ""}</Text>
      </View>;
    })}
  </View>;
}

/** Overall + Q1..Qn as columns coloured by band, with a dashed cohort line when there is one. */
export function PdfQuestionBars({ rows, cohort = null, width = 500, height = 120 }) {
  const left = 22;
  const plot = { x: left, y: 12, w: width - left - 4, h: height - 12 };
  const slot = plot.w / rows.length;
  const bar = Math.min(26, slot * 0.56);
  const yOf = (value) => plot.y + plot.h - (plot.h * Math.max(0, Math.min(100, value))) / 100;
  return <View style={{ width, height: height + 16, position: "relative" }}>
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {[0, 25, 50, 75, 100].map((tick) => <Line key={tick} x1={plot.x} x2={plot.x + plot.w} y1={yOf(tick)} y2={yOf(tick)} stroke={tick ? C.hairline : C.border} strokeWidth={tick ? 0.6 : 0.9} />)}
      {rows.map((row, index) => {
        const x = plot.x + slot * index + (slot - bar) / 2;
        const top = yOf(Math.max(row.percent, 1.5));
        return <Rect key={row.key} x={x} y={top} width={bar} height={plot.y + plot.h - top} fill={toneOf(row.tone).solid} />;
      })}
      {rows[0]?.index < 0 && <Line x1={plot.x + slot} x2={plot.x + slot} y1={plot.y} y2={plot.y + plot.h} stroke={C.border} strokeWidth={0.6} strokeDasharray="2 2" />}
      {cohort !== null && <Line x1={plot.x} x2={plot.x + plot.w} y1={yOf(cohort)} y2={yOf(cohort)} stroke={SERIES.cohort} strokeWidth={1.1} strokeDasharray="3 2" />}
    </Svg>
    {[0, 50, 100].map((tick) => <Text key={tick} style={{ position: "absolute", left: 0, top: yOf(tick) - 4, width: left - 4, textAlign: "right", fontFamily: FONT, fontSize: 6, color: C.faint }}>{tick}</Text>)}
    {rows.flatMap((row, index) => {
      const x = plot.x + slot * index;
      // The value sits just above the bar, or inside its top (white) when the cohort line would cross it.
      const inside = cohort !== null && cohort > row.percent && cohort - row.percent < 9 && row.percent >= 12;
      return [
        <Text key={`${row.key}-value`} style={{ position: "absolute", top: inside ? yOf(row.percent) + 3 : yOf(row.percent) - 9, left: x + slot / 2 - 12, width: 24, height: 7, lineHeight: 1, textAlign: "center", fontFamily: FONT, fontSize: 6.5, fontWeight: 600, color: inside ? C.white : C.ink }}>{row.percent}%</Text>,
        <Text key={`${row.key}-label`} style={{ position: "absolute", left: x, top: height + 3, width: slot, textAlign: "center", fontFamily: FONT, fontSize: 7, fontWeight: row.index < 0 ? 700 : 500, color: row.index < 0 ? C.ink : C.muted }}>{row.label}</Text>,
      ];
    })}
  </View>;
}

// Five-point star on a 0..10 box: outer and inner points alternate from 12 o'clock, clockwise.
const STAR = Array.from({ length: 10 }, (_, index) => {
  const angle = -Math.PI / 2 + (index * Math.PI) / 5;
  const radius = index % 2 ? 2.1 : 5;
  return [5 + radius * Math.cos(angle), 5.2 + radius * Math.sin(angle)];
});
const STAR_LEFT = [0, 9, 8, 7, 6, 5].map((index) => STAR[index]);

/** 0-5 stars in half steps. */
export function PdfStars({ value = 0, size = 8 }) {
  const stars = Math.max(0, Math.min(5, Math.round((Number(value) || 0) * 2) / 2));
  return <View style={{ flexDirection: "row", gap: 1.5 }}>
    {Array.from({ length: 5 }, (_, index) => {
      const fill = stars - index;
      return <Svg key={index} width={size} height={size} viewBox="0 0 10 10">
        <Polygon points={points(STAR)} fill={C.track} />
        {fill >= 1 && <Polygon points={points(STAR)} fill="#F59E0B" />}
        {fill === 0.5 && <Polygon points={points(STAR_LEFT)} fill="#F59E0B" />}
      </Svg>;
    })}
  </View>;
}
