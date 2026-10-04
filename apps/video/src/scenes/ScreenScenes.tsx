import { Video } from "@remotion/media";
import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Freeze,
  Img,
  interpolate,
  Series,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { color, FPS, font } from "../theme";
import type { Callout, CameraKey, Segment } from "../types";
import { BrowserFrame, Caption, Placeholder, Stage, TodoBadge, useEnter } from "./chrome";

// The browser window may use this much of the 1920x1080 stage; the rest is margin and caption.
const MAX_W = 1640;
const MAX_H = 820;
const TOP = 30;

/** Size of the browser viewport and the image's base scale inside it. */
const layout = ([iw, ih]: [number, number], fit: "contain" | "scroll") => {
  if (fit === "scroll") {
    const vw = Math.min(MAX_W, iw * 1.4);
    return { vw, vh: MAX_H, base: vw / iw };
  }
  const base = Math.min(MAX_W / iw, MAX_H / ih);
  return { vw: iw * base, vh: ih * base, base };
};

const STILL: CameraKey[] = [{ at: 0, x: 0.5, y: 0.5, zoom: 1 }];

const cameraAt = (keys: CameraKey[], t: number) => {
  if (keys.length === 1) return keys[0] as CameraKey;
  const at = keys.map((k) => k.at);
  const opts = {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  } as const;
  return {
    at: t,
    x: interpolate(
      t,
      at,
      keys.map((k) => k.x),
      opts,
    ),
    y: interpolate(
      t,
      at,
      keys.map((k) => k.y),
      opts,
    ),
    zoom: interpolate(
      t,
      at,
      keys.map((k) => k.zoom),
      opts,
    ),
  };
};

/** Keep the image covering the viewport: centre if it is smaller, otherwise clamp to its edges. */
const offset = (view: number, content: number, focus: number) =>
  content <= view
    ? (view - content) / 2
    : Math.min(0, Math.max(view - content, view / 2 - focus * content));

const labelPosition = (at: "above" | "below" | "right", scale: number) => {
  if (at === "right")
    return { left: "100%", top: "50%", marginLeft: 12 / scale, transform: "translateY(-50%)" };
  if (at === "below") return { left: -4 / scale, top: "100%", marginTop: 8 / scale };
  return { left: -4 / scale, bottom: "100%", marginBottom: 8 / scale };
};

