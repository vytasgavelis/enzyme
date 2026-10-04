import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { color, font } from "../theme";
import { Caption, Stage, useEnter } from "./chrome";

// Scenes drawn entirely in Remotion: no screenshot, just real numbers from the app.

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

const Eyebrow = ({ text }: { text: string }) => (
  <div
    style={{
      fontSize: 28,
      fontWeight: 600,
      color: color.primary,
      textTransform: "uppercase",
      letterSpacing: 3,
    }}
  >
    {text}
  </div>
);

/** Counts from 0 to `to` between two frames, with thousands separators. */
const useCount = (to: number, from: number, until: number) => {
  const frame = useCurrentFrame();
  const v = interpolate(frame, [from, until], [0, to], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return Math.round(v).toLocaleString("en-US");
};

/** Paper titles streaming upwards behind a statement, with a counter. */
export const FloodScene = ({
  eyebrow,
  lines,
  counter,
  titles,
}: {
  eyebrow?: string;
  lines: string[];
  counter: { to: number; label: string };
  titles: string[];
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const columns = [0, 1, 2];
  const count = useCount(counter.to, fps * 0.8, fps * 4);
  return (
    <Stage>
      {/* The wall of titles, faded towards the left so the text stays readable. */}
      <AbsoluteFill
        style={{
          left: 820,
          display: "flex",
          flexDirection: "row",
          gap: 24,
          padding: "0 24px",
          maskImage: "linear-gradient(90deg, transparent 0%, black 30%, black 100%)",
          WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 30%, black 100%)",
        }}
      >
        {columns.map((c) => (
          <div
            key={c}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              transform: `translateY(${-frame * (2.2 + c * 0.7) - c * 140}px)`,
            }}
          >
            {titles
              .filter((_, i) => i % columns.length === c)
              .map((t) => (
                <div
                  key={t}
                  style={{
                    background: "rgba(255, 255, 255, 0.75)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    fontSize: 17,
                    fontWeight: 600,
                    lineHeight: 1.3,
                    color: color.foreground,
                    boxShadow: "0 6px 16px -10px rgba(20, 50, 30, 0.35)",
                  }}
                >
                  {t}
                </div>
              ))}
          </div>
        ))}
      </AbsoluteFill>
      <AbsoluteFill
        style={{ justifyContent: "center", padding: "0 0 0 160px", width: 840, gap: 30 }}
      >
        {eyebrow && (
          <Rise delay={0}>
            <Eyebrow text={eyebrow} />
          </Rise>
        )}
        {lines.map((line, i) => (
          <Rise key={line} delay={6 + i * 45}>
            <div style={{ fontSize: 52, fontWeight: 600, lineHeight: 1.2, textWrap: "balance" }}>
              {line}
            </div>
          </Rise>
        ))}
        <Rise delay={20}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 10 }}>
            <div
              style={{
                fontSize: 96,
                fontWeight: 700,
                color: color.primary,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {count}
            </div>
            <div style={{ fontSize: 30, color: color.muted, maxWidth: 340 }}>{counter.label}</div>
          </div>
        </Rise>
      </AbsoluteFill>
    </Stage>
  );
};

/** The query agent's loop: write a query, count its hits with a tool, narrow, repeat. */
export const AgentScene = ({
  eyebrow,
  prompt,
  tool,
  steps,
  caption,
}: {
  eyebrow?: string;
  prompt: string;
  tool: string;
  steps: { query: string; hits: number; verdict: string; ok: boolean }[];
  caption?: string;
}) => {
  const { fps } = useVideoConfig();
  const stepStart = (i: number) => Math.round(fps * (1.4 + i * 2));
  return (
    <Stage>
      <AbsoluteFill style={{ padding: "70px 200px 0", gap: 26 }}>
        {eyebrow && (
          <Rise delay={0}>
            <Eyebrow text={eyebrow} />
          </Rise>
        )}
        <Rise delay={4}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34 }}>
            <span style={{ color: color.muted }}>They type</span>
            <span
              style={{
                background: "white",
                borderRadius: 14,
                padding: "10px 22px",
                fontWeight: 600,
                boxShadow: "0 8px 20px -12px rgba(20, 50, 30, 0.4)",
              }}
            >
              “{prompt}”
            </span>
          </div>
        </Rise>
        {steps.map((s, i) => (
          <AgentStep key={s.query} step={s} index={i} tool={tool} delay={stepStart(i)} />
        ))}
      </AbsoluteFill>
      {caption && <Caption text={caption} />}
    </Stage>
  );
};

const AgentStep = ({
  step,
  index,
  tool,
  delay,
}: {
  step: { query: string; hits: number; verdict: string; ok: boolean };
  index: number;
  tool: string;
  delay: number;
}) => {
  const { fps } = useVideoConfig();
  const enter = useEnter(delay);
  const count = useCount(step.hits, delay + fps * 0.5, delay + fps * 1.3);
  const verdict = useEnter(delay + fps * 1.3);
  const tone = step.ok ? color.primary : "oklch(0.62 0.15 60)";
  return (
    <div
      style={{
        opacity: enter,
        transform: `translateX(${interpolate(enter, [0, 1], [-40, 0])}px)`,
        display: "grid",
        gridTemplateColumns: "56px 1fr 300px",
        alignItems: "center",
        gap: 24,
        background: "rgba(255, 255, 255, 0.85)",
        borderRadius: 18,
        padding: "20px 28px",
        boxShadow: "0 12px 30px -18px rgba(20, 50, 30, 0.45)",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          background: color.primarySoft,
          color: color.primary,
          fontSize: 26,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {index + 1}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 18, color: color.muted, fontFamily: font.mono }}>
          Gemma writes a query → {tool}
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 23, lineHeight: 1.35 }}>{step.query}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 52, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {count}
        </div>
        <div
          style={{
            display: "inline-block",
            marginTop: 4,
            padding: "4px 14px",
            borderRadius: 999,
            fontSize: 21,
            fontWeight: 600,
            color: "white",
            background: tone,
            opacity: verdict,
            transform: `scale(${interpolate(verdict, [0, 1], [0.8, 1])})`,
          }}
        >
          {step.verdict}
        </div>
      </div>
    </div>
  );
};

export const StatsScene = ({
  eyebrow,
  title,
  tiles,
  caption,
}: {
  eyebrow?: string;
  title: string;
  tiles: { value: string; label: string }[];
  caption?: string;
}) => (
  <Stage>
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 160px 140px", gap: 50 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {eyebrow && (
          <Rise delay={0}>
            <Eyebrow text={eyebrow} />
          </Rise>
        )}
        <Rise delay={6}>
          <div style={{ fontSize: 58, fontWeight: 600, lineHeight: 1.2, textWrap: "balance" }}>
            {title}
          </div>
        </Rise>
      </div>
      <div style={{ display: "flex", gap: 32 }}>
        {tiles.map((t, i) => (
          <Rise key={t.label} delay={24 + i * 14}>
            <div
              style={{
                width: 500,
                background: "rgba(255, 255, 255, 0.88)",
                borderRadius: 24,
                padding: "34px 36px",
                boxShadow: "0 16px 40px -22px rgba(20, 50, 30, 0.5)",
              }}
            >
              <div
                style={{
                  fontSize: 64,
                  fontWeight: 700,
                  color: color.primary,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {t.value}
              </div>
              <div style={{ fontSize: 28, color: color.muted, marginTop: 6, lineHeight: 1.3 }}>
                {t.label}
              </div>
            </div>
          </Rise>
        ))}
      </div>
    </AbsoluteFill>
    {caption && <Caption text={caption} />}
  </Stage>
);
