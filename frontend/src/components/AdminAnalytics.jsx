import { useCallback, useEffect, useState } from "react";

import Chart from "./charts/Chart";
import {
  formatBucketLabel,
  formatBytes,
  formatDuration,
  formatSpeed,
} from "./charts/format";
import {
  getAdminAnalytics,
  getAdminDownloadHistory,
  getAdminUserActivity,
} from "../services/api";

const UPLOAD_COLOR = "#818cf8";
const DOWNLOAD_COLOR = "#34d399";

const PERIODS = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

const HISTORY_PAGE_SIZE = 10;

const sum = (values) =>
  (values || []).reduce((total, value) => total + (Number(value) || 0), 0);

function Panel({ children }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      {children}
    </div>
  );
}

function Summary({ label, value, detail }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

const STATUS_STYLES = {
  completed: "bg-emerald-500/15 text-emerald-300",
  aborted: "bg-amber-500/15 text-amber-300",
  started: "bg-slate-700 text-slate-200",
};

export default function AdminAnalytics() {
  const [period, setPeriod] = useState("day");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activity, setActivity] = useState(null);

  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // Graphs follow the selected period.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const result = await getAdminAnalytics(period);

        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail ||
              "Could not load the analytics. Please try again."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [period]);

  // User activity: last 30 days.
  useEffect(() => {
    let cancelled = false;

    getAdminUserActivity(30)
      .then((result) => {
        if (!cancelled) setActivity(result);
      })
      .catch((err) => {
        console.error("Could not load user activity:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadHistory = useCallback(async (offset) => {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const result = await getAdminDownloadHistory(
        HISTORY_PAGE_SIZE,
        offset
      );

      setHistoryTotal(result.total);
      setHistory((previous) =>
        offset === 0 ? result.downloads : [...previous, ...result.downloads]
      );
    } catch (err) {
      setHistoryError(
        err.response?.data?.detail ||
          "Could not load the download history."
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory(0);
  }, [loadHistory]);

  const labelFormatter = (label) => formatBucketLabel(label, period);

  const trackingSince = data?.tracking_since
    ? new Date(data.tracking_since).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <section className="mb-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-purple-400">
            ADMINISTRATOR
          </p>

          <h2 className="mt-2 text-xl font-bold text-white">
            Transfer analytics
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Uploads, downloads, speed, storage and user activity.
          </p>
        </div>

        <div
          role="group"
          aria-label="Time period"
          className="flex rounded-xl border border-slate-700 p-1"
        >
          {PERIODS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setPeriod(item.value)}
              aria-pressed={period === item.value}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                period === item.value
                  ? "bg-indigo-600 text-white"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs text-slate-400">
        {trackingSince
          ? `Transfers are recorded from ${trackingSince}. Earlier activity was never tracked, so it is not shown. `
          : "No transfers have been recorded yet. Graphs fill in as people upload and download. "}
        Storage history comes from the file library itself.
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {loading && !data ? (
        <Panel>
          <p className="py-8 text-center text-sm text-slate-400">
            Loading analytics...
          </p>
        </Panel>
      ) : data ? (
        <div
          className={`space-y-4 transition-opacity ${
            loading ? "opacity-60" : ""
          }`}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Summary
              label="Uploads"
              value={sum(data.uploads.count)}
              detail="In the period shown"
            />
            <Summary
              label="Downloads"
              value={sum(data.downloads.count)}
              detail="In the period shown"
            />
            <Summary
              label="Uploaded"
              value={formatBytes(sum(data.uploads.bytes))}
              detail="Data received"
            />
            <Summary
              label="Downloaded"
              value={formatBytes(sum(data.downloads.bytes))}
              detail="Data sent"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <Chart
                title="Upload & download activity"
                type="bar"
                labels={data.labels}
                formatLabel={labelFormatter}
                series={[
                  { name: "Uploads", color: UPLOAD_COLOR, values: data.uploads.count },
                  { name: "Downloads", color: DOWNLOAD_COLOR, values: data.downloads.count },
                ]}
              />
            </Panel>

            <Panel>
              <Chart
                title="Transfer volume"
                type="bar"
                labels={data.labels}
                formatLabel={labelFormatter}
                formatValue={formatBytes}
                series={[
                  { name: "Uploaded", color: UPLOAD_COLOR, values: data.uploads.bytes },
                  { name: "Downloaded", color: DOWNLOAD_COLOR, values: data.downloads.bytes },
                ]}
              />
            </Panel>

            <Panel>
              <Chart
                title="Upload & download speed"
                labels={data.labels}
                formatLabel={labelFormatter}
                formatValue={formatSpeed}
                emptyText="No timed transfers in this period yet."
                series={[
                  { name: "Upload speed", color: UPLOAD_COLOR, values: data.uploads.speed_bytes_per_second },
                  { name: "Download speed", color: DOWNLOAD_COLOR, values: data.downloads.speed_bytes_per_second },
                ]}
              />
            </Panel>

            <Panel>
              <Chart
                title="Average transfer duration"
                labels={data.labels}
                formatLabel={labelFormatter}
                formatValue={formatDuration}
                emptyText="No timed transfers in this period yet."
                series={[
                  { name: "Upload", color: UPLOAD_COLOR, values: data.uploads.average_duration_ms },
                  { name: "Download", color: DOWNLOAD_COLOR, values: data.downloads.average_duration_ms },
                ]}
              />
            </Panel>

            <Panel>
              <Chart
                title="Storage used over time"
                type="area"
                labels={data.labels}
                formatLabel={labelFormatter}
                formatValue={formatBytes}
                series={[
                  { name: "Storage", color: "#a78bfa", values: data.storage_bytes },
                ]}
              />
            </Panel>

            <Panel>
              <Chart
                title="Active users"
                labels={data.labels}
                formatLabel={labelFormatter}
                emptyText="No user activity recorded in this period yet."
                series={[
                  { name: "Active users", color: "#fbbf24", values: data.active_users },
                ]}
              />
            </Panel>
          </div>
        </div>
      ) : null}

      {/* User activity */}
      <div className="mt-4">
        <Panel>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-200">
              Most active users · last 30 days
            </h3>

            {activity && (
              <p className="text-xs text-slate-400">
                {activity.active_users} active{" "}
                {activity.active_users === 1 ? "user" : "users"}
              </p>
            )}
          </div>

          {!activity || activity.users.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              No user activity recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">User</th>
                    <th className="py-2 pr-3 font-medium">Uploads</th>
                    <th className="py-2 pr-3 font-medium">Downloads</th>
                    <th className="py-2 pr-3 font-medium">Data moved</th>
                    <th className="py-2 font-medium">Last active</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {activity.users.map((row) => (
                    <tr key={row.user_id}>
                      <td className="py-2 pr-3 text-white">
                        {row.name || `User #${row.user_id}`}
                      </td>
                      <td className="py-2 pr-3">{row.uploads}</td>
                      <td className="py-2 pr-3">{row.downloads}</td>
                      <td className="py-2 pr-3">{formatBytes(row.bytes_moved)}</td>
                      <td className="py-2 text-slate-400">
                        {row.last_active
                          ? new Date(row.last_active).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* Download history */}
      <div className="mt-4">
        <Panel>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-200">
              Download history
            </h3>

            <p className="text-xs text-slate-400">
              {historyTotal} recorded
            </p>
          </div>

          {historyError && (
            <p role="alert" className="mb-3 text-sm text-red-300">
              {historyError}
            </p>
          )}

          {history.length === 0 && !historyLoading ? (
            <p className="py-4 text-center text-sm text-slate-500">
              No downloads recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">File</th>
                    <th className="py-2 pr-3 font-medium">User</th>
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Size</th>
                    <th className="py-2 pr-3 font-medium">Speed</th>
                    <th className="py-2 pr-3 font-medium">Duration</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td className="max-w-[200px] break-words py-2 pr-3 text-white">
                        {row.movie_title || "Deleted file"}
                      </td>
                      <td className="py-2 pr-3">
                        {row.user_name || "Deleted user"}
                      </td>
                      <td className="py-2 pr-3 text-slate-400">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        {formatBytes(row.bytes_transferred)}
                      </td>
                      <td className="py-2 pr-3">
                        {formatSpeed(row.speed_bytes_per_second)}
                      </td>
                      <td className="py-2 pr-3">
                        {formatDuration(row.duration_ms)}
                      </td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_STYLES[row.status] || STATUS_STYLES.started
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {history.length < historyTotal && (
            <button
              type="button"
              onClick={() => loadHistory(history.length)}
              disabled={historyLoading}
              className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-indigo-500 hover:text-white disabled:opacity-50"
            >
              {historyLoading ? "Loading..." : "Load more"}
            </button>
          )}
        </Panel>
      </div>
    </section>
  );
}
