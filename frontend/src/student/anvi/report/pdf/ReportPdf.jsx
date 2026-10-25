import { Circle, Document, Ellipse, Image, Line, Page, Path, Polygon, Polyline, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { ICONS } from "./icons";
import { PdfQuestionBars, PdfRadar, PdfStars, SERIES } from "./charts";
import { C, FONT, PAGE, VERDICT_TONE, toneOf } from "./theme";
import {
  AI_COUNTS, BLOCKED_COUNTS, ON_LIMIT_LABELS, PROCTOR_COUNTS, PROCTOR_EVENTS, VERDICTS, confidenceLabel, istClock, isAiDetection, marks,
  proctorEventLabel, proctoringRules, secondsLabel,
} from "../reportModel";

// The ANVI report as a branded A4 PDF (@react-pdf/renderer). It renders the content model from
// buildReportModel, the same one the screen uses, so both always show the same numbers.

// No automatic hyphenation (it splits ordinary words); very long tokens such as URLs break in chunks.
const hyphenation = (word) => (word.length > 28 ? word.match(/.{1,18}/g) : [word]);
function T({ style, children, ...rest }) {
  return <Text hyphenationCallback={hyphenation} style={style} {...rest}>{children}</Text>;
}

// Screen icon keys that lucide names differently.
const ICON_ALIASES = { barChart: "chartColumn" };
const SVG_TAGS = { path: Path, circle: Circle, rect: Rect, line: Line, polyline: Polyline, polygon: Polygon, ellipse: Ellipse };
/** A lucide icon drawn as vector paths. */
export function PdfIcon({ name, size = 10, color = C.muted, strokeWidth = 2 }) {
  const nodes = ICONS[ICON_ALIASES[name] || name] || ICONS.info;
  return <Svg viewBox="0 0 24 24" width={size} height={size}>
    {nodes.map(([tag, attrs], index) => {
      const Tag = SVG_TAGS[tag];
      return Tag ? <Tag key={index} {...attrs} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" /> : null;
    })}
  </Svg>;
}

const s = StyleSheet.create({
  page: { paddingTop: PAGE.top, paddingBottom: PAGE.bottom, paddingHorizontal: PAGE.side, fontFamily: FONT, fontSize: 9.5, lineHeight: 1.45, color: C.body, backgroundColor: C.white },
  // Running header (pages 2+) and footer (every page).
  runHead: { position: "absolute", top: 22, left: PAGE.side, right: PAGE.side, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottomWidth: 0.75, borderBottomColor: C.border },
  runHeadText: { fontSize: 7.5, color: C.muted, maxWidth: 330, textAlign: "right" },
  runFoot: { position: "absolute", top: PAGE.height - 44, left: PAGE.side, right: PAGE.side, flexDirection: "row", gap: 4, alignItems: "center", paddingTop: 8, borderTopWidth: 0.75, borderTopColor: C.border },
  pageNumber: { position: "absolute", top: PAGE.height - 35.4, right: PAGE.side, fontSize: 7.5, color: C.muted },
  runFootText: { fontSize: 7.5, color: C.muted },
  // Cover band (page 1, full bleed).
  cover: { marginTop: -PAGE.top, marginHorizontal: -PAGE.side, paddingTop: 30, paddingBottom: 46, paddingHorizontal: PAGE.side, backgroundColor: C.cover, position: "relative" },
  coverTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  coverLabel: { fontSize: 7.5, fontWeight: 600, letterSpacing: 1.4, color: C.coverMuted, textTransform: "uppercase" },
  coverTitle: { marginTop: 22, fontSize: 21, fontWeight: 700, lineHeight: 1.2, color: C.white, maxWidth: 420 },
  coverSub: { marginTop: 6, fontSize: 10, color: C.coverText },
  kind: { marginTop: 14, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 9, borderWidth: 0.75, borderColor: "#2C6A8F", paddingVertical: 2, paddingHorizontal: 7 },
  kindText: { fontSize: 7.5, fontWeight: 600, color: C.coverText },
  // Meta card overlapping the band.
  metaCard: { marginTop: -26, flexDirection: "row", backgroundColor: C.white, borderWidth: 0.75, borderColor: C.border, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 4 },
  metaItem: { flex: 1, flexDirection: "row", gap: 7, paddingHorizontal: 10 },
  metaDivider: { borderLeftWidth: 0.75, borderLeftColor: C.hairline },
  label: { fontSize: 7, fontWeight: 600, letterSpacing: 0.6, lineHeight: 1.3, textTransform: "uppercase", color: C.muted },
  metaValue: { marginTop: 2, fontSize: 9, fontWeight: 600, color: C.ink },
  metaDetail: { marginTop: 1, fontSize: 7.5, color: C.muted },
  // Blocks.
  block: { marginTop: 18 },
  row: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  card: { borderWidth: 0.75, borderColor: C.border, borderRadius: 8, padding: 14, backgroundColor: C.white },
  headRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  tile: { width: 20, height: 20, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  h2: { fontSize: 11.5, fontWeight: 600, color: C.ink },
  hint: { fontSize: 7.5, color: C.muted, marginTop: 1 },
  sectionTitle: { fontSize: 14, fontWeight: 700, lineHeight: 1.25, color: C.ink },
  // Score.
  scoreCard: { flexDirection: "row", alignItems: "center", gap: 16 },
  scoreBig: { fontSize: 20, fontWeight: 700, lineHeight: 1.15, color: C.ink },
  scoreOf: { fontSize: 10, fontWeight: 500, color: C.muted },
  chip: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", borderRadius: 9, borderWidth: 0.75, paddingVertical: 2, paddingHorizontal: 7 },
  chipText: { fontSize: 7.5, fontWeight: 600, lineHeight: 1.25 },
  summary: { marginTop: 7, fontSize: 9, lineHeight: 1.5, color: C.body },
  kpi: { flex: 1, justifyContent: "space-between", gap: 6, borderWidth: 0.75, borderColor: C.border, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10 },
  kpiValue: { fontSize: 13.5, fontWeight: 700, color: C.ink },
  kpiDetail: { marginTop: 1, fontSize: 7.5, color: C.muted },
  // Bars.
  barRow: { marginBottom: 8 },
  barHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 3 },
  barName: { fontSize: 8.5, fontWeight: 500, color: C.ink, maxWidth: "70%" },
  barValue: { fontSize: 8.5, fontWeight: 600, color: C.ink },
  barDetail: { fontSize: 7.5, color: C.muted },
  track: { height: 4.5, borderRadius: 2.25, backgroundColor: C.track, overflow: "hidden" },
  fill: { height: 4.5, borderRadius: 2.25, backgroundColor: C.brand },
  // Lists.
  listItem: { flexDirection: "row", gap: 7, marginBottom: 6 },
  bullet: { width: 12, height: 12, borderRadius: 6, alignItems: "center", justifyContent: "center", marginTop: 0.5 },
  listText: { flex: 1, fontSize: 9, lineHeight: 1.45, color: C.body },
  step: { width: 15, height: 15, borderRadius: 7.5, backgroundColor: C.brand600, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 7.5, fontWeight: 700, lineHeight: 1, color: C.white },
  // Responses.
  response: { borderWidth: 0.75, borderColor: C.border, borderRadius: 8, padding: 14, marginBottom: 10 },
  responseHead: { flexDirection: "row", justifyContent: "space-between", gap: 14 },
  eyebrow: { fontSize: 7, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: C.brand700 },
  question: { marginTop: 3, fontSize: 10, fontWeight: 600, lineHeight: 1.4, color: C.ink },
  marksBox: { width: 92, alignItems: "flex-end" },
  marksText: { fontSize: 12, fontWeight: 700, color: C.ink },
  smallMuted: { fontSize: 7.5, color: C.muted },
  subLabel: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, marginBottom: 4 },
  answer: { backgroundColor: C.surface, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 9, fontSize: 9, lineHeight: 1.5, color: C.body },
  answerMissing: { borderWidth: 0.75, borderStyle: "dashed", borderColor: C.border, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 9, fontSize: 9, color: C.muted },
  metrics: { flexDirection: "row", gap: 12, marginTop: 5 },
  metric: { flexDirection: "row", alignItems: "center", gap: 3 },
  points: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  point: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 0.75, borderRadius: 5, paddingVertical: 2.5, paddingHorizontal: 5, maxWidth: "100%" },
  pointDot: { width: 9, height: 9, borderRadius: 4.5, alignItems: "center", justifyContent: "center" },
  pointText: { fontSize: 8, lineHeight: 1.3 },
  feedback: { marginTop: 10, borderLeftWidth: 2, borderLeftColor: C.brand, backgroundColor: C.brand50, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 9 },
  feedbackLabel: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 },
  flags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 7 },
  // Integrity tables.
  counts: { flexDirection: "row", gap: 6 },
  count: { flex: 1, justifyContent: "space-between", borderWidth: 0.75, borderColor: C.border, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 7 },
  countValue: { marginTop: 2, fontSize: 12, fontWeight: 700, color: C.ink },
  tableHead: { flexDirection: "row", backgroundColor: C.surface, borderTopLeftRadius: 5, borderTopRightRadius: 5, paddingVertical: 4, paddingHorizontal: 7 },
  tableRow: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 7, borderTopWidth: 0.5, borderTopColor: C.hairline },
  tableCell: { fontSize: 8, color: C.body },
  table: { borderWidth: 0.75, borderColor: C.border, borderRadius: 6, marginTop: 4 },
  rule: { fontSize: 7.5, color: C.body, backgroundColor: C.surface, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 6 },
  note: { flexDirection: "row", gap: 6, borderRadius: 6, borderWidth: 0.75, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 8 },
  coverChips: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 5 },
  pill: { flex: 1, borderWidth: 0.75, borderColor: C.border, borderRadius: 7, backgroundColor: C.surface, paddingVertical: 8, paddingHorizontal: 10 },
  metricRow: { flexDirection: "row", gap: 9, paddingVertical: 6, borderTopWidth: 0.5, borderTopColor: C.hairline },
  metricNote: { flex: 1, fontSize: 7.5, lineHeight: 1.35 },
  skillRow: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 5 },
  stat: { flex: 1, borderWidth: 0.75, borderColor: C.border, borderRadius: 7, paddingVertical: 7, paddingHorizontal: 8 },
  question2: { paddingTop: 2 },
  qBadge: { backgroundColor: C.brand600, borderRadius: 4, paddingVertical: 2, paddingHorizontal: 5 },
  qBadgeText: { fontSize: 8, fontWeight: 700, color: C.white, lineHeight: 1.1 },
  disclaimer: { marginTop: 14, flexDirection: "row", gap: 8, backgroundColor: C.surface, borderRadius: 8, borderWidth: 0.75, borderColor: C.border, padding: 11 },
});

