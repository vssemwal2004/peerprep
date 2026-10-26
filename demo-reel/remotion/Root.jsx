import { Composition } from "remotion";
import timeline from "../script/timeline.json";
import { Pitch } from "./Pitch.jsx";

const total = timeline.scenes.reduce((n, s) => n + s.duration, 0);

export const Root = () => (
  <>
    <Composition
      id="Pitch"
      component={Pitch}
      durationInFrames={total * timeline.fps}
      fps={timeline.fps}
      width={timeline.width}
      height={timeline.height}
      defaultProps={{ clips: {}, only: null, facts: {} }}
      calculateMetadata={({ props }) => {
        const scenes = props.only ? timeline.scenes.filter((s) => props.only.includes(s.id)) : timeline.scenes;
        return { durationInFrames: scenes.reduce((n, s) => n + s.duration, 0) * timeline.fps };
      }}
    />
  </>
);
