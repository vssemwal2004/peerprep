import { useEffect, useState } from "react";
import { AbsoluteFill, Sequence, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import timeline from "../script/timeline.json";
import { C, FONT } from "./theme.js";
import { ScreenScene } from "./ScreenScene.jsx";
import { ProblemScene, VisionScene, ArchitectureScene, BusinessScene, ScaleCloseScene } from "./Motion.jsx";

const MOTION = {
  "01-problem": ProblemScene,
  "02-vision": VisionScene,
  "11-architecture": ArchitectureScene,
  "12-business": BusinessScene,
  "13-scale-close": ScaleCloseScene,
};

const useFonts = () => {
  const [handle] = useState(() => delayRender("Loading fonts"));
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=block";
    document.head.appendChild(link);
    link.onload = () => Promise.all([
      document.fonts.load("800 40px Manrope"), document.fonts.load("500 20px Manrope"), document.fonts.load("500 20px 'JetBrains Mono'"),
    ]).finally(() => continueRender(handle));
    link.onerror = () => continueRender(handle);
  }, [handle]);
};

// Short cross-fade at the edges of every scene so cuts never feel abrupt.
const Fade = ({ children, frames }) => {
  const f = useCurrentFrame();
  const opacity = interpolate(f, [0, 8, frames - 8, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const Pitch = ({ clips = {}, only = null, facts = {} }) => {
  useFonts();
  const { fps } = useVideoConfig();
  const scenes = only ? timeline.scenes.filter((s) => only.includes(s.id)) : timeline.scenes;
  let from = 0;
  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: FONT, color: C.ink }}>
      {scenes.map((scene, index) => {
        const frames = scene.duration * fps, start = from;
        from += frames;
        const Motion = MOTION[scene.id];
        const step = timeline.scenes.indexOf(scene) + 1;
        return (
          <Sequence key={scene.id} from={start} durationInFrames={frames} name={scene.id}>
            <Fade frames={frames}>
              {Motion
                ? <Motion scene={scene} clip={clips[scene.id]} facts={facts} />
                : <ScreenScene scene={scene} clips={clips} step={step} />}
            </Fade>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
