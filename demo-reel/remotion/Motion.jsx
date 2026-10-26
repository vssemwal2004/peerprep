// Motion-graphic scenes: problem, vision, architecture, business model, scale + close.
// Timings (seconds) follow the voice-over blocks in script/voiceover.md.
import { AbsoluteFill, Img, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, MONO } from "./theme.js";
import { Backdrop, BrowserFrame } from "./ScreenScene.jsx";

const useClock = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = (at, damping = 200) => spring({ frame: frame - at * fps, fps, config: { damping } });
  const fade = (from, to, a = 0, b = 1) => interpolate(frame / fps, [from, to], [a, b], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return { t: frame / fps, pop, fade };
};

const ICONS = {
  code: ["M16 18l6-6-6-6", "M8 6l-6 6 6 6"],
  test: ["M9 2h6v4H9z", "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2", "M9 14l2 2 4-4"],
  mic: ["M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z", "M19 10v2a7 7 0 0 1-14 0v-2", "M12 19v3"],
  eyeOff: ["M9.9 9.9a3 3 0 1 0 4.2 4.2", "M10.7 5.1A10 10 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-1.7 2.7", "M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6", "M2 2l20 20"],
  db: ["M3 5a9 3 0 1 0 18 0a9 3 0 1 0-18 0", "M3 5v14a9 3 0 0 0 18 0V5", "M3 12a9 3 0 0 0 18 0"],
  coins: ["M2 8a6 6 0 1 0 12 0a6 6 0 1 0-12 0", "M18.1 10.4A6 6 0 1 1 10.3 18", "M7 6h1v4", "M16.7 13.9l.7.7-2.8 2.8"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M5 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0", "M22 21v-2a4 4 0 0 0-3-3.9", "M16 3.1a4 4 0 0 1 0 7.8"],
  shield: ["M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z", "M9 12l2 2 4-4"],
  server: ["M4 2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z", "M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z", "M6 6h.01", "M6 18h.01"],
  spark: ["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z", "M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z"],
  chart: ["M12 20V10", "M18 20V4", "M6 20v-4"],
  alert: ["M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20", "M12 8v4", "M12 16h.01"],
  monitor: ["M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M8 21h8", "M12 17v4"],
  queue: ["M3 6h18", "M3 12h18", "M3 18h12"],
  layers: ["M12 2l10 5-10 5L2 7z", "M2 17l10 5 10-5", "M2 12l10 5 10-5"],
};
const Icon = ({ name, size = 28, color = C.brandDeep, stroke = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    {ICONS[name].map((d) => <path key={d} d={d} />)}
  </svg>
);

const Eyebrow = ({ children, color = C.brandDeep, style }) => (
  <div style={{ fontSize: 18, letterSpacing: 3, fontWeight: 700, color, textTransform: "uppercase", ...style }}>{children}</div>
);
const Card = ({ children, style }) => (
  <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 22, boxShadow: "0 30px 60px -32px rgba(15,23,42,.35)", ...style }}>{children}</div>
);
const Wordmark = ({ size = 120, style }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.22, ...style }}>
    <Img src={staticFile("brand/peerprep-mark.png")} style={{ width: size * 0.95, height: size * 0.95 }} />
    <span style={{ fontSize: size * 0.82, fontWeight: 800, letterSpacing: -size * 0.02, lineHeight: 1 }}>
      <span style={{ color: C.brand }}>Peer</span><span style={{ color: C.graphite }}>Prep</span>
    </span>
  </div>
);
const IconBadge = ({ name, color = C.brandDeep, bg = C.sky100, size = 64 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.3, background: bg, display: "grid", placeItems: "center" }}>
    <Icon name={name} size={size * 0.5} color={color} />
  </div>
);