const CalloutRing = ({ callout, scale }: { callout: Callout; scale: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = useEnter(callout.from * fps, 18);
  const exit =
    callout.to === undefined
      ? 1
      : interpolate(frame, [callout.to * fps - 8, callout.to * fps], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const shown = Math.min(enter, exit);
  if (shown <= 0) return null;
  const [x, y, w, h] = callout.box;
  const pad = 6 / scale;
  return (
    <div
      style={{
        position: "absolute",
        left: x - pad,
        top: y - pad,
        width: w + pad * 2,
        height: h + pad * 2,
        borderRadius: 10 / scale,
        border: `${4 / scale}px solid ${color.primary}`,
        // Dim everything else so the eye goes to the box.
        boxShadow: `0 0 0 ${4000 / scale}px rgba(15, 30, 20, ${0.28 * shown})`,
        opacity: shown,
        transform: `scale(${interpolate(enter, [0, 1], [1.08, 1])})`,
      }}
    >
      {callout.label && (
        <div
          style={{
            position: "absolute",
            ...labelPosition(callout.labelAt ?? "above", scale),
            padding: `${6 / scale}px ${14 / scale}px`,
            borderRadius: 8 / scale,
            background: color.primary,
            color: "white",
            fontSize: 26 / scale,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {callout.label}
        </div>
      )}
    </div>
  );
};

/** An image or recording in the browser window, moved by the camera, with callouts on top. */
const Screen = ({
  media,
  placeholder,
  size,
  fit = "contain",
  url,
  camera = STILL,
  callouts = [],
  caption,
  todo,
  badge,
}: {
  media: ReactNode | null;
  placeholder: string;
  size: [number, number];
  fit?: "contain" | "scroll";
  url?: string;
  camera?: CameraKey[];
  callouts?: Callout[];
  caption?: string;
  todo?: string;
  badge?: string | null;
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const [iw, ih] = size;
  const { vw, vh, base } = layout(size, fit);
  const cam = cameraAt(camera, frame / (durationInFrames - 1));
  const scale = base * cam.zoom;
  const tx = offset(vw, iw * scale, cam.x);
  const ty = offset(vh, ih * scale, cam.y);

  return (
    <Stage>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: TOP }}>
        <BrowserFrame width={vw} height={vh} url={url}>
          {media ? (
            <div
              style={{
                position: "absolute",
                width: iw,
                height: ih,
                transformOrigin: "0 0",
                transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              }}
            >
              {media}
              {callouts.map((c) => (
                <CalloutRing key={`${c.from}-${c.box.join()}`} callout={c} scale={scale} />
              ))}
            </div>
          ) : (
            <Placeholder label={`${placeholder}${todo ? `: ${todo}` : ""}`} />
          )}
          {badge && <SpeedBadge text={badge} />}
        </BrowserFrame>
      </AbsoluteFill>
      {caption && <Caption text={caption} />}
      {todo && <TodoBadge text={todo} />}
    </Stage>
  );
};

/** Says a stretch of recording is sped up, so the video never misrepresents how long things take. */
const SpeedBadge = ({ text }: { text: string }) => (
  <div
    style={{
      position: "absolute",
      top: 16,
      right: 16,
      padding: "6px 14px",
      borderRadius: 999,
      background: "rgba(20, 30, 25, 0.75)",
      color: "white",
      fontFamily: font.mono,
      fontSize: 22,
      fontWeight: 500,
    }}
  >
    {text}
  </div>
);

export const ScreenshotScene = ({
  src,
  ...rest
}: {
  src: string | null;
  size: [number, number];
  fit?: "contain" | "scroll";
  url?: string;
  camera?: CameraKey[];
  callouts?: Callout[];
  caption?: string;
  todo?: string;
}) => (
  <Screen
    {...rest}
    placeholder="Screenshot to come"
    media={
      src && (
        <Img
          src={staticFile(src)}
          style={{ width: rest.size[0], height: rest.size[1], display: "block" }}
        />
      )
    }
  />
);

const segmentFrames = (s: Segment) => Math.round(((s.to - s.from) / (s.rate ?? 1)) * FPS);

/** How long a clip scene lasts: its segments plus the held last frame. */
export const clipSeconds = (segments: Segment[], hold = 0) =>
  segments.reduce((sum, s) => sum + segmentFrames(s), 0) / FPS + hold;

export const ClipScene = ({
  src,
  segments,
  hold = 0,
  ...rest
}: {
  src: string | null;
  segments: Segment[];
  hold?: number;
  size: [number, number];
  url?: string;
  camera?: CameraKey[];
  callouts?: Callout[];
  caption?: string;
  todo?: string;
}) => {
  const frame = useCurrentFrame();
  const [w, h] = rest.size;
  // Which segment is playing, for the speed badge.
  let end = 0;
  const current = segments.find((s) => {
    end += segmentFrames(s);
    return frame < end;
  });
  const rate = current?.rate ?? 1;
  const last = segments.at(-1);
  const video = (s: Segment) => (
    <Video
      src={staticFile(src ?? "")}
      trimBefore={Math.round(s.from * FPS)}
      trimAfter={Math.round(s.to * FPS)}
      playbackRate={s.rate ?? 1}
      muted
      style={{ width: w, height: h, display: "block" }}
    />
  );
  return (
    <Screen
      {...rest}
      placeholder="Recording to come"
      badge={rate >= 2 ? `${rate}× speed` : null}
      media={
        src && (
          <AbsoluteFill style={{ width: w, height: h }}>
            <Series>
              {segments.map((s) => (
                <Series.Sequence key={`${s.from}-${s.to}`} durationInFrames={segmentFrames(s)}>
                  {video(s)}
                </Series.Sequence>
              ))}
              {last && hold > 0 && (
                <Series.Sequence durationInFrames={Math.round(hold * FPS)}>
                  <Freeze frame={0}>{video({ from: last.to - 1 / FPS, to: last.to })}</Freeze>
                </Series.Sequence>
              )}
            </Series>
          </AbsoluteFill>
        )
      }
    />
  );
};
