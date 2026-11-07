import { useEffect, useMemo } from "react";

import StatCard from "../components/StatCard";
import MovieCard from "../components/MovieCard";
import UploadForm from "../components/UploadForm";
import AdminDashboard from "./AdminDashboard";
import ManageUsers from "../components/ManageUsers";
import AdminAnalytics from "../components/AdminAnalytics";
import PersonalStats from "../components/PersonalStats";

// Pure helpers live outside the component so they stay stable between
// renders (they are used inside useMemo / useEffect).
const sameId = (first, second) =>
  first != null &&
  second != null &&
  String(first) === String(second);

const getDecision = (notification) =>
  String(notification?.decision || "pending").toLowerCase();

// The backend may use sharing_request_accepted for requester notifications.
const isSharingRequestNotification = (notification) =>
  String(notification?.type || "").startsWith("sharing_request") &&
  notification?.sharing_request_id != null;

export default function DashboardPage({
  user,
  movies = [],
  adminStats,
  loadingMovies,
  uploading,
  downloadingMovieId,
  onUpload,
  onDownload,
  onDelete,
  deletingMovieId,
  onRefresh,
  message,
  error,

  // Movie search props
  searchQuery,
  setSearchQuery,
  searchResults = [],
  searchLoading,
  searchError,
  hasSearched,
  onSearch,
  onClearSearch,

  // Movie-sharing notification props
  sharingNotifications = [],
  loadingSharingNotifications = false,
  sharingActionId = null,
  onSharingDecision,
  onRefreshNotifications,
}) {
  const isAdmin = user?.role === "admin";

  // Statistics
  const totalMovies = movies.length;

  const totalStorageBytes = movies.reduce(
    (total, movie) => total + (Number(movie.file_size) || 0),
    0
  );

  const formatStorage = (bytes) => {
    if (!bytes) return "0 MB";

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const displayedMovies = hasSearched ? searchResults : movies;

  // The signed-in user's own request status for each file, taken from the
  // live notifications so a card changes (for example to "Download file")
  // a few seconds after the owner accepts, without reloading the page.
  // Files with no live notification fall back to the status the server
  // sent with the file list (movie.my_request_status).
  const requestStatusByMovie = useMemo(() => {
    const statuses = {};

    for (const notification of sharingNotifications) {
      if (
        isSharingRequestNotification(notification) &&
        sameId(notification.requester_id, user?.id) &&
        notification.movie_id != null
      ) {
        statuses[String(notification.movie_id)] =
          getDecision(notification);
      }
    }

    return statuses;
  }, [sharingNotifications, user?.id]);

  // Poll notifications so a requester sees an accepted request quickly.
  useEffect(() => {
    if (typeof onRefreshNotifications !== "function") {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      onRefreshNotifications();
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [onRefreshNotifications]);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        {/* Dashboard heading */}
        <section className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-400">
              {isAdmin ? "ADMINISTRATOR DASHBOARD" : "YOUR WORKSPACE"}
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Welcome, {user?.name || "User"}!
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              {isAdmin
                ? "Monitor the FileShare platform and manage your files."
                : "Upload, organize, search, and share your files."}
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

        {/* Success message */}
        {message && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
          >
            {message}
          </div>
        )}

        {/* General error message */}
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {/* Sharing notifications */}
        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-indigo-400">
                Secure file sharing
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                File Access Requests
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                Review notifications and manage requests to access your files.
              </p>
            </div>

            <button
              type="button"
              onClick={onRefreshNotifications}
              disabled={loadingSharingNotifications}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-indigo-500 hover:text-white disabled:opacity-50"
            >
              {loadingSharingNotifications
                ? "Refreshing..."
                : "↻ Refresh requests"}
            </button>
          </div>

          {loadingSharingNotifications &&
          sharingNotifications.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Loading notifications...
            </p>
          ) : sharingNotifications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center">
              <p className="text-lg">🔔</p>
              <p className="mt-2 font-medium text-slate-200">
                No notifications yet
              </p>
              <p className="mt-1 text-sm text-slate-400">
                New file-sharing activity will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sharingNotifications.map((notification) => {
                const isSharingRequest =
                  isSharingRequestNotification(notification);

                const decision = getDecision(notification);
                const isPending = decision === "pending";
                const isAccepted = decision === "accepted";
                const isRejected = decision === "rejected";

                const actionInProgress = sameId(
                  sharingActionId,
                  notification.sharing_request_id
                );

                return (
                  <article
                    key={notification.id}
                    className={`rounded-xl border p-4 ${
                      notification.is_read
                        ? "border-slate-800 bg-slate-950/60"
                        : "border-indigo-500/40 bg-indigo-500/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
                            {String(
                              notification.type || "notification"
                            ).replaceAll("_", " ")}
                          </span>

                          {!notification.is_read && (
                            <span className="rounded-full bg-indigo-500/15 px-2 py-1 text-xs text-indigo-300">
                              New
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-sm leading-6 text-slate-200">
                          {notification.message}
                        </p>

                        <p className="mt-2 text-xs text-slate-500">
                          {notification.created_at
                            ? new Date(
                                notification.created_at
                              ).toLocaleString()
                            : "Date unavailable"}
                        </p>
                      </div>

                      {isSharingRequest && (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            isPending
                              ? "bg-amber-500/15 text-amber-300"
                              : isAccepted
                                ? "bg-emerald-500/15 text-emerald-300"
                                : isRejected
                                  ? "bg-red-500/15 text-red-300"
                                  : "bg-slate-700 text-slate-200"
                          }`}
                        >
                          {isPending
                            ? "Pending"
                            : isAccepted
                              ? "Accepted"
                              : isRejected
                                ? "Rejected"
                                : decision}
                        </span>
                      )}
                    </div>

                    {isSharingRequest && isPending && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={
                            actionInProgress ||
                            typeof onSharingDecision !== "function"
                          }
                          onClick={() =>
                            onSharingDecision(
                              notification.sharing_request_id,
                              "accepted"
                            )
                          }
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {actionInProgress ? "Processing..." : "Accept"}
                        </button>

                        <button
                          type="button"
                          disabled={
                            actionInProgress ||
                            typeof onSharingDecision !== "function"
                          }
                          onClick={() =>
                            onSharingDecision(
                              notification.sharing_request_id,
                              "rejected"
                            )
                          }
                          className="rounded-lg bg-red-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {actionInProgress ? "Processing..." : "Reject"}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Administrator dashboard */}
        {isAdmin ? (
          <>
            <AdminDashboard stats={adminStats} />
            <AdminAnalytics />
            <ManageUsers />
          </>
        ) : (
          <PersonalStats refreshKey={totalMovies} />
        )}

        {/* Personal library statistics */}
        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-xl font-bold">
              {isAdmin ? "File library" : "Your library"}
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              {isAdmin
                ? "Browse the files available in the library."
                : "A quick overview of the files currently listed in your library."}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Files listed"
              value={totalMovies}
              detail="Files stored on the platform"
              icon="📄"
            />

            <StatCard
              label="Listed file size"
              value={formatStorage(totalStorageBytes)}
              detail="Combined size of the listed files"
              icon="💾"
            />
          </div>
        </section>

        {/* Movie upload form */}
        <section className="mb-10">
          <UploadForm onUpload={onUpload} uploading={uploading} />
        </section>

        {/* Movie search */}
        <section className="mb-10 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-sm font-medium uppercase tracking-wider text-indigo-400">
              Discover files
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Search the file library
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Search by file title or keywords in its description.
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSearch?.();
            }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <div className="relative flex-1">
              <label htmlFor="movie-search" className="sr-only">
                Search files
              </label>

              <input
                id="movie-search"
                type="search"
                value={searchQuery ?? ""}
                onChange={(event) => setSearchQuery?.(event.target.value)}
                placeholder="Enter a file title or keyword..."
                maxLength={200}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

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

          {searchLoading && (
            <div
              role="status"
              className="mt-5 flex items-center gap-3 text-sm text-slate-300"
            >
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400" />
              Searching the file library...
            </div>
          )}

          {hasSearched && !searchLoading && !searchError && (
            <p className="mt-4 text-sm text-slate-400">
              {searchResults.length === 0
                ? "No matching files were found."
                : `Found ${searchResults.length} matching ${
                    searchResults.length === 1 ? "file" : "files"
                  }.`}
            </p>
          )}
        </section>

        {/* Movie collection or search results */}
        <section>
          <div className="mb-5">
            <h2 className="text-2xl font-bold">
              {hasSearched ? "Search results" : "File collection"}
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              {hasSearched
                ? "Files matching your search, including their uploader information."
                : "Select a file to download it if your account has permission."}
            </p>
          </div>

          {!hasSearched && loadingMovies && movies.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-12 text-center">
              <p className="text-slate-300">
                Loading your file collection...
              </p>
            </div>
          ) : searchLoading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-12 text-center">
              <p className="text-slate-300">Loading search results...</p>
            </div>
          ) : searchError && hasSearched ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-12 text-center">
              <p className="text-slate-300">
                Search results could not be loaded.
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Check the error message above and try again.
              </p>
            </div>
          ) : displayedMovies.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-6 py-12 text-center">
              <div className="text-4xl">
                {hasSearched ? "🔎" : "📁"}
              </div>

              <h3 className="mt-4 text-lg font-semibold">
                {hasSearched ? "No matching files" : "No files found"}
              </h3>

              <p className="mt-2 text-sm text-slate-400">
                {hasSearched
                  ? "Try another title or keyword. You can also clear your search to return to the complete collection."
                  : "Upload your first file to get started."}
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {displayedMovies.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  currentUser={user}
                  requestStatus={
                    requestStatusByMovie[String(movie.id)] ??
                    movie.my_request_status ??
                    null
                  }
                  onDownload={onDownload}
                  onDelete={onDelete}
                  downloading={
                    Number(downloadingMovieId) === Number(movie.id)
                  }
                  deleting={
                    Number(deletingMovieId) === Number(movie.id)
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-12 border-t border-slate-800 pt-6 text-center text-xs text-slate-500">
          FileShare · Secure cloud-based file sharing
        </footer>
      </div>
    </main>
  );
}