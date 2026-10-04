import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useRemotionEnvironment,
  useVideoConfig,
} from "remotion";
import { color, font } from "../theme";

// Shared pieces every scene sits in: the background, the browser window, captions and TODO badges.

export const Stage = ({ children }: { children: ReactNode }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(120% 90% at 50% 0%, ${color.stageTop} 0%, ${color.stageBottom} 100%)`,
      fontFamily: font.sans,
      color: color.foreground,
    }}
  >
    {children}
  </AbsoluteFill>
);

/** Spring from 0 to 1 starting at `delay` frames. */
export const useEnter = (delay = 0, damping = 200) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
};

export const BrowserFrame = ({
  width,
  height,
  url = "localhost:5173",
  children,
}: {
  width: number;
  height: number;
  url?: string;
  children: ReactNode;
}) => {
  const enter = useEnter(0, 120);
  const bar = 44;
  return (
    <div
      style={{
        width,
        height: height + bar,
        borderRadius: 18,
        overflow: "hidden",
        background: "white",
        boxShadow: "0 40px 80px -20px rgba(20, 50, 30, 0.35), 0 0 0 1px rgba(20, 50, 30, 0.08)",
        transform: `translateY(${interpolate(enter, [0, 1], [40, 0])}px) scale(${interpolate(enter, [0, 1], [0.96, 1])})`,
        opacity: enter,
      }}
    >
      <div
        style={{
          height: bar,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 18px",
          background: color.page,
          borderBottom: `1px solid ${color.border}`,
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
        ))}
        <div
          style={{
            marginLeft: 18,
            flex: 1,
            maxWidth: 520,
            height: 26,
            borderRadius: 8,
            background: "white",
            border: `1px solid ${color.border}`,
            fontSize: 15,
            color: color.muted,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
          }}
        >
          {url}
        </div>
      </div>
      <div style={{ width, height, position: "relative", overflow: "hidden" }}>{children}</div>
    </div>
  );
};

export const Caption = ({ text }: { text: string }) => {
  const enter = useEnter(8);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 48,
        display: "flex",
        justifyContent: "center",
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [16, 0])}px)`,
      }}
    >
      <div
        style={{
          maxWidth: 1500,
          padding: "16px 30px",
          borderRadius: 16,
          background: "rgba(255, 255, 255, 0.9)",
          boxShadow: "0 10px 30px -10px rgba(20, 50, 30, 0.3)",
          fontSize: 34,
          fontWeight: 500,
          lineHeight: 1.3,
          textAlign: "center",
          textWrap: "balance",
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** A note to self that only shows in the studio, never in a render. */
export const TodoBadge = ({ text }: { text: string }) => {
  const env = useRemotionEnvironment();
  if (!env.isStudio) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        right: 20,
        padding: "8px 14px",
        borderRadius: 8,
        background: color.highlight,
        fontFamily: font.mono,
        fontSize: 20,
        fontWeight: 500,
      }}
    >
      TODO: {text}
    </div>
  );
};

/** Stands in for a screenshot or recording that hasn't been taken yet. */
export const Placeholder = ({ label, style }: { label: string; style?: CSSProperties }) => (
  <AbsoluteFill
    style={{
      alignItems: "center",
      justifyContent: "center",
      background: `repeating-linear-gradient(45deg, ${color.page} 0 24px, white 24px 48px)`,
      border: `4px dashed ${color.border}`,
      color: color.muted,
      fontSize: 36,
      fontWeight: 500,
      textAlign: "center",
      padding: 80,
      ...style,
    }}
  >
    {label}
  </AbsoluteFill>
);
