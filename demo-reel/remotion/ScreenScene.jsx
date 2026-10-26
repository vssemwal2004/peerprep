import { AbsoluteFill, Img, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, MONO } from "./theme.js";

const SRC_W = 1920, SRC_H = 1080, FRAME_W = 1500, BAR = 44;
const K = FRAME_W / SRC_W;

export const Backdrop = ({ tint = C.sky100 }) => (
  <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 85% -10%, ${tint} 0%, transparent 60%), radial-gradient(900px 600px at -10% 110%, #EEF2FF 0%, transparent 55%), ${C.paper}` }}>
    <AbsoluteFill style={{ backgroundImage: `radial-gradient(${C.line} 1.2px, transparent 1.2px)`, backgroundSize: "28px 28px", opacity: 0.55 }} />
  </AbsoluteFill>
);

const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
// 0 → 1 → 0 envelope around each click: ease in before, hold, ease out after.
const envelope = (dt) => {
  if (dt < -0.8 || dt > 2.1) return 0;
  if (dt < -0.1) return ease((dt + 0.8) / 0.7);
  if (dt < 1.3) return 1;
  return 1 - ease((dt - 1.3) / 0.8);
};

// Segments [[from, to, outSeconds], ...] retime the raw capture: dead time (page
// loads, judge waits) is cut, and real-time-slow interactions are sped up.
const outTime = (segments, t) => {
  let acc = 0;
  for (const [from, to, dur] of segments) {
    if (t >= from && t <= to) return acc + ((t - from) * dur) / (to - from);
    acc += dur;
  }
  return null;
};

// Without hand-tuned segments, keep everything except the ranges marked as cuts
// during recording and play it at one uniform speed that fills the slot.
export const autoSegments = (clip, duration) => {
  const end = (clip.duration || duration) - 0.05;
  const kept = [];
  let from = 0.3;
  for (const [a, b] of [...(clip.cuts || [])].sort((x, y) => x[0] - y[0])) {
    if (a > from + 0.05) kept.push([from, Math.min(a, end)]);
    from = Math.max(from, b);
  }
  if (end > from + 0.05) kept.push([from, end]);
  const total = kept.reduce((n, [a, b]) => n + (b - a), 0) || 1;
  return kept.map(([a, b]) => [a, b, ((b - a) * duration) / total]);
};

const ZoomedVideo = ({ clip, segments }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  let weight = 0, x = 0, y = 0, zoom = 1;
  for (const c of clip.clicks || []) {
    const at = outTime(segments, c.t);
    if (at === null) continue;
    const e = envelope(t - at);
    if (!e) continue;
    weight += e; x += c.x * e; y += c.y * e;
    zoom = Math.max(zoom, 1 + ((c.zoom || 1.35) - 1) * e);
  }
  const ox = weight ? x / weight : SRC_W / 2, oy = weight ? y / weight : SRC_H / 2;
  return (
    // flexShrink 0: AbsoluteFill parents are flex columns and would squash the 1080px source.
    <div style={{ width: SRC_W, height: SRC_H, flexShrink: 0, transform: `scale(${K})`, transformOrigin: "0 0", overflow: "hidden" }}>
      <div style={{ width: SRC_W, height: SRC_H, transform: `scale(${zoom})`, transformOrigin: `${ox}px ${oy}px`, position: "relative" }}>
        {segments.map(([from, to, dur], i) => {
          const start = Math.round(segments.slice(0, i).reduce((n, s) => n + s[2], 0) * fps);
          return (
            <Sequence key={i} from={start} durationInFrames={Math.round(dur * fps)} layout="none">
              <OffthreadVideo src={staticFile(clip.file)} muted trimBefore={Math.round(from * fps)} playbackRate={(to - from) / dur}
                style={{ position: "absolute", inset: 0, width: SRC_W, height: SRC_H }} />
            </Sequence>
          );
        })}
      </div>
    </div>
  );
};

