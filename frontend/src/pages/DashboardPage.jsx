import { useEffect, useMemo, useState } from "react";

import StatCard from "../components/StatCard";
import MovieCard from "../components/MovieCard";
import UploadForm from "../components/UploadForm";
import AdminDashboard from "./AdminDashboard";
import ManageUsers from "../components/ManageUsers";
import AdminAnalytics from "../components/AdminAnalytics";
import PersonalStats from "../components/PersonalStats";
import ShareDialog from "../components/ShareDialog";
import { CATEGORY_META } from "../components/fileCategories";

const TABS = [
  { key: "mine", label: "My files" },
  { key: "public", label: "Public files" },
  { key: "shared", label: "Shared with me" },
];

const formatStorage = (bytes) => {
  const size = Number(bytes) || 0;

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  if (size < 1024 ** 3) {
    return `${(size / 1024 ** 2).toFixed(1)} MB`;
  }

  return `${(size / 1024 ** 3).toFixed(2)} GB`;
};

export default function DashboardPage({
  user,
  movies = [],
  adminStats,
  loadingMovies,
  uploading,
  uploadProgress = null,
  downloadingIds = [],
  deletingMovieId,
  togglingMovieId,
  onUpload,
  onDownload,
  onDelete,
  onToggleVisibility,
  onRefresh,
  storage = null,
  requestedTab = null,
  message,
  error,

  // File search props
  searchQuery,
  setSearchQuery,
  searchResults = [],
  searchLoading,
  searchError,
  hasSearched,
  onSearch,
  onClearSearch,
}) {
  const isAdmin = user?.role === "admin";

  const [tab, setTab] = useState("mine");
  const [category, setCategory] = useState("all");
  const [shareTarget, setShareTarget] = useState(null);

  // A notification asked to show a particular tab.
  useEffect(() => {
    if (requestedTab?.key) {
      setTab(requestedTab.key);
      setCategory("all");
    }
  }, [requestedTab]);

  const isMine = (movie) =>
    movie.is_owner ?? Number(movie.owner_id) === Number(user?.id);

  // Overview of the signed-in user's own drive.
  const mine = useMemo(
    () => movies.filter(isMine),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movies, user?.id]
  );

  const mineStorage = mine.reduce(
    (total, movie) => total + (Number(movie.file_size) || 0),
    0
  );

  const minePublic = mine.filter((movie) => movie.visibility === "public").length;
  const mineShared = mine.filter((movie) => movie.visibility === "shared").length;

  const sharedWithMe = movies.filter((movie) => movie.shared_with_me);
  const quotaPercent =
    storage && storage.quota_bytes
      ? Math.min(100, Math.round((storage.used_bytes / storage.quota_bytes) * 100))
      : 0;

  // The list on screen: search results or the whole drive, narrowed by
  // the tab and then by the category folder.
  const base = hasSearched ? searchResults : movies;

  const inTab = useMemo(
    () =>
      base.filter((movie) =>
        tab === "mine"
          ? isMine(movie)
          : tab === "shared"
            ? Boolean(movie.shared_with_me)
            : movie.visibility === "public"
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, tab, user?.id]
  );

  const counts = useMemo(() => {
    const result = { all: inTab.length };

    for (const movie of inTab) {
      result[movie.category] = (result[movie.category] || 0) + 1;
    }

    return result;
  }, [inTab]);

  const shown =
    category === "all"
      ? inTab
      : inTab.filter((movie) => movie.category === category);

  const downloadingSet = new Set(downloadingIds.map(Number));

  const emptyText = hasSearched
    ? "No matching files in this view. Try another keyword or tab."
    : tab === "mine"
      ? "Nothing here yet. Upload your first file to get started."
      : tab === "shared"
        ? "Nobody has shared a file with you yet."
        : "Nobody has made a file public yet.";

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        {/* Dashboard heading */}
        <section className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-400">
              {isAdmin ? "ADMINISTRATOR DASHBOARD" : "YOUR DRIVE"}
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Welcome, {user?.name || "User"}!
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              {isAdmin
                ? "Monitor the platform and manage your own files."
                : "Keep files private, share them with chosen colleagues, or make them public for everyone."}
            </p>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loadingMovies}
            className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-indigo-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingMovies ? "Refreshing..." : "↻ Refresh"}
          </button>
        </section>

        {message && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
          >
            {message}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {/* Administrator dashboard / personal statistics */}
        {isAdmin ? (
          <>
            <AdminDashboard stats={adminStats} />
            <AdminAnalytics />
            <ManageUsers />
          </>
        ) : (
          <PersonalStats refreshKey={mine.length} />
        )}

        {/* Drive overview */}
        <section className="mb-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="My files"
              value={mine.length}
              detail={`${minePublic} public · ${mineShared} shared · ${mine.length - minePublic - mineShared} private`}
              icon="📁"
            />

            <StatCard
              label="My storage"
              value={formatStorage(storage ? storage.used_bytes : mineStorage)}
              detail={
                storage
                  ? `of ${formatStorage(storage.quota_bytes)} allowed`
                  : "Combined size of your files"
              }
              icon="💾"
            />

            <StatCard
              label="Shared with me"
              value={sharedWithMe.length}
              detail="Sent to you by colleagues"
              icon="👥"
            />

            <StatCard
              label="Public files"
              value={movies.filter((movie) => movie.visibility === "public").length}
              detail="Available to everyone"
              icon="🌐"
            />
          </div>
        </section>

        {storage && (
          <section
            aria-label="Storage used"
            className="panel panel-amber !py-5"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="font-medium text-slate-200">Your storage</p>
              <p data-testid="quota-text" className="text-slate-400">
                {formatStorage(storage.used_bytes)} of{" "}
                {formatStorage(storage.quota_bytes)} used ({quotaPercent}%)
              </p>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={quotaPercent}
              className="h-3 overflow-hidden rounded-full bg-slate-800"
            >
              <div
                className={`h-full rounded-full transition-all ${
                  quotaPercent >= 90 ? "bg-red-500" : quotaPercent >= 70 ? "bg-amber-400" : "bg-indigo-500"
                }`}
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
            {quotaPercent >= 90 && (
              <p className="mt-2 text-xs text-amber-300">
                You are almost out of space. Delete a file or ask the
                administrator for more.
              </p>
            )}
          </section>
        )}

        {/* Upload form */}
        <section className="mb-8">
          <UploadForm
            onUpload={onUpload}
            uploading={uploading}
            progress={uploadProgress}
          />
        </section>

        {/* Search */}
        <section className="panel panel-sky">
          <h2 className="text-xl font-bold">Search files</h2>

          <p className="mt-1 text-sm text-slate-400">
            Searches your files, public files and files shared with you.
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSearch?.();
            }}
            className="mt-4 flex flex-col gap-3 sm:flex-row"
          >
            <label htmlFor="file-search" className="sr-only">
              Search files
            </label>

            <input
              id="file-search"
              type="search"
              value={searchQuery ?? ""}
              onChange={(event) => setSearchQuery?.(event.target.value)}
              placeholder="Enter a file title or keyword..."
              maxLength={200}
              className="w-full flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />

            <button
              type="submit"
              disabled={searchLoading}
              className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searchLoading ? "Searching..." : "🔍 Search"}
            </button>

            {hasSearched && (
              <button
                type="button"
                onClick={onClearSearch}
                disabled={searchLoading}
                className="rounded-xl border border-slate-700 px-5 py-3 font-medium text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </form>

          {searchError && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              {searchError}
            </div>
          )}
        </section>

        {/* The drive */}
        <section className="panel panel-indigo">
          <h2 className="mb-1 text-xl font-bold">Your drive</h2>
          <p className="mb-5 text-sm text-slate-400">
            Browse your files, files shared with you, and public files.
          </p>
          <div
            role="tablist"
            aria-label="Which files"
            className="mb-4 inline-flex rounded-xl border border-slate-700 p-1"
          >
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => {
                  setTab(item.key);
                  setCategory("all");
                }}
                className={`rounded-lg px-5 py-2 text-sm font-medium transition ${
                  tab === item.key
                    ? "bg-indigo-600 text-white"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Folders */}
          <div
            role="group"
            aria-label="File type"
            className="mb-6 flex flex-wrap gap-2"
          >
            {[{ key: "all", label: "All", icon: "🗂️" }, ...CATEGORY_META].map(
              (item) => {
                const count = counts[item.key] || 0;

                if (item.key !== "all" && count === 0 && category !== item.key) {
                  return null;
                }

                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={category === item.key}
                    onClick={() => setCategory(item.key)}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      category === item.key
                        ? "border-indigo-500 bg-indigo-500/15 text-white"
                        : "border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    <span aria-hidden="true">{item.icon}</span> {item.label}{" "}
                    <span className="text-slate-400">{count}</span>
                  </button>
                );
              }
            )}
          </div>

          {loadingMovies && movies.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-12 text-center">
              <p className="text-slate-300">Loading your files...</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-6 py-12 text-center">
              <div className="text-4xl">{hasSearched ? "🔎" : "📁"}</div>

              <p className="mt-4 text-sm text-slate-400">{emptyText}</p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  currentUser={user}
                  onDownload={onDownload}
                  onDelete={onDelete}
                  onShare={setShareTarget}
                  downloading={downloadingSet.has(Number(movie.id))}
                  deleting={Number(deletingMovieId) === Number(movie.id)}
                  toggling={Number(togglingMovieId) === Number(movie.id)}
                />
              ))}
            </div>
          )}
        </section>

        {shareTarget && (
          <ShareDialog
            movie={shareTarget}
            saving={Number(togglingMovieId) === Number(shareTarget.id)}
            onClose={() => setShareTarget(null)}
            onSave={async (id, visibility, recipients) => {
              const ok = await onToggleVisibility(id, visibility, recipients);
              if (ok) setShareTarget(null);
            }}
          />
        )}

        <footer className="mt-12 border-t border-slate-800 pt-6 text-center text-xs text-slate-500">
          FileShare · Your company file portal
        </footer>
      </div>
    </main>
  );
}
