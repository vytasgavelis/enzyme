import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Fragment } from "react";
import { AgentScene, FloodScene, StatsScene } from "./scenes/AnimatedScenes";
import { ClipScene, clipSeconds, ScreenshotScene } from "./scenes/ScreenScenes";
import { OutroScene, StatementScene, TitleScene } from "./scenes/TextScenes";
import { storyboard } from "./storyboard";
import { FPS, TRANSITION_FRAMES } from "./theme";
import type { Scene } from "./types";

const sceneSeconds = (scene: Scene) =>
  scene.kind === "clip" ? clipSeconds(scene.segments, scene.hold) : scene.seconds;

const sceneFrames = (scene: Scene) => Math.round(sceneSeconds(scene) * FPS);

/** Total length: every scene, minus the overlap of each cross-fade. */
export const totalFrames = (scenes: Scene[]) =>
  scenes.reduce((sum, s) => sum + sceneFrames(s), 0) -
  TRANSITION_FRAMES * Math.max(0, scenes.length - 1);

const renderScene = (scene: Scene) => {
  switch (scene.kind) {
    case "title":
      return <TitleScene {...scene} />;
    case "statement":
      return <StatementScene {...scene} />;
    case "flood":
      return <FloodScene {...scene} />;
    case "agent":
      return <AgentScene {...scene} />;
    case "stats":
      return <StatsScene {...scene} />;
    case "screenshot":
      return <ScreenshotScene {...scene} />;
    case "clip":
      return <ClipScene {...scene} />;
    case "outro":
      return <OutroScene {...scene} />;
  }
};

export const Demo = () => (
  <TransitionSeries>
    {storyboard.map((scene, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: the storyboard order is the identity
      <Fragment key={i}>
        {i > 0 && (
          <TransitionSeries.Transition
            presentation={fade()}
            timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
          />
        )}
        <TransitionSeries.Sequence durationInFrames={sceneFrames(scene)}>
          {renderScene(scene)}
        </TransitionSeries.Sequence>
      </Fragment>
    ))}
  </TransitionSeries>
);