export const BrowserFrame = ({ url, children, style }) => (
  <div style={{ width: FRAME_W, borderRadius: 18, overflow: "hidden", background: C.white, border: `1px solid ${C.line}`,
    boxShadow: "0 40px 80px -30px rgba(15,23,42,.35), 0 12px 24px -12px rgba(15,23,42,.18)", ...style }}>
    <div style={{ height: BAR, display: "flex", alignItems: "center", gap: 18, padding: "0 18px", background: "#F1F5F9", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", gap: 8 }}>
        {["#F87171", "#FBBF24", "#34D399"].map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}
      </div>
      <div style={{ flex: 1, maxWidth: 620, height: 28, borderRadius: 8, background: C.white, border: `1px solid ${C.line}`,
        display: "flex", alignItems: "center", padding: "0 12px", fontFamily: MONO, fontSize: 14, color: C.slate }}>
        <span style={{ color: C.success, marginRight: 8 }}>●</span>peerprep{url}
      </div>
    </div>
    <div style={{ width: FRAME_W, height: SRC_H * K, position: "relative", background: C.white }}>{children}</div>
  </div>
);

const Header = ({ scene, step }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const side = { admin: "ADMIN · PLACEMENT TEAM", student: "STUDENT", both: "PLACEMENT TEAM + STUDENT" }[scene.role] || "PLATFORM";
  return (
    <div style={{ position: "absolute", left: (1920 - FRAME_W) / 2, right: (1920 - FRAME_W) / 2, top: 40, height: 80,
      display: "flex", alignItems: "center", justifyContent: "space-between", opacity: enter, transform: `translateY(${(1 - enter) * 14}px)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <span style={{ fontFamily: MONO, fontSize: 18, color: C.brandDeep, background: C.sky100, padding: "6px 12px", borderRadius: 999 }}>{String(step).padStart(2, "0")}</span>
        <div>
          <div style={{ fontSize: 15, letterSpacing: 2.5, fontWeight: 700, color: scene.role === "admin" ? C.warn : C.brandDeep }}>{side}</div>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1 }}>{scene.label}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {(scene.points || []).map((p, i) => {
          const s = spring({ frame: frame - (12 + i * 14) * (fps / 30), fps, config: { damping: 200 } });
          return (
            <span key={p} style={{ opacity: s, transform: `translateY(${(1 - s) * 10}px)`, fontSize: 19, fontWeight: 600, color: C.ink,
              background: C.white, border: `1px solid ${C.line}`, borderRadius: 999, padding: "10px 18px", boxShadow: "0 6px 16px -10px rgba(15,23,42,.3)" }}>{p}</span>
          );
        })}
      </div>
    </div>
  );
};

// A scene is one or more recorded parts (e.g. admin schedule → student view → admin report).
const Part = ({ part, clip, scene }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  if (!clip) {
    return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontSize: 30, color: C.muted }}>
        <Img src={staticFile("brand/peerprep-mark.png")} style={{ width: 80, opacity: 0.5, marginBottom: 16 }} />
        Recording pending · {part.clip}
      </AbsoluteFill>
    );
  }
  const segments = part.segments || autoSegments(clip, part.duration);
  const fade = Math.min(1, frame / 6, (part.duration * fps - frame) / 6);
  return (
    <AbsoluteFill style={{ opacity: scene.parts ? Math.max(0, fade) : 1 }}>
      <ZoomedVideo clip={clip} segments={segments} />
    </AbsoluteFill>
  );
};

export const ScreenScene = ({ scene, clips = {}, step }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame: frame - 4, fps, config: { damping: 200, mass: 0.9 } });
  const parts = scene.parts || [{ clip: scene.id, duration: scene.duration, segments: scene.segments, url: scene.url }];
  let at = 0;
  const starts = parts.map((p) => { const s = at; at += p.duration; return s; });
  const current = parts.findLast((p, i) => frame / fps >= starts[i]) || parts[0];
  const url = current.url || clips[current.clip]?.url || (scene.routes || [""])[0];
  return (
    <AbsoluteFill>
      <Backdrop tint={scene.role === "admin" ? "#FEF3C7" : C.sky100} />
      <Header scene={scene} step={step} />
      <div style={{ position: "absolute", left: (1920 - FRAME_W) / 2, top: 146, transform: `translateY(${(1 - rise) * 40}px)`, opacity: rise }}>
        <BrowserFrame url={url}>
          {parts.map((part, i) => (
            <Sequence key={part.clip} from={Math.round(starts[i] * fps)} durationInFrames={Math.round(part.duration * fps)} layout="none">
              <AbsoluteFill><Part part={part} clip={clips[part.clip]} scene={scene} /></AbsoluteFill>
            </Sequence>
          ))}
        </BrowserFrame>
      </div>
    </AbsoluteFill>
  );
};