function IconTile({ name, tone = "brand", size = 20 }) {
  const t = toneOf(tone);
  return <View style={[s.tile, { width: size, height: size, backgroundColor: t.bg }]}><PdfIcon name={name} size={size * 0.55} color={t.fg} /></View>;
}

function Chip({ tone = "neutral", icon, children }) {
  const t = toneOf(tone);
  return <View style={[s.chip, { backgroundColor: t.bg, borderColor: t.border }]}>
    {icon && <PdfIcon name={icon} size={7.5} color={t.fg} strokeWidth={2.4} />}
    <T style={[s.chipText, { color: t.fg }]}>{children}</T>
  </View>;
}

function CardHead({ icon, tone, title, hint }) {
  return <View style={s.headRow} minPresenceAhead={40}>
    <IconTile name={icon} tone={tone} />
    <View style={{ flex: 1 }}>
      <T style={s.h2}>{title}</T>
      {hint ? <T style={s.hint}>{hint}</T> : null}
    </View>
  </View>;
}

/** Percent ring: a track and an arc from 12 o'clock, with the value in the middle. */
function Ring({ percent, tone, size = 92, caption = "Overall" }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const value = Math.max(0, Math.min(100, percent));
  const angle = (value / 100) * 2 * Math.PI;
  const x = c + r * Math.sin(angle);
  const y = c - r * Math.cos(angle);
  const color = toneOf(tone).solid;
  const arc = value >= 99.95
    ? `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c - 0.01} ${c - r}`
    : `M ${c} ${c - r} A ${r} ${r} 0 ${value > 50 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
  return <View style={{ width: size, height: size, position: "relative" }}>
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={c} cy={c} r={r} fill="none" stroke={C.track} strokeWidth={stroke} />
      {value > 0 && <Path d={arc} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />}
    </Svg>
    <View style={{ position: "absolute", top: 0, left: 0, width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <T style={{ fontSize: size < 80 ? 16 : 21, fontWeight: 700, color: C.ink, lineHeight: 1 }}>{value}<T style={{ fontSize: size < 80 ? 8.5 : 11, fontWeight: 500, color: C.faint }}>%</T></T>
      <T style={{ marginTop: 3, fontSize: 6.5, fontWeight: 600, letterSpacing: 0.8, color: C.muted, textTransform: "uppercase" }}>{caption}</T>
    </View>
  </View>;
}

function Bars({ rows }) {
  return <View>
    {rows.map((row) => <View key={row.key} style={s.barRow} wrap={false}>
      <View style={s.barHead}>
        <T style={s.barName}>{row.name}</T>
        <T style={s.barValue}>{row.detail ? <T style={s.barDetail}>{row.detail}   </T> : null}{row.percent}%</T>
      </View>
      <View style={s.track}><View style={[s.fill, { width: `${row.percent}%` }]} /></View>
    </View>)}
  </View>;
}

function BarsCard({ icon, title, hint, rows }) {
  return <View style={s.card}>
    <CardHead icon={icon} title={title} hint={hint} />
    <Bars rows={rows} />
  </View>;
}

function ListCard({ icon, tone, title, items, bullet, empty }) {
  const t = toneOf(tone);
  return <View style={s.card}>
    <CardHead icon={icon} tone={tone} title={title} />
    {items.length ? items.map((text) => <View key={text} style={s.listItem} wrap={false}>
      <View style={[s.bullet, { backgroundColor: t.bg }]}><PdfIcon name={bullet} size={7.5} color={t.fg} strokeWidth={2.6} /></View>
      <T style={s.listText}>{text}</T>
    </View>) : <T style={[s.listText, { color: C.muted }]}>{empty}</T>}
  </View>;
}

const META_FLEX = { candidate: 1.3, date: 1.55, duration: 0.8, status: 0.95 };

function Meta({ model }) {
  return <View style={s.metaCard}>
    {model.meta.map((item, index) => <View key={item.key} style={[s.metaItem, { flex: META_FLEX[item.key] || 1 }, index ? s.metaDivider : null]}>
      <View style={{ marginTop: 0.5 }}><PdfIcon name={item.icon} size={10} color={item.tone && item.tone !== "positive" ? toneOf(item.tone).fg : C.brand700} /></View>
      <View style={{ flex: 1 }}>
        <T style={s.label}>{item.label}</T>
        <T style={s.metaValue}>{item.value}</T>
        {/* "GEU22CS041 · name@college.edu": one line each. */}
        {item.detail ? String(item.detail).split(" · ").map((line) => <T key={line} style={s.metaDetail}>{line}</T>) : null}
      </View>
    </View>)}
  </View>;
}

function Cover({ model, logo }) {
  return <View style={s.cover}>
    {/* Decoration: two soft brand circles on the right of the band. */}
    <Svg width={PAGE.width} height={220} style={{ position: "absolute", top: 0, left: 0 }}>
      <Circle cx={PAGE.width - 40} cy={10} r={120} fill={C.brand} fillOpacity={0.16} />
      <Circle cx={PAGE.width - 130} cy={190} r={70} fill={C.brand} fillOpacity={0.09} />
      <Rect x={0} y={0} width={PAGE.width} height={3} fill={C.brand} />
    </Svg>
    <View style={s.coverTop}>
      {logo ? <Image src={logo} style={{ width: 84, height: 26 }} /> : <T style={{ fontSize: 13, fontWeight: 700, color: C.white }}>PeerPrep</T>}
      <T style={s.coverLabel}>AI Interview Report</T>
    </View>
    <T style={s.coverTitle}>{model.title}</T>
    {model.chips.length > 0 && <View style={s.coverChips}>
      {model.chips.filter((chip) => chip.key !== "duration").map((chip) => <View key={chip.key} style={s.kind}>
        <PdfIcon name={chip.icon} size={7.5} color={C.coverText} />
        <T style={s.kindText}>{chip.label}</T>
      </View>)}
    </View>}
  </View>;
}

const bandToneOf = (value) => (value >= 85 ? "positive" : value >= 70 ? "brand" : value >= 50 ? "caution" : "critical");

function Bar({ percent, tone = "brand", compare = null, height = 4.5 }) {
  return <View style={[s.track, { height, borderRadius: height / 2, position: "relative", overflow: "visible" }]}>
    <View style={{ height, borderRadius: height / 2, width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: toneOf(tone).solid }} />
    {compare !== null && compare !== undefined && <View style={{ position: "absolute", top: -2, left: `${Math.max(0, Math.min(100, compare))}%`, width: 1.4, height: height + 4, marginLeft: -0.7, backgroundColor: SERIES.cohort }} />}
  </View>;
}

function SplitPill({ label, caption, value, cohort }) {
  if (value === null || value === undefined) return null;
  return <View style={s.pill}>
    <T style={s.label}>{label}</T>
    <T style={{ marginTop: 3, fontSize: 17, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>{value}<T style={{ fontSize: 9, fontWeight: 500, color: C.faint }}>%</T></T>
    <View style={{ marginTop: 5 }}><Bar percent={value} tone={bandToneOf(value)} compare={cohort} /></View>
    <T style={[s.smallMuted, { marginTop: 4 }]}>{caption}{cohort !== null && cohort !== undefined ? ` · Cohort ${cohort}%` : ""}</T>
  </View>;
}

function ScoreSummary({ model }) {
  const { score, split } = model;
  const text = model.narrative;
  if (!score && !text && !split) return null;
  return <View style={[s.block, s.card]} wrap={false}>
    <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
      {score && <View style={{ alignItems: "center", gap: 6 }}>
        <Ring percent={score.percent} tone={score.tone} />
        {score.band ? <Chip tone={score.tone} icon="award">{score.band}</Chip> : null}
        {score.marks && <T style={s.smallMuted}>{marks(score.marks.score)} / {marks(score.marks.max)} marks</T>}
      </View>}
      <View style={{ flex: 1 }}>
        <T style={s.label}>{text ? "Overall performance" : "Overall result"}</T>
        <T style={[s.summary, { fontSize: text ? 9.5 : 9 }]}>{text || score?.summary || ""}</T>
        {text && score?.summary ? <T style={[s.smallMuted, { marginTop: 5 }]}>{score.summary}</T> : null}
        {(model.partial || model.integrity || model.flags.length > 0) && <View style={[s.flags, { marginTop: 8 }]}>
          {model.partial && <Chip tone="caution" icon="triangleAlert">Ended early: saved responses only</Chip>}
          {model.integrity && <Chip tone={model.integrity.violations ? "caution" : "neutral"} icon={model.integrity.violations ? "shieldAlert" : "shieldCheck"}>
            Proctored · {model.integrity.violations ?? 0} violation{model.integrity.violations === 1 ? "" : "s"}
          </Chip>}
          {model.flags.map((flag) => <Chip key={flag.key} tone={flag.tone} icon="flag">{flag.label}</Chip>)}
        </View>}
      </View>
    </View>
    {split && <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
      <SplitPill label="Functional" caption="Technical correctness" value={split.functional} cohort={split.cohortFunctional} />
      <SplitPill label="Non-functional" caption="Articulation, fluency, confidence, professionalism" value={split.nonFunctional} cohort={split.cohortNonFunctional} />
    </View>}
  </View>;
}

function Kpis({ model }) {
  if (!model.kpis.length) return null;
  return <View style={[s.block, { flexDirection: "row", gap: 8 }]} wrap={false}>
    {model.kpis.map((kpi) => <View key={kpi.key} style={s.kpi}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <IconTile name={kpi.icon} size={15} />
        <T style={[s.label, { flex: 1 }]}>{kpi.label}</T>
      </View>
      <View>
        <T style={s.kpiValue}>{kpi.value}</T>
        {kpi.detail ? <T style={s.kpiDetail}>{kpi.detail}</T> : null}
      </View>
    </View>)}
  </View>;
}

function SuccessMetrics({ model }) {
  if (!model.metrics.length) return null;
  const cohort = model.metrics.some((metric) => metric.cohort !== null);
  return <View style={[s.block, s.card]} wrap={false}>
    <CardHead icon="target" title="Success metrics" hint={`Judged by ANVI from the transcript; fluency also uses the measured pace and fillers.${cohort ? " The orange tick is the cohort average." : ""}`} />
    {model.metrics.map((metric, index) => <View key={metric.key} style={[s.metricRow, index ? null : { borderTopWidth: 0, paddingTop: 0 }]} wrap={false}>
      <IconTile name={metric.icon} size={18} />
      <View style={{ flex: 1 }}>
        <View style={s.barHead}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <T style={[s.barName, { fontWeight: 600 }]}>{metric.label}</T>
            <Chip tone={metric.tone}>{metric.band}</Chip>
          </View>
          <T style={s.barValue}>{metric.percent}%{metric.cohort !== null ? <T style={s.barDetail}>   cohort {metric.cohort}%</T> : null}</T>
        </View>
        <Bar percent={metric.percent} tone={metric.tone} compare={metric.cohort} />
        <T style={[s.smallMuted, { marginTop: 3 }]}>{metric.definition}</T>
        {(metric.wentWell[0] || metric.improve[0]) && <View style={{ flexDirection: "row", gap: 10, marginTop: 3 }}>
          {metric.wentWell[0] && <T style={[s.metricNote, { color: toneOf("positive").fg }]}>+ {metric.wentWell[0].text}{metric.wentWell[0].question ? ` (${metric.wentWell[0].question})` : ""}</T>}
          {metric.improve[0] && <T style={[s.metricNote, { color: toneOf("caution").fg }]}>→ {metric.improve[0].text}{metric.improve[0].question ? ` (${metric.improve[0].question})` : ""}</T>}
        </View>}
      </View>
    </View>)}
  </View>;
}

function Skills({ skills }) {
  if (!skills.length) return null;
  return <View style={s.card}>
    <CardHead icon="star" tone="caution" title="Skills" hint="Rated from the answers on each skill (5 stars = 100%)." />
    {skills.map((skill, index) => <View key={skill.key} style={[s.skillRow, index ? { borderTopWidth: 0.5, borderTopColor: C.hairline } : null]} wrap={false}>
      <View style={{ flex: 1 }}>
        <T style={{ fontSize: 8.5, fontWeight: 600, color: C.ink }}>{skill.name}</T>
        {skill.note ? <T style={[s.smallMuted, { marginTop: 1 }]}>{skill.note}</T> : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <PdfStars value={skill.stars} />
        <T style={{ fontSize: 7.5, fontWeight: 600, color: C.ink }}>{skill.percent}%</T>
      </View>
    </View>)}
  </View>;
}

function Legend2({ items }) {
  return <View style={{ flexDirection: "row", gap: 10, marginBottom: 6 }}>
    {items.map(([label, color, dashed]) => <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Svg width={14} height={6}><Line x1={1} y1={3} x2={13} y2={3} stroke={color} strokeWidth={1.6} strokeDasharray={dashed ? "3 2" : undefined} /></Svg>
      <T style={s.smallMuted}>{label}</T>
    </View>)}
  </View>;
}

function Analysis({ model }) {
  const { dimensionRadar, skillRadar, questions, cohortPercent } = model.analysis;
  if (!dimensionRadar && !skillRadar && !questions.length) return null;
  const both = dimensionRadar && skillRadar;
  return <View break>
    <T style={s.sectionTitle}>Analysis</T>
    <T style={[s.hint, { marginBottom: 6 }]}>Charts drawn from the stored evaluation of this attempt.</T>
    {(dimensionRadar || skillRadar) && <View style={[s.row, { marginTop: 8 }]} wrap={false}>
      {dimensionRadar && <View style={[s.card, s.col]}>
        <CardHead icon="radar" title="Success metrics" />
        <Legend2 items={[["Your score", SERIES.you], ...(dimensionRadar.cohort ? [[`Cohort average · ${dimensionRadar.cohortCount} students`, SERIES.cohort, true]] : [])]} />
        <PdfRadar rows={dimensionRadar.rows} cohort={dimensionRadar.cohort} size={both ? 118 : 150} labelWidth={both ? 58 : 80} />
      </View>}
      {skillRadar && <View style={[s.card, s.col]}>
        <CardHead icon={skillRadar.title === "Skills" ? "star" : "target"} tone={skillRadar.title === "Skills" ? "caution" : "brand"} title={skillRadar.title} />
        <Legend2 items={[["Your score", SERIES.you]]} />
        <PdfRadar rows={skillRadar.rows} size={both ? 118 : 150} labelWidth={both ? 58 : 80} />
      </View>}
    </View>}
    {questions.length > 0 && <View style={[s.block, s.card]} wrap={false}>
      <CardHead icon="barChart" title="Question-wise scores" hint="Overall result and each question, coloured by band." />
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 6 }}>
        {["Excellent", "Good", "Fair", "Needs work"].filter((band) => questions.some((row) => row.band === band)).map((band) => <View key={band} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <View style={{ width: 6, height: 6, borderRadius: 1.5, backgroundColor: toneOf(questions.find((row) => row.band === band).tone).solid }} /><T style={s.smallMuted}>{band}</T>
        </View>)}
        {cohortPercent !== null && <Legend2 items={[[`Cohort average ${cohortPercent}%`, SERIES.cohort, true]]} />}
      </View>
      <PdfQuestionBars rows={questions} cohort={cohortPercent} width={PAGE.width - PAGE.side * 2 - 30} />
    </View>}
  </View>;
}

function Stat({ icon, label, value, chip }) {
  return <View style={s.stat}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><PdfIcon name={icon} size={7.5} color={C.muted} /><T style={s.label}>{label}</T></View>
    <T style={{ marginTop: 3, fontSize: 10.5, fontWeight: 700, color: C.ink }}>{value}</T>
    {chip ? <View style={{ marginTop: 3 }}><Chip tone={chip.tone}>{chip.label}</Chip></View> : null}
  </View>;
}

function QuestionSection({ response, student, total, first = false }) {
  const meta = [response.section, response.competency].filter(Boolean).join(" · ");
  const stats = [
    response.time && { key: "time", icon: "hourglass", label: "Time spent", value: response.time },
    response.wpm && { key: "pace", icon: "gauge", label: "Pace", value: `${response.wpm} wpm`, chip: response.pace },
    response.fillers !== null && { key: "fillers", icon: "messageCircle", label: "Fillers", value: `${response.fillers}${response.fillerRate !== null ? ` (${response.fillerRate}/100)` : ""}` },
    response.words && { key: "words", icon: "textAlignStart", label: "Length", value: `${response.words} words` },
  ].filter(Boolean);
  const hasSplit = response.functional !== null || response.nonFunctional !== null;
  return <View break={!first} style={s.question2}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} minPresenceAhead={80}>
      <View style={s.qBadge}><T style={s.qBadgeText}>{response.label}</T></View>
      <T style={[s.eyebrow, { flex: 1 }]}>{[`Question ${response.n} of ${total}`, meta].filter(Boolean).join(" · ")}</T>
      {!response.answered && <Chip tone="neutral">{response.statusLabel}</Chip>}
    </View>
    <T style={[s.question, { fontSize: 12, marginTop: 7 }]}>{response.question}</T>
    {response.flags.length > 0 && <View style={s.flags}>{response.flags.map((flag) => <Chip key={flag.key} tone={flag.tone} icon={flag.tone === "critical" ? "triangleAlert" : "flag"}>{flag.label}</Chip>)}</View>}
    {(response.percent !== null || hasSplit || stats.length > 0) && <View style={[s.row, { marginTop: 12, alignItems: "stretch" }]} wrap={false}>
      {response.percent !== null && <View style={[s.card, { alignItems: "center", gap: 5, paddingVertical: 10, width: 112 }]}>
        <Ring percent={response.percent} tone={response.tone} size={70} caption="Score" />
        {response.band ? <Chip tone={response.tone}>{response.band}</Chip> : null}
        {response.marks && <T style={s.smallMuted}>{marks(response.marks.score)} / {marks(response.marks.max)} marks</T>}
      </View>}
      <View style={{ flex: 1, gap: 8 }}>
        {hasSplit && <View style={[s.card, { flexDirection: "row", gap: 14, paddingVertical: 10 }]}>
          {response.functional !== null && <View style={{ flex: 1 }}><View style={s.barHead}><T style={s.barName}>Functional</T><T style={s.barValue}>{response.functional}%</T></View><Bar percent={response.functional} tone={bandToneOf(response.functional)} /></View>}
          {response.nonFunctional !== null && <View style={{ flex: 1 }}><View style={s.barHead}><T style={s.barName}>Non-functional</T><T style={s.barValue}>{response.nonFunctional}%</T></View><Bar percent={response.nonFunctional} tone={bandToneOf(response.nonFunctional)} /></View>}
        </View>}
        {stats.length > 0 && <View style={{ flexDirection: "row", gap: 6 }}>{stats.map(({ key, ...stat }) => <Stat key={key} {...stat} />)}</View>}
      </View>
    </View>}
    {response.dimensions.length > 0 && <View style={{ marginTop: 10 }} wrap={false}>
      <View style={s.subLabel}><PdfIcon name="target" size={8} color={C.muted} /><T style={s.label}>Success metrics for this answer</T></View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 6 }}>
        {response.dimensions.map((dimension) => <View key={dimension.key} style={{ width: "47%" }}>
          <View style={s.barHead}><T style={s.barName}>{dimension.label}</T><T style={s.barValue}>{dimension.percent}%</T></View>
          <Bar percent={dimension.percent} tone={dimension.tone} height={3.5} />
        </View>)}
      </View>
    </View>}
    <View style={s.subLabel}><PdfIcon name="messageSquareText" size={8} color={C.muted} /><T style={s.label}>{student ? "Your answer" : "Answer"} · transcript</T></View>
    {response.answered ? <T style={s.answer}>{response.answer}</T> : <T style={s.answerMissing}>{response.statusLabel}</T>}
    {response.keyPoints.length > 0 && <>
      <View style={[s.subLabel, { justifyContent: "space-between" }]} minPresenceAhead={30}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><PdfIcon name="listChecks" size={8} color={C.muted} /><T style={s.label}>Key points</T></View>
        <T style={s.smallMuted}>{response.keyPointCounts.matched} covered · {response.keyPointCounts.partial} partly · {response.keyPointCounts.missed} missed</T>
      </View>
      <View style={s.points}>
        {response.keyPoints.map((point) => {
          const t = VERDICT_TONE[point.verdict] || VERDICT_TONE.missed;
          return <View key={point.text} style={[s.point, { backgroundColor: t.bg, borderColor: t.border }]}>
            <VerdictDot verdict={point.verdict} />
            <T style={[s.pointText, { color: C.ink }]}>{point.text}</T>
          </View>;
        })}
      </View>
    </>}
    {response.feedback ? <View style={s.feedback} wrap={false}>
      <View style={s.feedbackLabel}><PdfIcon name="sparkles" size={8} color={C.brand700} /><T style={{ fontSize: 7.5, fontWeight: 600, color: C.brand700 }}>ANVI feedback</T></View>
      <T style={{ fontSize: 9, lineHeight: 1.5, color: C.body }}>{response.feedback}</T>
    </View> : null}
    {(response.strengths.length > 0 || response.improvements.length > 0) && <View style={[s.row, { marginTop: 10 }]} wrap={false}>
      {[["What went well", response.strengths, "positive", "check"], ["Areas of improvement", response.improvements, "caution", "trendingUp"]].map(([title, items, tone, icon]) => <View key={title} style={s.col}>
        <T style={[s.label, { color: toneOf(tone).fg, marginBottom: 4 }]}>{title}</T>
        {items.length ? items.map((text) => <View key={text} style={s.listItem}>
          <View style={[s.bullet, { backgroundColor: toneOf(tone).bg }]}><PdfIcon name={icon} size={7} color={toneOf(tone).fg} strokeWidth={2.6} /></View>
          <T style={[s.listText, { fontSize: 8.5 }]}>{text}</T>
        </View>) : <T style={s.smallMuted}>Nothing specific was noted.</T>}
      </View>)}
    </View>}
    {response.expectedAnswer ? <View wrap={false}>
      <View style={s.subLabel}><PdfIcon name="fileText" size={8} color={C.muted} /><T style={s.label}>Expected answer (admin copy)</T></View>
      <T style={s.answer}>{response.expectedAnswer}</T>
    </View> : null}
  </View>;
}

function VerdictDot({ verdict }) {
  const t = VERDICT_TONE[verdict] || VERDICT_TONE.missed;
  return <View style={[s.pointDot, { backgroundColor: t.solid }]}><PdfIcon name={VERDICTS[verdict]?.icon || "x"} size={6.5} color={C.white} strokeWidth={3.4} /></View>;
}

function Legend() {
  return <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
    {Object.entries(VERDICTS).map(([key, verdict]) => <View key={key} style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
      <VerdictDot verdict={key} /><T style={s.smallMuted}>{verdict.label}</T>
    </View>)}
  </View>;
}

function CountRow({ entries }) {
  return <View style={s.counts}>
    {entries.map(([label, value, warn]) => {
      const flagged = warn && Number(value) > 0;
      return <View key={label} style={[s.count, flagged ? { backgroundColor: toneOf("caution").bg, borderColor: toneOf("caution").border } : null]}>
        <T style={[s.smallMuted, { fontSize: 7 }]}>{label}</T>
        <T style={[s.countValue, flagged ? { color: toneOf("caution").fg } : null]}>{value}</T>
      </View>;
    })}
  </View>;
}

function Table({ columns, rows }) {
  return <View style={s.table}>
    <View style={s.tableHead}>{columns.map(([label, width]) => <T key={label} style={[s.label, { width }]}>{label}</T>)}</View>
    {rows.map((row, index) => <View key={index} style={s.tableRow} wrap={false}>
      {row.map((cell, cellIndex) => <T key={cellIndex} style={[s.tableCell, { width: columns[cellIndex][1] }]}>{cell}</T>)}
    </View>)}
  </View>;
}

function Integrity({ integrity, full }) {
  const { counts, blocked, blockedTotal, events, pauses, violations, maxViolations, onLimit, limitReached, endedForViolations, settings, ai } = integrity;
  const rules = full ? proctoringRules(settings) : [];
  const browserEvents = events ? events.filter((event) => !isAiDetection(event.type)) : null;
  const note = (tone, text) => <View style={[s.note, { backgroundColor: toneOf(tone).bg, borderColor: toneOf(tone).border }]}>
    <PdfIcon name="shieldAlert" size={9} color={toneOf(tone).fg} /><T style={{ flex: 1, fontSize: 8.5, fontWeight: 500, color: toneOf(tone).fg }}>{text}</T>
  </View>;
  return <View style={s.card} wrap={full}>
    <CardHead icon={violations ? "shieldAlert" : "shieldCheck"} tone={violations ? "caution" : "brand"} title="Integrity"
      hint={full ? "Browser and camera monitoring during the interview. Review alongside the answers." : "What was recorded during this proctored interview."} />
    {endedForViolations && note("critical", "The interview was ended because the violation limit was reached.")}
    {!endedForViolations && limitReached && maxViolations > 0 && note("caution", `The violation limit was reached${onLimit === "flag" ? "; the interview continued and this report is flagged." : "."}`)}
    <View style={[s.subLabel, { marginTop: 0 }]}><PdfIcon name="shieldAlert" size={8} color={C.muted} /><T style={s.label}>Violations</T></View>
    <CountRow entries={[[maxViolations ? `Total (limit ${maxViolations})` : "Total", violations ?? "—", true], ...PROCTOR_COUNTS.map(({ key, label }) => [label, counts[key] ?? 0])]} />
    {(blockedTotal > 0 || settings?.blockRightClick || settings?.blockCopyPaste || settings?.blockShortcuts) && <View style={{ marginTop: 10 }}>
      <View style={[s.subLabel, { marginTop: 0 }]}><PdfIcon name="lock" size={8} color={C.muted} /><T style={s.label}>Blocked actions · not counted as violations</T></View>
      <CountRow entries={BLOCKED_COUNTS.map(({ key, label }) => [label, blocked?.[key] ?? 0])} />
    </View>}
    {ai && <View style={{ marginTop: 10 }} wrap={false}>
      <View style={[s.subLabel, { marginTop: 0 }]}><PdfIcon name="scanEye" size={8} color={C.muted} /><T style={s.label}>Camera AI checks · {ai.total} detection{ai.total === 1 ? "" : "s"} · no video is recorded</T></View>
      <CountRow entries={AI_COUNTS.map(({ key, label }) => [label, ai.counts[key] ?? 0, true])} />
    </View>}
    {full && rules.length > 0 && <View style={{ marginTop: 10 }}>
      <View style={[s.subLabel, { marginTop: 0 }]}><PdfIcon name="listChecks" size={8} color={C.muted} /><T style={s.label}>Rules{maxViolations ? ` · at the limit: ${ON_LIMIT_LABELS[onLimit]}` : ""}</T></View>
      <View style={[s.flags, { marginTop: 0 }]}>{rules.map((rule) => <T key={rule} style={s.rule}>{rule}</T>)}</View>
    </View>}
    {full && pauses && pauses.length > 0 && <View style={{ marginTop: 10 }}>
      <View style={[s.subLabel, { marginTop: 0 }]}><PdfIcon name="circlePause" size={8} color={C.muted} /><T style={s.label}>Pauses · {pauses.length} · {secondsLabel(pauses.reduce((sum, pause) => sum + (pause.seconds || 0), 0))} in total</T></View>
      <Table columns={[["From (IST)", "30%"], ["To", "30%"], ["Length", "20%"], ["Reason", "20%"]]}
        rows={pauses.map((pause) => [istClock(pause.from) || "—", pause.to ? istClock(pause.to) : "Not resumed", pause.seconds !== null ? secondsLabel(pause.seconds) : "—", pause.reason ? proctorEventLabel(pause.reason) : "—"])} />
    </View>}
    {full && ai?.events?.length > 0 && <View style={{ marginTop: 10 }}>
      <View style={[s.subLabel, { marginTop: 0 }]}><PdfIcon name="scanEye" size={8} color={C.muted} /><T style={s.label}>Camera detections</T></View>
      <Table columns={[["Time (IST)", "22%"], ["Detection", "40%"], ["Severity", "18%"], ["Confidence", "20%"]]}
        rows={ai.events.map((event) => [istClock(event.at) || "—", proctorEventLabel(event.type), event.severity ? event.severity.charAt(0).toUpperCase() + event.severity.slice(1) : "—", confidenceLabel(event.confidence) || "—"])} />
    </View>}
    {full && browserEvents && browserEvents.length > 0 && <View style={{ marginTop: 10 }}>
      <View style={[s.subLabel, { marginTop: 0 }]} minPresenceAhead={40}><PdfIcon name="clock" size={8} color={C.muted} /><T style={s.label}>Browser event timeline</T></View>
      <Table columns={[["Time (IST)", "22%"], ["Event", "58%"], ["Type", "20%"]]}
        rows={browserEvents.map((event) => {
          const kind = PROCTOR_EVENTS[event.type];
          return [istClock(event.at) || "—", proctorEventLabel(event.type), kind?.violation ? "Violation" : kind?.blocked ? "Blocked" : "Info"];
        })} />
    </View>}
    <T style={[s.smallMuted, { marginTop: 9 }]}>Scores are never reduced automatically because of these events.</T>
  </View>;
}

function Setup({ model }) {
  if (!model.setup.length && !model.warmup) return null;
  return <View style={s.card} wrap={false}>
    <CardHead icon="fileText" tone="neutral" title="Interview setup" />
    <View style={{ flexDirection: "row", gap: 12 }}>
      {model.setup.map((row) => <View key={row.key} style={{ flex: 1 }}>
        <T style={s.label}>{row.label}</T>
        <T style={s.metaValue}>{row.value}</T>
      </View>)}
    </View>
    {model.warmup ? <>
      <View style={s.subLabel}><PdfIcon name="messageCircle" size={8} color={C.muted} /><T style={s.label}>Warm-up conversation (not scored)</T></View>
      <T style={[s.answer, { fontSize: 8 }]}>{model.warmup}</T>
    </> : null}
  </View>;
}

/** The report document. `logo`: { light, dark } image sources (URL or file path). */
export function ReportPdfDocument({ model, logo = {} }) {
  const student = model.audience === "student";
  const candidate = model.candidate?.name || "";
  const showCompetencies = model.competencies.length > 0 && !model.skills.length;
  return <Document title={`ANVI interview report${candidate ? ` · ${candidate}` : ""} · ${model.title}`} author="PeerPrep ANVI" subject="AI interview report"
    creator="PeerPrep" producer="PeerPrep ANVI" language="en">
    <Page size="A4" style={s.page}>
      {/* Running header on every page; on page 1 the cover band (drawn after it) covers it. Images cannot
          sit inside a `render` callback (they would never load), so the header is static. */}
      <View fixed style={s.runHead}>
        {logo.light ? <Image src={logo.light} style={{ width: 58, height: 18 }} /> : <T style={{ fontSize: 9, fontWeight: 700, color: C.ink }}>PeerPrep</T>}
        <T style={s.runHeadText}>AI Interview Report{candidate ? ` · ${candidate}` : ""} · {model.title}</T>
      </View>
      {/* The page number is its own fixed node: a `render` child would make react-pdf redraw the whole footer
          as dynamic content, which drops the static text beside it. */}
      <View fixed style={s.runFoot}>
        <PdfIcon name="sparkles" size={7.5} color={C.brand} /><T style={s.runFootText}>{model.footer}</T>
      </View>
      <T fixed style={s.pageNumber} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />

      <Cover model={model} logo={logo.dark} />
      <Meta model={model} />
      <ScoreSummary model={model} />
      <Kpis model={model} />
      {/* Strengths fill page 1 under the key figures; the success metrics card is kept whole (wrap={false}). */}
      {(model.strengths.length > 0 || model.improvements.length > 0) && <View style={[s.block, s.row]} wrap={false}>
        <View style={s.col}><ListCard icon="circleCheck" tone="positive" title="Strengths" items={model.strengths} bullet="check" empty="No particular strengths were noted." /></View>
        <View style={s.col}><ListCard icon="lightbulb" tone="caution" title="Areas to improve" items={model.improvements} bullet="trendingUp" empty="Nothing major to improve." /></View>
      </View>}
      <SuccessMetrics model={model} />
      {(model.skills.length > 0 || showCompetencies || model.sections.length > 0) && <View style={[s.block, s.row]} wrap={false}>
        {model.skills.length > 0 && <View style={s.col}><Skills skills={model.skills} /></View>}
        {showCompetencies && <View style={s.col}><BarsCard icon="target" title="Competencies" hint="How well the answers covered the expected points." rows={model.competencies} /></View>}
        {model.sections.length > 0 && <View style={s.col}><BarsCard icon="barChart" title="Section scores" hint="Marks earned out of each section's maximum." rows={model.sections} /></View>}
      </View>}
      {model.criteria.length > 0 && <View style={s.block} wrap={false}><BarsCard icon="award" title="Evaluation criteria" hint="Average level reached on each rubric criterion." rows={model.criteria} /></View>}

      <Analysis model={model} />

      {model.responses.length > 0 && <View break style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View>
          <T style={s.sectionTitle}>Question-wise feedback</T>
          <T style={s.hint}>{`${model.responses.length} question${model.responses.length === 1 ? "" : "s"}, in the order they were asked. Each starts on its own page.`}</T>
        </View>
        {model.responses.some((response) => response.keyPoints.length) && <Legend />}
      </View>}
      {model.keyPointsWithheld && <View style={[s.note, { marginTop: 10, backgroundColor: C.brand50, borderColor: C.brand100 }]}>
        <PdfIcon name="lock" size={9} color={C.brand700} /><T style={{ flex: 1, fontSize: 8.5, color: C.brand700 }}>Some interview content is still in use by a scheduled interview, so the key points appear after the schedule ends.</T>
      </View>}
      {model.responses.length > 0 && <View style={{ marginTop: 12 }}>
        {model.responses.map((response, index) => <QuestionSection key={response.key} response={response} student={student} total={model.responses.length} first={index === 0} />)}
      </View>}

      <View break>
        {model.actions.length > 0 && <View style={s.card} wrap={false}>
          <CardHead icon="listTodo" title="Action plan" hint={student ? "Work through these, then take the interview again." : "What the candidate should practise next."} />
          {model.actions.map((text, index) => <View key={text} style={[s.listItem, { marginBottom: 8 }]}>
            <View style={s.step}><T style={s.stepText}>{index + 1}</T></View>
            <T style={s.listText}>{text}</T>
          </View>)}
        </View>}
        {model.integrity && <View style={{ marginTop: model.actions.length ? 14 : 0 }}><Integrity integrity={model.integrity} full={model.integrityFull} /></View>}
        <View style={{ marginTop: 14 }}><Setup model={model} /></View>
        <View style={s.disclaimer} wrap={false}>
          <PdfIcon name="sparkles" size={11} color={C.brand} />
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 8.5, fontWeight: 600, color: C.ink }}>About this report</T>
            <T style={{ marginTop: 2, fontSize: 8, lineHeight: 1.5, color: C.muted }}>{model.disclaimer}{model.scoredAt ? ` Scored ${model.scoredAt}.` : ""}</T>
          </View>
        </View>
      </View>
    </Page>
  </Document>;
}

