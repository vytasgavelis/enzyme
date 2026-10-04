import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";

// Same palette as the web app (apps/web/src/index.css): green accent, sage neutrals.
export const color = {
  primary: "oklch(0.58 0.15 148)",
  primarySoft: "oklch(0.93 0.05 148)",
  foreground: "oklch(0.145 0 0)",
  muted: "oklch(0.5 0.012 165)",
  border: "oklch(0.91 0.008 165)",
  page: "oklch(0.985 0.004 165)",
  stageTop: "oklch(0.97 0.012 160)",
  stageBottom: "oklch(0.91 0.03 155)",
  highlight: "oklch(0.8 0.16 85)",
};

export const font = {
  sans: loadGeist("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] })
    .fontFamily,
  mono: loadGeistMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily,
};

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const TRANSITION_FRAMES = 15;
