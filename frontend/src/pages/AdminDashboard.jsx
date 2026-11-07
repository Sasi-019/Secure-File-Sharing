import StatCard from "../components/StatCard";

export default function AdminDashboard({ stats }) {
  const formatStorage = (bytes) => {
    const size = Number(bytes) || 0;

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(2)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <section className="mb-8">
      <div className="mb-4">
        <p className="text-sm font-medium text-purple-400">
          ADMINISTRATOR
        </p>

        <h2 className="mt-2 text-xl font-bold text-white">
          Platform overview
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Monitor registered users, files, and cloud storage usage.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Registered users"
          value={stats?.total_users ?? "—"}
          detail="Total accounts on the platform"
          icon="👥"
        />

        <StatCard
          label="Total files"
          value={stats?.total_movies ?? "—"}
          detail="Files stored on the platform"
          icon="📁"
        />

        <StatCard
          label="Platform storage"
          value={
            stats ? formatStorage(stats.total_storage_bytes) : "—"
          }
          detail="Total file storage used"
          icon="☁️"
        />
      </div>
    </section>
  );
}