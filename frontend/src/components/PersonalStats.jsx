import { useCallback, useEffect, useState } from "react";

import Chart from "./charts/Chart";
import StatCard from "./StatCard";
import { formatBucketLabel, formatSpeed } from "./charts/format";
import { getMyStats } from "../services/api";

// The signed-in user's OWN statistics. Platform-wide analytics are
// administrator-only and are not shown here.
export default function PersonalStats({ refreshKey = 0 }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setStats(await getMyStats());
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Could not load your statistics."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-indigo-400">
            Your activity
          </p>

          <h2 className="mt-2 text-2xl font-bold">My statistics</h2>

          <p className="mt-1 text-sm text-slate-400">
            Only your own uploads and downloads are counted here.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-indigo-500 hover:text-white disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Upload rate"
              value={formatSpeed(stats.upload_speed_bytes_per_second)}
              detail="Average speed of your uploads"
              icon="📤"
            />

            <StatCard
              label="Download rate"
              value={formatSpeed(stats.download_speed_bytes_per_second)}
              detail="Average speed of your downloads"
              icon="📥"
            />

            <StatCard
              label="Previous downloads"
              value={stats.downloads}
              detail="Files you have downloaded"
              icon="📄"
            />

            <StatCard
              label="Uploads"
              value={stats.uploads}
              detail="Files you have uploaded"
              icon="⬆️"
            />
          </div>

          <div className="mt-5">
            <Chart
              title="Your activity · last 14 days"
              type="bar"
              labels={stats.labels}
              formatLabel={(label) => formatBucketLabel(label, "day")}
              emptyText="No uploads or downloads in the last 14 days."
              series={[
                { name: "Uploads", color: "#818cf8", values: stats.daily_uploads },
                { name: "Downloads", color: "#34d399", values: stats.daily_downloads },
              ]}
            />
          </div>

          <p className="mt-3 text-xs text-slate-500">
            {stats.tracking_since
              ? `Recorded since ${new Date(
                  stats.tracking_since
                ).toLocaleDateString()}. A rate shows “—” until one of your transfers has been timed.`
              : "Nothing recorded yet. Your numbers appear after your first upload or download."}
          </p>
        </>
      )}
    </section>
  );
}
