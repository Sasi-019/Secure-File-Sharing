// Formatting helpers shared by the dashboards.

export function formatBytes(bytes) {
  const size = Number(bytes) || 0;

  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;

  return `${(size / 1024 ** 3).toFixed(2)} GB`;
}

// Speed arrives in bytes per second; null means "not measured".
export function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond == null) return "—";

  return `${formatBytes(bytesPerSecond)}/s`;
}

// Duration arrives in milliseconds; null means "not measured".
export function formatDuration(milliseconds) {
  if (milliseconds == null) return "—";

  const ms = Number(milliseconds);

  if (ms < 1000) return `${Math.round(ms)} ms`;

  const seconds = ms / 1000;

  if (seconds < 60) return `${seconds.toFixed(1)} s`;

  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);

  return `${minutes}m ${rest}s`;
}

// "2026-10-26" -> "26 Oct". Parsed by hand so the browser's time zone can
// never shift the day.
export function formatBucketLabel(isoDate, period = "day") {
  const [year, month, day] = String(isoDate).split("-").map(Number);

  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString(
    undefined,
    { month: "short", timeZone: "UTC" }
  );

  if (period === "month") return `${monthName} ${String(year).slice(2)}`;

  return `${day} ${monthName}`;
}
