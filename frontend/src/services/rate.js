// Live transfer speed, measured in the browser while a file moves.
//
// The speed shown is the average over the last few seconds (a sliding
// window), so it reacts to changes but does not jump on every progress
// event. All functions are pure, so they can be tested without a browser.

export class RateMeter {
  constructor(windowMs = 3000) {
    this.windowMs = windowMs;
    this.samples = [];
    this.startedAt = null;
  }

  start(now = performance.now()) {
    this.startedAt = now;
    this.samples = [{ t: now, loaded: 0 }];
  }

  // Record that ``loaded`` bytes have moved in total so far.
  push(loaded, now = performance.now()) {
    if (this.startedAt == null) this.start(now);

    this.samples.push({ t: now, loaded: Number(loaded) || 0 });

    // Forget samples older than the window, but always keep two points.
    const cutoff = now - this.windowMs;

    while (this.samples.length > 2 && this.samples[1].t <= cutoff) {
      this.samples.shift();
    }
  }

  // Bytes per second right now (0 until something has moved).
  rate(now = null) {
    if (this.samples.length < 2) return 0;

    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const end = now == null ? last.t : Math.max(now, last.t);

    const elapsed = end - first.t;

    if (elapsed <= 0) return 0;

    return Math.max(0, ((last.loaded - first.loaded) * 1000) / elapsed);
  }

  // Bytes per second since the transfer began.
  average(now = performance.now()) {
    if (this.startedAt == null || this.samples.length === 0) return 0;

    const last = this.samples[this.samples.length - 1];
    const elapsed = now - this.startedAt;

    if (elapsed <= 0) return 0;

    return Math.max(0, (last.loaded * 1000) / elapsed);
  }
}

// Seconds left at the current speed, or null when it cannot be known.
export function etaSeconds(loaded, total, bytesPerSecond) {
  if (!total || !bytesPerSecond || bytesPerSecond <= 0) return null;

  const left = Math.max(0, total - loaded);

  return left / bytesPerSecond;
}

export function formatEta(seconds) {
  if (seconds == null) return "";

  if (seconds < 1) return "less than a second";
  if (seconds < 60) return `${Math.ceil(seconds)} s`;

  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);

  return `${minutes}m ${rest}s`;
}

// Whole-number percentage, never above 100 (upload bodies carry a little
// extra form data, so ``loaded`` can slightly exceed the file size).
export function percentDone(loaded, total) {
  if (!total || total <= 0) return 0;

  return Math.max(0, Math.min(100, Math.floor((loaded / total) * 100)));
}