/* 01 · The problem ------------------------------------------------------- */
export const ProblemScene = () => {
  const { t, pop, fade } = useClock();
  const tools = [
    { at: 3.0, icon: "code", title: "Coding practice", note: "on one site", x: 150, y: 420, r: -4 },
    { at: 5.2, icon: "test", title: "Mock tests", note: "on another", x: 600, y: 560, r: 3 },
    { at: 7.6, icon: "mic", title: "Interview prep", note: "on their own · no feedback", x: 230, y: 760, r: -2 },
  ];
  const drift = fade(3, 19, 0, 1);
  return (
    <AbsoluteFill>
      <Backdrop />
      <div style={{ position: "absolute", left: 150, top: 120, opacity: pop(0.2), transform: `translateY(${(1 - pop(0.2)) * 20}px)` }}>
        <Eyebrow>The problem</Eyebrow>
        <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05, marginTop: 10 }}>
          Every placement season<br /><span style={{ color: C.brandDeep }}>looks the same.</span>
        </div>
      </div>
      {tools.map((tool, i) => {
        const s = pop(tool.at, 14);
        const dx = (i - 1) * 40 * drift, dy = (i % 2 ? 1 : -1) * 18 * drift;
        return (
          <Card key={tool.title} style={{ position: "absolute", left: tool.x + dx, top: tool.y + dy, width: 420, padding: "26px 28px",
            display: "flex", gap: 20, alignItems: "center", opacity: s, transform: `scale(${0.85 + 0.15 * s}) rotate(${tool.r}deg)` }}>
            <IconBadge name={tool.icon} />
            <div>
              <div style={{ fontSize: 30, fontWeight: 800 }}>{tool.title}</div>
              <div style={{ fontSize: 22, color: C.slate, marginTop: 4 }}>{tool.note}</div>
            </div>
          </Card>
        );
      })}
      {/* Placement team: blind until it is too late */}
      <Card style={{ position: "absolute", right: 150, top: 380, width: 640, padding: 34, opacity: pop(11), transform: `translateX(${(1 - pop(11)) * 60}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <IconBadge name="eyeOff" color={C.warn} bg="#FEF3C7" />
          <div>
            <Eyebrow color={C.warn} style={{ fontSize: 15 }}>Placement team</Eyebrow>
            <div style={{ fontSize: 34, fontWeight: 800 }}>Sees none of it</div>
          </div>
        </div>
        <div style={{ marginTop: 34, position: "relative", height: 150 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 46, height: 6, borderRadius: 3, background: C.line }} />
          <div style={{ position: "absolute", left: 0, top: 46, height: 6, borderRadius: 3, background: C.brand, width: `${fade(12.5, 16.5, 0, 100)}%` }} />
          {[["Preparation", 0, "flex-start"], ["Placement drive", 50, "center"], ["Who needed help?", 100, "flex-end"]].map(([label, at, align], i) => {
            const s = pop(12.5 + i * 2);
            const late = i === 2;
            const shift = align === "center" ? "-50%" : align === "flex-end" ? "-100%" : "0";
            return (
              <div key={label} style={{ position: "absolute", left: `${at}%`, top: 30, transform: `translateX(${shift})`, display: "flex", flexDirection: "column", alignItems: align, opacity: s }}>
                <div style={{ width: 38, height: 38, borderRadius: 19, background: late ? C.danger : C.white,
                  border: `4px solid ${late ? C.danger : C.brand}`, display: "grid", placeItems: "center" }}>
                  {late && <span style={{ color: C.white, fontWeight: 800, fontSize: 20 }}>!</span>}
                </div>
                <div style={{ marginTop: 14, fontSize: 21, fontWeight: 700, whiteSpace: "nowrap", color: late ? C.danger : C.ink }}>{label}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 22, color: C.slate, opacity: pop(16.5) }}>…found out only after the drive is over.</div>
      </Card>
    </AbsoluteFill>
  );
};

/* 02 · Vision ------------------------------------------------------------- */
export const VisionScene = ({ clip }) => {
  const { pop, fade } = useClock();
  const questionOut = fade(5.4, 6.2, 1, 0);
  const pillars = ["Learn", "Practise", "Assess", "Interview", "Analyse"];
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: questionOut }}>
        <div style={{ textAlign: "center", maxWidth: 1400, opacity: pop(0.3), transform: `translateY(${(1 - pop(0.3)) * 20}px)` }}>
          <Eyebrow>What if</Eyebrow>
          <div style={{ fontSize: 66, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1.15, marginTop: 14 }}>
            a student's <span style={{ color: C.brandDeep }}>entire preparation</span>,<br />
            and a college's <span style={{ color: C.brandDeep }}>entire view of it</span>,<br />lived in one place?
          </div>
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: clip ? 90 : 330, display: "flex", flexDirection: "column", alignItems: "center",
        opacity: pop(6.2), transform: `scale(${0.9 + 0.1 * pop(6.2)})` }}>
        <Wordmark size={clip ? 96 : 150} />
        <div style={{ display: "flex", gap: 14, marginTop: clip ? 26 : 46 }}>
          {pillars.map((p, i) => {
            const s = pop(9 + i * 0.35);
            return (
              <span key={p} style={{ opacity: s, transform: `translateY(${(1 - s) * 12}px)`, fontSize: 24, fontWeight: 700, padding: "10px 22px",
                borderRadius: 999, background: C.white, border: `1px solid ${C.line}`, color: C.ink }}>{p}</span>
            );
          })}
        </div>
      </div>
      {clip && (
        <div style={{ position: "absolute", left: 1920 / 2 - 750 * 0.78, top: 330, transform: `translateY(${(1 - pop(10.5)) * 80}px) scale(.78)`,
          transformOrigin: "top left", opacity: pop(10.5) }}>
          <BrowserFrame url="/">
            <div style={{ width: 1920, height: 1080, transform: "scale(0.78125)", transformOrigin: "0 0" }}>
              <OffthreadVideo src={staticFile(clip.file)} muted playbackRate={2} style={{ width: 1920, height: 1080 }} />
            </div>
          </BrowserFrame>
        </div>
      )}
    </AbsoluteFill>
  );
};

/* 11 · Architecture ------------------------------------------------------- */
const Node = ({ x, y, w = 330, icon, title, sub, at, accent = C.brandDeep, bg = C.sky100 }) => {
  const { pop } = useClock();
  const s = pop(at, 16);
  return (
    <Card style={{ position: "absolute", left: x, top: y, width: w, padding: "20px 22px", display: "flex", gap: 16, alignItems: "center",
      opacity: s, transform: `scale(${0.88 + 0.12 * s})` }}>
      <IconBadge name={icon} color={accent} bg={bg} size={56} />
      <div>
        <div style={{ fontSize: 25, fontWeight: 800, lineHeight: 1.15 }}>{title}</div>
        <div style={{ fontSize: 18, color: C.slate, marginTop: 3, fontFamily: MONO }}>{sub}</div>
      </div>
    </Card>
  );
};
const Wire = ({ d, at, dur = 0.7 }) => {
  const { fade } = useClock();
  const k = fade(at, at + dur);
  return <path d={d} fill="none" stroke={C.brand} strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - k} />;
};
export const ArchitectureScene = () => {
  const { pop } = useClock();
  return (
    <AbsoluteFill>
      <Backdrop />
      <div style={{ position: "absolute", left: 120, top: 70, opacity: pop(0.1) }}>
        <Eyebrow>How we built it</Eyebrow>
        <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1.4, marginTop: 8 }}>One codebase. Every campus isolated.</div>
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <Wire d="M450 500 H560" at={1.6} />
        <Wire d="M890 500 H990" at={4.6} />
        <Wire d="M1155 560 V650 M1155 650 H1230 M1155 650 H990 M1155 650 V700" at={6.0} />
        <Wire d="M725 440 V330 H990" at={9.4} />
        <Wire d="M1320 330 H1420" at={10.6} />
        <Wire d="M725 560 V860 H990" at={13.0} />
        <Wire d="M890 470 C 1300 470, 1300 470, 1420 470" at={15.4} />
      </svg>
      <Node x={120} y={440} icon="monitor" title="React 19 web app" sub="Vite · Tailwind · Monaco" at={0.6} />
      <Node x={560} y={440} icon="server" title="Node + Express API" sub="REST · Socket.IO" at={1.9} />
      <Node x={990} y={440} icon="layers" title="Tenant context" sub="university per request" at={4.4} accent={C.warn} bg="#FEF3C7" />
      {["University A", "University B", "University C"].map((u, i) => (
        <Node key={u} x={820 + i * 340} y={700} w={310} icon="db" title={u} sub="own MongoDB" at={6.2 + i * 0.5} accent={C.success} bg="#D1FAE5" />
      ))}
      <Node x={990} y={270} icon="queue" title="Redis + BullMQ" sub="job queues · workers" at={9.2} />
      <Node x={1420} y={270} w={360} icon="code" title="Judge0" sub="sandboxed code runs" at={10.8} />
      <Node x={1420} y={410} w={360} icon="spark" title="Google Gemini" sub="ANVI interviews" at={13.0} accent="#7C3AED" bg="#EDE9FE" />
      <Node x={990} y={860} w={360} icon="chart" title="Python analytics" sub="separate service" at={15.6} />
    </AbsoluteFill>
  );
};

/* 12 · Business model ------------------------------------------------------ */
export const BusinessScene = ({ facts }) => {
  const { pop } = useClock();
  const cards = [
    { at: 1.2, icon: "users", title: "Campus subscription", lines: ["Sized by student seats", "Pay for the modules you switch on", "Service dates per campus"] },
    { at: 6.6, icon: "coins", title: "Prep Coin credits", lines: ["AI interviews run on credits", "Usage-heavy features pay for their compute", "Free monthly allowance per feature"] },
    { at: 10.4, icon: "shield", title: "Cost control built in", lines: ["AI usage tracked per session", "Budget caps per interview", "Seat limits enforced on upload"] },
  ];
  return (
    <AbsoluteFill>
      <Backdrop />
      <div style={{ position: "absolute", left: 150, top: 110, display: "flex", alignItems: "center", gap: 20, opacity: pop(0.1) }}>
        <div>
          <Eyebrow>Business model</Eyebrow>
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1.6, marginTop: 8 }}>B2B SaaS for universities</div>
        </div>
        {!facts.businessConfirmed && (
          <span style={{ alignSelf: "flex-end", marginBottom: 12, fontSize: 18, fontWeight: 700, color: C.warn, background: "#FEF3C7", padding: "8px 14px", borderRadius: 999 }}>
            Proposed
          </span>
        )}
      </div>
      <div style={{ position: "absolute", left: 150, right: 150, top: 340, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 36 }}>
        {cards.map((card) => {
          const s = pop(card.at, 16);
          return (
            <Card key={card.title} style={{ padding: 40, opacity: s, transform: `translateY(${(1 - s) * 40}px)` }}>
              <IconBadge name={card.icon} size={76} />
              <div style={{ fontSize: 36, fontWeight: 800, marginTop: 26 }}>{card.title}</div>
              <div style={{ marginTop: 20, display: "grid", gap: 14 }}>
                {card.lines.map((l) => (
                  <div key={l} style={{ display: "flex", gap: 12, fontSize: 24, color: C.slate, alignItems: "baseline" }}>
                    <span style={{ color: C.success, fontWeight: 800 }}>✓</span>{l}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* 13 · Scale + close -------------------------------------------------------- */
export const ScaleCloseScene = ({ facts }) => {
  const { t, pop, fade } = useClock();
  const tiles = Math.min(24, Math.floor(interpolate(t, [0.8, 6.5], [1, 24], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const gridOut = fade(9.4, 10.2, 1, 0);
  const stats = facts.stats || [];
  return (
    <AbsoluteFill>
      <Backdrop />
      <div style={{ opacity: gridOut }}>
        <div style={{ position: "absolute", left: 150, top: 110, opacity: pop(0.1) }}>
          <Eyebrow>Built to scale</Eyebrow>
          <div style={{ fontSize: 60, fontWeight: 800, letterSpacing: -1.5, marginTop: 8, lineHeight: 1.1 }}>
            Add a university =<br /><span style={{ color: C.brandDeep }}>add a database.</span>
          </div>
          <div style={{ marginTop: 34, display: "grid", gap: 16, fontSize: 26, color: C.slate }}>
            {[["db", "Every campus isolated"], ["queue", "Every heavy job queued"], ["server", "Workers scale out horizontally"]].map(([icon, text], i) => (
              <div key={text} style={{ display: "flex", gap: 14, alignItems: "center", opacity: pop(1 + i * 1.6) }}>
                <Icon name={icon} size={30} />{text}
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: "absolute", left: 1000, top: 160, width: 770, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 18 }}>
          {Array.from({ length: 24 }, (_, i) => {
            const on = i < tiles;
            return (
              <div key={i} style={{ height: 112, borderRadius: 18, display: "grid", placeItems: "center", background: on ? C.white : "transparent",
                border: `1px ${on ? "solid" : "dashed"} ${on ? C.line : "#CBD5E1"}`, boxShadow: on ? "0 14px 30px -20px rgba(15,23,42,.4)" : "none",
                transform: `scale(${on ? 1 : 0.92})` }}>
                {on && <Icon name="db" size={40} color={i % 3 === 0 ? C.success : C.brandDeep} />}
              </div>
            );
          })}
        </div>
      </div>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: pop(10.2), transform: `scale(${0.94 + 0.06 * pop(10.2)})` }}>
        <Wordmark size={140} />
        <div style={{ display: "flex", gap: 22, marginTop: 52 }}>
          {stats.map((s, i) => {
            const k = pop(10.8 + i * 0.35, 16);
            return (
              <Card key={s.label} style={{ width: 270, padding: "26px 24px", textAlign: "center", opacity: k, transform: `translateY(${(1 - k) * 24}px)` }}>
                <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: -1.5, color: C.brandDeep, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 22, color: C.slate, marginTop: 10, fontWeight: 600 }}>{s.label}</div>
              </Card>
            );
          })}
        </div>
        <div style={{ fontSize: 30, color: C.slate, marginTop: 30, opacity: pop(12.6) }}>…and built for many more campuses.</div>
        <div style={{ display: "flex", gap: 14, marginTop: 44, opacity: pop(13) }}>
          {["Learn", "Practise", "Assess", "Interview", "Analyse"].map((p) => (
            <span key={p} style={{ fontSize: 22, fontWeight: 700, padding: "8px 20px", borderRadius: 999, background: C.sky100, color: C.brandDeep }}>{p}</span>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
