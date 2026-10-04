import titles from "./paper-titles.json";
import type { Scene } from "./types";

// The demo video, scene by scene. Edit this file to change the cut.
// Screenshots are in public/shots/, recordings in public/clips/ (1440x900, recorded against the
// clean demo database). Callout boxes are [x, y, width, height] in the image's own pixels; callout
// times are seconds into the scene. Clip segments are in recording seconds.
// Numbers on screen come from the app: the agent steps are the recorded Suggest query run
// (trace c51abd3e), the stats are bench/results/gemma-26b-vs-31b.md.

const APP = "localhost:5173";

export const storyboard: Scene[] = [
  {
    kind: "title",
    seconds: 5.5,
    lead: "An enzyme breaks big molecules into pieces the body can use.",
    title: "Enzyme",
    subtitle: "does the same for research papers.",
  },
  {
    kind: "flood",
    seconds: 7.5,
    eyebrow: "Built for a friend",
    lines: [
      "My friend is a scientist who wants to create healthy\u2011lifestyle content based on real, published evidence.",
      "Keeping up with the research is the hard part.",
    ],
    counter: { to: 4436, label: "papers match just one of their topics" },
    titles,
  },
  {
    kind: "screenshot",
    seconds: 4.5,
    src: "shots/feed-sidebar.png",
    size: [1440, 900],
    url: `${APP}/searches/1`,
    caption: "Their topics, saved as searches.",
    camera: [
      { at: 0, x: 0.5, y: 0.5, zoom: 1 },
      { at: 0.5, x: 0.2, y: 0.2, zoom: 1.35 },
      { at: 1, x: 0.2, y: 0.2, zoom: 1.35 },
    ],
    callouts: [{ from: 1.2, box: [10, 86, 244, 196], label: "Six topics" }],
  },
  {
    kind: "clip",
    src: "clips/suggest-query.mp4",
    size: [1440, 900],
    url: `${APP}/searches/4`,
    segments: [
      { from: 0.3, to: 12.6, rate: 2.5 },
      { from: 12.6, to: 28.1, rate: 8 },
      { from: 28.1, to: 30.6 },
    ],
    hold: 1.5,
    caption: "No query syntax needed: describe the topic in plain English and press Suggest query.",
    camera: [
      { at: 0, x: 0.5, y: 0.5, zoom: 1 },
      { at: 0.12, x: 0.5, y: 0.48, zoom: 1.45 },
      { at: 0.6, x: 0.5, y: 0.48, zoom: 1.45 },
      { at: 0.75, x: 0.5, y: 0.55, zoom: 1.45 },
      { at: 1, x: 0.5, y: 0.55, zoom: 1.45 },
    ],
    callouts: [{ from: 7.1, box: [474, 408, 492, 184], label: "911 papers" }],
  },
  {
    kind: "agent",
    seconds: 8.5,
    eyebrow: "Behind Suggest query",
    prompt: "supplements that reduce inflammation",
    tool: "count_hits",
    steps: [
      {
        query: "(supplement* OR vitamin* OR mineral* OR herb*) AND (inflammation OR inflammatory)",
        hits: 40748,
        verdict: "Too many. Narrow it.",
        ok: false,
      },
      {
        query: "… AND type:(review OR systematic review OR meta-analysis OR RCT)",
        hits: 10912,
        verdict: "Too many. Narrow it.",
        ok: false,
      },
      {
        query: "… AND type:(systematic review OR meta-analysis)",
        hits: 911,
        verdict: "✓ Readable",
        ok: true,
      },
    ],
    caption:
      "A Mastra agent running Gemma 4 counts the hits with a tool and narrows until the search is readable.",
  },
  {
    kind: "clip",
    src: "clips/pull.mp4",
    size: [1440, 900],
    url: `${APP}/searches/4`,
    segments: [{ from: 0.5, to: 12.8, rate: 2.5 }],
    caption: "Pull papers fetches the newest 500 from Europe PMC, which includes PubMed.",
    camera: [
      { at: 0, x: 0.5, y: 0.5, zoom: 1 },
      { at: 0.3, x: 0.82, y: 0.08, zoom: 1.9 },
      { at: 1, x: 0.82, y: 0.08, zoom: 1.9 },
    ],
  },
  {
    kind: "clip",
    src: "clips/filter.mp4",
    size: [1440, 900],
    url: `${APP}/searches/4`,
    segments: [
      { from: 0, to: 7.6, rate: 1.5 },
      { from: 7.6, to: 9.5 },
    ],
    hold: 1.5,
    caption:
      "Filters read each paper's own metadata, no AI. Human RCTs and meta-analyses: 500 become 78.",
    camera: [
      { at: 0, x: 0.5, y: 0.5, zoom: 1 },
      { at: 0.15, x: 0.5, y: 0.28, zoom: 1.5 },
      { at: 1, x: 0.5, y: 0.28, zoom: 1.5 },
    ],
    callouts: [{ from: 6.1, box: [394, 248, 204, 26], label: "500 → 78" }],
  },
  {
    kind: "clip",
    src: "clips/summarise-top-10.mp4",
    size: [1440, 900],
    url: `${APP}/searches/4`,
    segments: [
      { from: 0, to: 2.5 },
      { from: 2.5, to: 54, rate: 10 },
      { from: 54, to: 62, rate: 3 },
    ],
    caption: "Summarise top 10: key numbers and a one-line takeaway for each paper.",
    camera: [
      { at: 0, x: 0.75, y: 0.15, zoom: 1.4 },
      { at: 0.25, x: 0.6, y: 0.55, zoom: 1.2 },
      { at: 1, x: 0.6, y: 0.55, zoom: 1.2 },
    ],
  },
  {
    kind: "clip",
    src: "clips/card-hover.mp4",
    size: [1440, 900],
    url: `${APP}/searches/1`,
    segments: [
      { from: 0, to: 4.6, rate: 1.5 },
      { from: 4.6, to: 18.7, rate: 1.4 },
    ],
    caption:
      "Every fact comes with the exact words from the abstract. Hover a fact and they light up.",
    camera: [
      { at: 0, x: 0.5, y: 0.5, zoom: 1 },
      { at: 0.25, x: 0.6, y: 0.55, zoom: 1.15 },
      { at: 1, x: 0.6, y: 0.55, zoom: 1.15 },
    ],
  },
  {
    kind: "screenshot",
    seconds: 6.5,
    src: "shots/card-check.png",
    size: [912, 459],
    url: `${APP}/searches/1`,
    caption:
      "The app checks every quote is really in the abstract. What the abstract doesn't say is Not stated, never guessed.",
    callouts: [
      { from: 0.6, to: 3.3, box: [706, 143, 72, 26], label: "Quote not found: flagged" },
      { from: 3.4, box: [184, 308, 130, 126], label: "Not stated, not guessed", labelAt: "right" },
    ],
  },
  {
    kind: "stats",
    seconds: 7,
    eyebrow: "Picked by benchmark",
    title: "Open-weight Gemma 4: the 26B model against the 31B, on the same 12 papers.",
    tiles: [
      { value: "99%", label: "of quotes found word for word in the abstract (both)" },
      { value: "84% vs 69%", label: "of summary claims supported by the facts" },
      { value: "14 s vs 49 s", label: "median time per paper. The smaller model won." },
    ],
  },
  {
    kind: "statement",
    seconds: 4.5,
    eyebrow: "Their verdict",
    lines: ["Now scientists can research and summarise papers fast, and at scale."],
  },
  {
    kind: "outro",
    seconds: 4.5,
    title: "Enzyme",
    lines: ["github.com/vytasgavelis/enzyme", "DEV Hacktoberfest 2026 · Build for a Friend"],
  },
];
