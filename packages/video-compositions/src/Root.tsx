import React from "react";
import { Composition } from "remotion";
import { Baseline } from "./templates/baseline";
import { Punch } from "./templates/punch";
import { Offhand } from "./templates/offhand";
import { Slam } from "./templates/slam";
import { Broadsheet } from "./templates/broadsheet";
import { Prime } from "./templates/prime";
import { Scrapbook } from "./templates/scrapbook";
import { Checklist } from "./templates/checklist";
import { sampleProps } from "./fixtures/sampleProps";
import { buildTimeline } from "./timing";
import type { VideoCompositionProps } from "./types";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/**
 * Duration derives from the script (or real Whisper timings) at render
 * time, so `--props` with a different script Just Works.
 */
const calculateMetadata = ({ props }: { props: VideoCompositionProps }) => {
  const { totalDuration } = buildTimeline(props.script, props.words);
  return { durationInFrames: Math.ceil(totalDuration * FPS) };
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="baseline"
      component={Baseline}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      defaultProps={sampleProps}
      calculateMetadata={calculateMetadata}
    />
    <Composition
      id="punch"
      component={Punch}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      defaultProps={{ ...sampleProps, settings: { ...sampleProps.settings, template: "punch" } }}
      calculateMetadata={calculateMetadata}
    />
    {(
      [
        ["offhand", Offhand],
        ["slam", Slam],
        ["broadsheet", Broadsheet],
        ["prime", Prime],
        ["scrapbook", Scrapbook],
        ["checklist", Checklist],
      ] as const
    ).map(([id, component]) => (
      <Composition
        key={id}
        id={id}
        component={component}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        defaultProps={{ ...sampleProps, settings: { ...sampleProps.settings, template: id } }}
        calculateMetadata={calculateMetadata}
      />
    ))}
  </>
);
