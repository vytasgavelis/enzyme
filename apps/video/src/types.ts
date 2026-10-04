// A storyboard is a list of scenes played in order with a short cross-fade between them.
// Times are in seconds; the composition converts them to frames.

/** A camera keyframe. `x`/`y` is the point of the image (0..1) to centre on, `at` is 0..1 of the scene. */
export type CameraKey = { at: number; x: number; y: number; zoom: number };

/** A highlight ring drawn on the image. `box` is [x, y, width, height] in image pixels; times are scene seconds. */
export type Callout = {
  from: number;
  to?: number;
  box: [number, number, number, number];
  label?: string;
  /** Where the label sits relative to the box (default above). */
  labelAt?: "above" | "below" | "right";
};

/** A stretch of a recording, `from`..`to` in recording seconds, played at `rate` (default 1). */
export type Segment = { from: number; to: number; rate?: number };

type SceneBase = {
  /** Lower-third text. */
  caption?: string;
  /** What still needs doing for this scene. Shown as a badge in the studio, hidden in the final render. */
  todo?: string;
};

type Screen = {
  /** The image's or recording's pixel size; callout boxes and camera use it. */
  size: [number, number];
  url?: string;
  camera?: CameraKey[];
  callouts?: Callout[];
};

export type Scene =
  | (SceneBase & {
      kind: "title";
      seconds: number;
      title: string;
      subtitle?: string;
      /** A line shown on its own before the title. */
      lead?: string;
    })
  | (SceneBase & { kind: "statement"; seconds: number; lines: string[]; eyebrow?: string })
  | (SceneBase & {
      kind: "flood";
      seconds: number;
      eyebrow?: string;
      lines: string[];
      /** A number that counts up, with its label. */
      counter: { to: number; label: string };
      /** Paper titles scrolling past behind the text. */
      titles: string[];
    })
  | (SceneBase & {
      kind: "agent";
      seconds: number;
      eyebrow?: string;
      prompt: string;
      tool: string;
      steps: { query: string; hits: number; verdict: string; ok: boolean }[];
    })
  | (SceneBase & {
      kind: "stats";
      seconds: number;
      eyebrow?: string;
      title: string;
      tiles: { value: string; label: string }[];
    })
  | (SceneBase &
      Screen & {
        kind: "screenshot";
        seconds: number;
        /** File in public/, or null for a placeholder. */
        src: string | null;
        /** `contain` shows the whole image; `scroll` fits the width and lets the camera move down a tall page. */
        fit?: "contain" | "scroll";
      })
  | (SceneBase &
      Screen & {
        kind: "clip";
        /** Screen recording in public/, or null for a placeholder. */
        src: string | null;
        /** The parts of the recording to play, in order. The scene lasts as long as they do. */
        segments: Segment[];
        /** Seconds to hold the last frame at the end. */
        hold?: number;
      })
  | (SceneBase & { kind: "outro"; seconds: number; title: string; lines: string[] });
