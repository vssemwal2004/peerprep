import {
  Activity, AlertCircle, AlignLeft, AudioWaveform, Award, BadgeCheck, BarChart3, BookOpen, BriefcaseBusiness, Building2, Calendar, Check, CheckCircle2,
  ChevronLeft, ChevronRight, ClipboardList, Clock, FileText, Flag, Gauge, Handshake, Hourglass, Info, Layers, Lightbulb, ListChecks, ListTodo, Lock,
  MessageCircle, MessageSquareText, MessagesSquare, Minus, PauseCircle, Radar, ScanEye, ShieldAlert, ShieldCheck, Signal, Sparkles, Star, Target, Timer,
  TrendingUp, TriangleAlert, User, X,
} from "lucide-react";
import logoLight from "./assets/peerprep-logo-light.png";
import logoDark from "./assets/peerprep-logo-dark.png";
import { VERDICTS } from "./reportModel";
import { VERDICT_CHIPS, VERDICT_ICON_TONES, cardTitle, muted, reportCard, toneClasses } from "./styles";

// Screen building blocks of the ANVI report. Icon keys are the lucide names the content model and the
// PDF (pdf/icons.js) share, so a block shows the same icon on screen and on paper.
const ICONS = {
  activity: Activity, audioWaveform: AudioWaveform, award: Award, badgeCheck: BadgeCheck, barChart: BarChart3, bookOpen: BookOpen, briefcaseBusiness: BriefcaseBusiness,
  building2: Building2, calendar: Calendar, check: Check, chevronLeft: ChevronLeft, chevronRight: ChevronRight, circleAlert: AlertCircle, circleCheck: CheckCircle2,
  clipboardList: ClipboardList, clock: Clock, fileText: FileText, flag: Flag, gauge: Gauge, handshake: Handshake, hourglass: Hourglass, info: Info, layers: Layers,
  lightbulb: Lightbulb, listChecks: ListChecks, listTodo: ListTodo, lock: Lock, messageCircle: MessageCircle, messageSquareText: MessageSquareText,
  messagesSquare: MessagesSquare, minus: Minus, circlePause: PauseCircle, radar: Radar, scanEye: ScanEye, shieldAlert: ShieldAlert, shieldCheck: ShieldCheck,
  signal: Signal, sparkles: Sparkles, star: Star, target: Target, textAlignStart: AlignLeft, timer: Timer, trendingUp: TrendingUp, triangleAlert: TriangleAlert,
  user: User, x: X,
};
export function Icon({ name, className = "h-4 w-4", ...rest }) {
  const Component = ICONS[name] || Info;
  return <Component className={className} aria-hidden="true" strokeWidth={2} {...rest} />;
}

/** 0-5 stars in half steps, drawn as filled, half and empty outlines. */
export function Stars({ value = 0, size = "h-4 w-4", label }) {
  const stars = Math.max(0, Math.min(5, Math.round((Number(value) || 0) * 2) / 2));
  return <span role="img" aria-label={label || `${stars} out of 5 stars`} className="inline-flex items-center gap-0.5" data-stars={stars}>
    {Array.from({ length: 5 }, (_, index) => {
      const fill = Math.max(0, Math.min(1, stars - index));
      return <span key={index} className={`relative inline-flex ${size}`} aria-hidden="true">
        <Star className={`${size} text-slate-200 dark:text-white/15`} fill="currentColor" strokeWidth={0} />
        {fill > 0 && <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
          <Star className={`${size} text-amber-400 dark:text-amber-300`} fill="currentColor" strokeWidth={0} />
        </span>}
      </span>;
    })}
  </span>;
}

/** A thin 0-100 bar in a tone, with an optional comparison tick (the cohort average). */
export function Meter({ percent, tone = "brand", compare = null, height = "h-2", className = "" }) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  return <div className={`relative ${height} rounded-full bg-slate-100 dark:bg-white/[0.08] ${className}`} aria-hidden="true">
    <div className={`h-full rounded-full ${toneClasses(tone).bar} transition-[width] duration-700 motion-reduce:transition-none`} style={{ width: `${value}%` }} />
    {compare !== null && compare !== undefined && <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-orange-600 dark:bg-orange-500" style={{ left: `calc(${Math.max(0, Math.min(100, compare))}% - 1px)` }} />}
  </div>;
}

/** The PeerPrep wordmark, light or dark to match the theme. */
export function PeerPrepLogo({ className = "h-7 w-auto" }) {
  return <span className="inline-flex shrink-0" data-report-logo>
    <img src={logoLight} alt="PeerPrep" className={`${className} dark:hidden`} width="321" height="99" />
    <img src={logoDark} alt="" aria-hidden="true" className={`${className} hidden dark:block`} width="321" height="99" />
  </span>;
}

export function AiDisclaimer({ className = "" }) {
  return <p className={`inline-flex items-center gap-1.5 text-xs ${muted} ${className}`}>
    <Sparkles className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />AI-generated — may contain mistakes.
  </p>;
}

