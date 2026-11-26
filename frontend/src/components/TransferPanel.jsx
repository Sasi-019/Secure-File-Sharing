import { useEffect, useState } from "react";

import { formatBytes, formatDuration, formatSpeed } from "./charts/format";
import { etaSeconds, formatEta, percentDone } from "../services/rate";

// If no data has arrived for this long, the speed is shown as 0.
const STALL_MS = 2500;

// Pick a readable unit for the vertical axis.
function speedUnit(maxBytes) {
  if (maxBytes >= 1024 ** 2) return { name: "MB/s", div: 1024 ** 2 };
  if (maxBytes >= 1024) return { name: "KB/s", div: 1024 };
  return { name: "B/s", div: 1 };
}

// Round the top of an axis up to a "nice" number and give evenly spaced ticks.
function niceTicks(max, count = 5) {
  const raw = max / count || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) || raw;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

// Live speed chart: transfer rate against time, with axes, grid and a peak label.
function SpeedGraph({ points, endSeconds, color, label }) {
  const W = 640;
  const H = 300;
  const m = { l: 62, r: 20, t: 18, b: 52 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;

  const data = points.length ? points : [{ t: 0, rate: 0 }];
  const xMax = Math.max(endSeconds, data[data.length - 1].t, 5);
  const peak = data.reduce((best, p) => (p.rate > best.rate ? p : best), data[0]);
  const unit = speedUnit(peak.rate);
  const yTicks = niceTicks(Math.max(peak.rate / unit.div, 0.001));
  const yMax = yTicks[yTicks.length - 1];
  const xTicks = niceTicks(xMax, 6);
  const xEnd = xTicks[xTicks.length - 1];

  const X = (t) => m.l + (t / xEnd) * pw;
  const Y = (rate) => m.t + ph - (rate / unit.div / yMax) * ph;

  const pts = [{ t: 0, rate: 0 }, ...data.filter((p) => p.t > 0)];
  const line = pts.map((p) => `${X(p.t).toFixed(1)},${Y(p.rate).toFixed(1)}`).join(" ");
  const area = `${X(0)},${Y(0)} ${line} ${X(pts[pts.length - 1].t)},${Y(0)}`;
  const fmt = (v) => (Number.isInteger(v) ? v : v.toFixed(v < 10 ? 1 : 0));

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${W} ${H}`}
      data-testid="speed-graph"
      className="mt-4 w-full rounded-xl bg-slate-950"
    >
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={m.l} x2={W - m.r} y1={Y(v * unit.div)} y2={Y(v * unit.div)} stroke="#334155" strokeWidth="1" />
          <text x={m.l - 8} y={Y(v * unit.div) + 4} textAnchor="end" fontSize="12" fill="#94a3b8">
            {fmt(v)}
          </text>
        </g>
      ))}
      {xTicks.map((v) => (
        <g key={`x${v}`}>
          <line x1={X(v)} x2={X(v)} y1={m.t} y2={m.t + ph} stroke="#1e293b" strokeWidth="1" />
          <text x={X(v)} y={m.t + ph + 18} textAnchor="middle" fontSize="12" fill="#94a3b8">
            {fmt(v)}
          </text>
        </g>
      ))}
      <line x1={m.l} x2={m.l} y1={m.t} y2={m.t + ph} stroke="#64748b" strokeWidth="1.5" />
      <line x1={m.l} x2={W - m.r} y1={m.t + ph} y2={m.t + ph} stroke="#64748b" strokeWidth="1.5" />

      <polygon points={area} fill={color} opacity="0.3" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {pts.length <= 40 &&
        pts.map((p, i) => (
          <circle key={i} cx={X(p.t)} cy={Y(p.rate)} r="3.5" fill="#0f172a" stroke={color} strokeWidth="2" />
        ))}

      {peak.rate > 0 && (
        <g>
          <circle cx={X(peak.t)} cy={Y(peak.rate)} r="6" fill={color} stroke="#fff" strokeWidth="2" />
          <text
            x={Math.min(Math.max(X(peak.t), m.l + 60), W - m.r - 60)}
            y={Math.max(Y(peak.rate) - 12, m.t + 12)}
            textAnchor="middle"
            fontSize="12"
            fontWeight="600"
            fill="#e2e8f0"
          >
            Peak ({fmt(peak.rate / unit.div)} {unit.name})
          </text>
        </g>
      )}

      <text x={m.l + pw / 2} y={H - 8} textAnchor="middle" fontSize="13" fill="#cbd5e1">
        Time (seconds)
      </text>
      <text
        transform={`translate(15 ${m.t + ph / 2}) rotate(-90)`}
        textAnchor="middle"
        fontSize="13"
        fill="#cbd5e1"
      >
        Transfer rate ({unit.name})
      </text>
    </svg>
  );
}

function TransferRow({ transfer, now, onCancel, onDismiss }) {
  const isUpload = transfer.kind === "upload";
  const active = transfer.status === "active";
  const percent =
    transfer.status === "done" ? 100 : percentDone(transfer.loaded, transfer.total);

  const stalled = active && now - transfer.lastEventAt > STALL_MS;
  const speed = active && !stalled ? transfer.rate : 0;
  const eta = active ? formatEta(etaSeconds(transfer.loaded, transfer.total, speed)) : "";

  // An upload that is fully sent is now being saved to cloud storage.
  const saving = active && isUpload && transfer.total > 0 && transfer.loaded >= transfer.total;

  let detail;

  if (transfer.status === "done") {
    detail = `Done · average ${formatSpeed(transfer.averageRate)} · ${formatDuration(transfer.durationMs)}`;
  } else if (transfer.status === "error") {
    detail = transfer.error || "The transfer failed.";
  } else if (transfer.status === "cancelled") {
    detail = "Cancelled";
  } else if (saving) {
    detail = "Sent · saving to cloud storage…";
  } else {
    detail = `${formatBytes(transfer.loaded)} of ${formatBytes(transfer.total)}${eta ? ` · ${eta} left` : ""}`;
  }

  const barColor =
    transfer.status === "error" || transfer.status === "cancelled"
      ? "bg-red-500"
      : transfer.status === "done"
        ? "bg-emerald-500"
        : isUpload
          ? "bg-indigo-500"
          : "bg-emerald-400";

  return (
    <li className="rounded-2xl border-2 border-slate-600 bg-slate-900 p-5 shadow-2xl shadow-black/60 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {isUpload ? "⬆ Uploading" : "⬇ Downloading"}
          </p>
          <p className="truncate text-lg font-semibold text-white" title={transfer.name}>
            {transfer.name}
          </p>
        </div>

        {active ? (
          <div className="text-right">
            <p
              aria-live="off"
              data-testid={`rate-${transfer.id}`}
              className="text-2xl font-bold text-white"
            >
              {saving ? "—" : formatSpeed(speed)}
            </p>
            <p className="text-xs text-slate-400">{percent}%</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onDismiss(transfer.id)}
            aria-label="Dismiss"
            className="rounded-md px-2 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`${isUpload ? "Upload" : "Download"} progress for ${transfer.name}`}
        className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {(active || transfer.status === "done") && (
        <SpeedGraph
          points={
            active && stalled
              ? [...(transfer.history || []), { t: (now - transfer.startedAt) / 1000, rate: 0 }]
              : transfer.history || []
          }
          endSeconds={
            transfer.status === "done" && transfer.durationMs != null
              ? transfer.durationMs / 1000
              : (now - transfer.startedAt) / 1000
          }
          color={isUpload ? "#818cf8" : "#34d399"}
          label={`Live ${isUpload ? "upload" : "download"} speed graph`}
        />
      )}

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-300">{detail}</p>

        {active && !isUpload && (
          <button
            type="button"
            onClick={() => onCancel(transfer.id)}
            className="shrink-0 rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:border-red-500 hover:text-red-300"
          >
            Cancel
          </button>
        )}
      </div>
    </li>
  );
}

// Floating list of uploads and downloads with their live speed.
export default function TransferPanel({ transfers, onCancel, onDismiss }) {
  const [now, setNow] = useState(() => performance.now());
  const anyActive = transfers.some((transfer) => transfer.status === "active");

  // Re-draw twice a second while something is moving, so the speed drops to
  // zero when a connection stalls instead of freezing on the last value.
  useEffect(() => {
    if (!anyActive) return undefined;

    const id = window.setInterval(() => setNow(performance.now()), 500);

    return () => window.clearInterval(id);
  }, [anyActive]);

  if (transfers.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="File transfers"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto"
      >
        <ul className="space-y-4">
          {transfers.map((transfer) => (
            <TransferRow
              key={transfer.id}
              transfer={transfer}
              now={now}
              onCancel={onCancel}
              onDismiss={onDismiss}
            />
          ))}
        </ul>
      </aside>
    </div>
  );
}
