import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { color, font } from "../theme";
import { Stage, useEnter } from "./chrome";

const Logo = ({ size }: { size: number }) => (
  // The flask from the app's sidebar (lucide "flask-conical").
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color.primary}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" />
    <path d="M6.453 15h11.094" />
    <path d="M8.5 2h7" />
  </svg>
);

const Rise = ({ delay, children }: { delay: number; children: React.ReactNode }) => {
  const enter = useEnter(delay);
  return (
    <div
      style={{ opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)` }}
    >
      {children}
    </div>
  );
};

/** A line on its own that fades out before the title arrives. */
const Lead = ({ text, until }: { text: string; until: number }) => {
  const frame = useCurrentFrame();
  const enter = useEnter(0);
  const exit = interpolate(frame, [until - 12, until], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        opacity: Math.min(enter, exit),
        fontSize: 56,
        fontWeight: 600,
        padding: "0 260px",
        textAlign: "center",
        textWrap: "balance",
        lineHeight: 1.25,
      }}
    >
      {text}
    </AbsoluteFill>
  );
};

export const TitleScene = ({
  title,
  subtitle,
  lead,
}: {
  title: string;
  subtitle?: string;
  lead?: string;
}) => {
  const { fps } = useVideoConfig();
  const start = lead ? Math.round(fps * 2.8) : 0;
  return (
    <Stage>
      {lead && <Lead text={lead} until={start} />}
      <TitleBody title={title} subtitle={subtitle} start={start} />
    </Stage>
  );
};

const TitleBody = ({
  title,
  subtitle,
  start,
}: {
  title: string;
  subtitle?: string;
  start: number;
}) => (
  <>
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 36 }}>
      <Rise delay={start}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <Logo size={120} />
          <div style={{ fontSize: 150, fontWeight: 700, letterSpacing: -4 }}>{title}</div>
        </div>
      </Rise>
      {subtitle && (
        <Rise delay={start + 12}>
          <div
            style={{
              fontSize: 44,
              color: color.muted,
              maxWidth: 1300,
              textAlign: "center",
              textWrap: "balance",
            }}
          >
            {subtitle}
          </div>
        </Rise>
      )}
    </AbsoluteFill>
  </>
);

export const StatementScene = ({ lines, eyebrow }: { lines: string[]; eyebrow?: string }) => (
  <Stage>
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 220px", gap: 40 }}>
      {eyebrow && (
        <Rise delay={0}>
          <div
            style={{
              fontSize: 30,
              fontWeight: 600,
              color: color.primary,
              textTransform: "uppercase",
              letterSpacing: 3,
            }}
          >
            {eyebrow}
          </div>
        </Rise>
      )}
      {lines.map((line, i) => (
        <Rise key={line} delay={8 + i * 30}>
          <div style={{ fontSize: 62, fontWeight: 600, lineHeight: 1.2, textWrap: "balance" }}>
            {line}
          </div>
        </Rise>
      ))}
    </AbsoluteFill>
  </Stage>
);

export const OutroScene = ({ title, lines }: { title: string; lines: string[] }) => (
  <Stage>
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 28 }}>
      <Rise delay={0}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Logo size={88} />
          <div style={{ fontSize: 110, fontWeight: 700, letterSpacing: -3 }}>{title}</div>
        </div>
      </Rise>
      {lines.map((line, i) => (
        <Rise key={line} delay={10 + i * 8}>
          <div
            style={{
              fontSize: 38,
              color: i === 0 ? color.foreground : color.muted,
              fontFamily: i === 0 ? font.mono : font.sans,
            }}
          >
            {line}
          </div>
        </Rise>
      ))}
    </AbsoluteFill>
  </Stage>
);