/** Percent ring in the band's tone, with the percent in the centre. */
export function ScoreRing({ percent = 0, band = "", tone = "brand", size = 132, caption = "Overall", label }) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const small = size < 110;
  return <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label || `Score ${value} percent${band ? `, ${band}` : ""}`}>
    <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
      <circle cx="60" cy="60" r={radius} fill="none" strokeWidth={small ? 10 : 9} className="stroke-slate-100 dark:stroke-white/[0.08]" />
      <circle cx="60" cy="60" r={radius} fill="none" strokeWidth={small ? 10 : 9} strokeLinecap="round" stroke="currentColor"
        className={`${toneClasses(tone).ring} transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none`}
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} />
    </svg>
    <span className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
      <span className={`${small ? "text-[22px]" : "text-[32px]"} font-semibold leading-none tracking-[-0.03em] tabular-nums text-slate-900 dark:text-zinc-50`}>{value}<span className={`${small ? "text-sm" : "text-lg"} font-medium text-slate-400 dark:text-zinc-500`}>%</span></span>
      {caption && <span className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${muted}`}>{caption}</span>}
    </span>
  </div>;
}

export function Chip({ tone = "neutral", icon, children, className = "" }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${toneClasses(tone).chip} ${className}`}>
    {icon && <Icon name={icon} className="h-3.5 w-3.5" />}{children}
  </span>;
}

export function BandChip({ band, tone }) {
  if (!band) return null;
  return <Chip tone={tone || "brand"} icon="award">{band}</Chip>;
}

/** A rounded icon square used by card headers and KPI tiles. */
export function IconTile({ name, tone = "brand", size = "md" }) {
  const box = size === "sm" ? "h-7 w-7 rounded-lg" : "h-9 w-9 rounded-[10px]";
  return <span className={`inline-flex shrink-0 items-center justify-center ${box} ${toneClasses(tone).tile}`} aria-hidden="true">
    <Icon name={name} className={size === "sm" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
  </span>;
}

/** Card heading: icon tile, title and an optional one-line hint. */
export function CardHeader({ id, icon, tone = "brand", title, hint, aside }) {
  return <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div className="flex min-w-[min(100%,13rem)] flex-1 items-start gap-3">
      {icon && <IconTile name={icon} tone={tone} />}
      <div className="min-w-0">
        <h3 id={id} className={`${cardTitle} leading-9`}>{title}</h3>
        {hint && <p className={`-mt-1 text-xs leading-5 ${muted}`}>{hint}</p>}
      </div>
    </div>
    {aside}
  </div>;
}

export function KeyPoint({ text, verdict }) {
  const style = VERDICTS[verdict] || VERDICTS.missed;
  return <li className={`inline-flex max-w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] leading-5 ${VERDICT_CHIPS[verdict] || VERDICT_CHIPS.missed}`}>
    <span aria-hidden="true" data-verdict-symbol={style.symbol} className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${VERDICT_ICON_TONES[verdict] || VERDICT_ICON_TONES.missed}`}>
      <Icon name={style.icon} className="h-3 w-3" strokeWidth={3} />
    </span>
    <span className="sr-only">{style.label}: </span><span className="min-w-0 break-words">{text}</span>
  </li>;
}

export function VerdictLegend() {
  return <ul className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-xs ${muted}`} aria-label="Key point legend">
    {Object.entries(VERDICTS).map(([key, style]) => <li key={key} className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${VERDICT_ICON_TONES[key]}`}><Icon name={style.icon} className="h-3 w-3" strokeWidth={3} /></span>{style.label}
    </li>)}
  </ul>;
}

/** Horizontal 0-100 bars in the brand colour. rows: { key, name, percent, detail? }. */
export function MeterList({ rows, label }) {
  return <ul className="space-y-4" aria-label={label}>
    {rows.map((row) => <li key={row.key || row.name}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium text-slate-800 dark:text-zinc-100" title={row.name}>{row.name}</span>
        <span className="shrink-0 tabular-nums">
          {row.detail ? <span className={`mr-2 text-xs ${muted}`}>{row.detail}</span> : null}
          <span className="font-semibold text-slate-900 dark:text-zinc-50">{row.percent}%</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.08]" aria-hidden="true">
        <div className="h-full rounded-full bg-sky-500 transition-[width] duration-700 motion-reduce:transition-none dark:bg-sky-400" style={{ width: `${row.percent}%` }} />
      </div>
    </li>)}
  </ul>;
}

/** A titled list card (strengths, areas to improve). */
export function Bullets({ id, title, items, icon, tone, bullet, empty }) {
  return <section className={reportCard} aria-labelledby={id}>
    <CardHeader id={id} icon={icon} tone={tone} title={title} />
    {items?.length ? <ul className="space-y-3 text-sm leading-6">
      {items.map((text) => <li key={text} className="flex gap-3 text-slate-700 dark:text-zinc-200">
        <span className={`mt-[3px] inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${toneClasses(tone).tile}`} aria-hidden="true"><Icon name={bullet} className="h-3 w-3" strokeWidth={2.5} /></span>
        <span className="min-w-0">{text}</span>
      </li>)}
    </ul> : <p className={`text-sm ${muted}`}>{empty}</p>}
  </section>;
}

export function FlagChip({ tone = "caution", children }) {
  return <Chip tone={tone} icon={tone === "critical" ? "triangleAlert" : "flag"} className="text-[11px]">{children}</Chip>;
}

/** Label / value pair with an icon, used by the cover meta and the setup card. */
export function MetaItem({ icon, label, value, detail, tone }) {
  return <div className="flex min-w-0 items-start gap-3">
    <IconTile name={icon} tone={tone && tone !== "positive" ? tone : "neutral"} size="sm" />
    <div className="min-w-0">
      <dt className={`text-xs ${muted}`}>{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere] dark:text-zinc-50">{value}</dd>
      {detail && <dd className={`mt-0.5 text-xs ${muted} [overflow-wrap:anywhere]`}>{detail}</dd>}
    </div>
  </div>;
}
