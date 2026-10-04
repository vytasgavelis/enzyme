import { Composition } from "remotion";
import { Demo, totalFrames } from "./Demo";
import { storyboard } from "./storyboard";
import { FPS, HEIGHT, WIDTH } from "./theme";

export const Root = () => (
  <Composition
    id="EnzymeDemo"
    component={Demo}
    durationInFrames={totalFrames(storyboard)}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
