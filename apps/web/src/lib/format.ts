const rtf = new Intl.RelativeTimeFormat("en-AU", { numeric: "auto" });

/** "just now", "5 minutes ago", "yesterday", or a date once it's over a week old. */
export function timeAgo(isoString: string, now = Date.now()): string {
  const seconds = Math.round((new Date(isoString).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86_400) return rtf.format(Math.round(seconds / 86_400), "day");
  return formatDate(isoString);
}

/** `2026-09-14` -> "14 Sep 2026". */
export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** `YYYY-MM-DD` for `days` ago, for the "since" presets. */
export function daysAgo(days: number, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
