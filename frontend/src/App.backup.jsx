import { useCallback, useEffect, useState } from "react";
import {
  getAdminDashboard,
  getCurrentUser,
  getMovieDownloadUrl,
  getMovies,
  loginUser,
  logoutUser,
  registerUser,
  uploadMovie,
} from "./services/api";
import "./App.css";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [movies, setMovies] = useState([]);
  const [adminStats, setAdminStats] = useState(null);

  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [movieForm, setMovieForm] = useState({
    title: "",
    description: "",
    file: null,
  });

  const [busy, setBusy] = useState(false);

  const loadMovies = useCallback(async () => {
    const data = await getMovies();
    setMovies(data.movies || []);
  }, []);

  const loadAdminStats = useCallback(async () => {
    if (user?.role !== "admin") return;

    try {
      const data = await getAdminDashboard();
      setAdminStats(data.statistics);
    } catch {
      setAdminStats(null);
    }
  }, [user]);

  const loadDashboard = useCallback(async () => {
    try {
      await loadMovies();
    } catch {
      setError("Could not load movies. Please refresh and try again.");
    }

    if (user?.role === "admin") {
      await loadAdminStats();
    }
  }, [loadMovies, loadAdminStats, user]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const token = localStorage.getItem("movieshare_token");

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser();

        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        logoutUser();
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user) {
      loadDashboard();
    }
  }, [user, loadDashboard]);

  function updateAuthForm(event) {
    setAuthForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);

    try {
      if (authMode === "register") {
        await registerUser(authForm);

        setMessage("Registration successful! You can now sign in.");
        setAuthMode("login");

        setAuthForm((previous) => ({
          ...previous,
          password: "",
        }));
      } else {
        const loggedInUser = await loginUser({
          email: authForm.email,
          password: authForm.password,
        });

        setUser(loggedInUser);
        setAuthForm({
          name: "",
          email: "",
          password: "",
        });
      }
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Authentication failed. Check your details and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);

    try {
      if (!movieForm.file) {
        setError("Please select a video file.");
        return;
      }

      const result = await uploadMovie(movieForm);

      setMessage(result.message || "Movie uploaded successfully.");

      setMovieForm({
        title: "",
        description: "",
        file: null,
      });

      const fileInput = document.getElementById("movie-file");

      if (fileInput) {
        fileInput.value = "";
      }

      await loadMovies();

      if (user?.role === "admin") {
        await loadAdminStats();
      }
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Movie upload failed. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(movie) {
    setError("");
    setMessage("");

    try {
      const result = await getMovieDownloadUrl(movie.id);

      // Open the temporary signed URL returned by the backend.
      window.open(result.download_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Could not generate the movie download link."
      );
    }
  }

  function handleLogout() {
    logoutUser();
    setUser(null);
    setMovies([]);
    setAdminStats(null);
    setError("");
    setMessage("");
  }

  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1
    );

    return `${(bytes / 1024 ** index).toFixed(2)} ${units[index]}`;
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Checking your session...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
        <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl sm:p-10">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-3xl">
              🎬
            </div>

            <h1 className="text-4xl font-bold tracking-tight">
              MovieShare
            </h1>

            <p className="mt-3 text-slate-400">
              Secure movie sharing, made simple.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setError("");
                setMessage("");
              }}
              className={`rounded-lg py-2.5 font-medium ${
                authMode === "login"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Sign in
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode("register");
                setError("");
                setMessage("");
              }}
              className={`rounded-lg py-2.5 font-medium ${
                authMode === "register"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {String(error)}
            </div>
          )}

          {message && (
            <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              {message}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === "register" && (
              <div>
                <label
                  htmlFor="auth-name"
                  className="mb-2 block text-sm text-slate-300"
                >
                  Full name
                </label>

                <input
                  id="auth-name"
                  name="name"
                  value={authForm.name}
                  onChange={updateAuthForm}
                  required
                  maxLength={100}
                  autoComplete="name"
                  placeholder="Enter your name"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-indigo-500"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="mb-2 block text-sm text-slate-300"
              >
                Email address
              </label>

              <input
                id="auth-email"
                name="email"
                type="email"
                value={authForm.email}
                onChange={updateAuthForm}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="mb-2 block text-sm text-slate-300"
              >
                Password
              </label>

              <input
                id="auth-password"
                name="password"
                type="password"
                value={authForm.password}
                onChange={updateAuthForm}
                required
                minLength={8}
                autoComplete={
                  authMode === "login" ? "current-password" : "new-password"
                }
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy
                ? "Please wait..."
                : authMode === "login"
                  ? "Sign In"
                  : "Create Account"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            Your movies are stored in private cloud storage.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-xl">
              🎬
            </div>

            <div>
              <h1 className="text-xl font-bold">MovieShare</h1>
              <p className="text-xs text-slate-400">
                Your private movie library
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-medium">{user.name}</p>
              <p className="text-xs capitalize text-indigo-300">
                {user.role}
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        {error && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            <p>{String(error)}</p>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {message && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300">
            <p>{message}</p>
            <button
              type="button"
              onClick={() => setMessage("")}
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
        )}

        <section className="mb-9">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-300">
            Your workspace
          </p>

          <h2 className="text-3xl font-bold sm:text-4xl">
            Welcome, {user.name}
          </h2>

          <p className="mt-2 text-slate-400">
            Discover, upload, and manage your movie collection.
          </p>
        </section>

        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Movies in library"
            value={movies.length}
            detail="Available movie records"
            icon="🎞️"
          />

          <StatCard
            label="Library storage"
            value={formatBytes(
              movies.reduce((total, movie) => total + movie.file_size, 0)
            )}
            detail="Size of listed movie files"
            icon="☁️"
          />

          <StatCard
            label="Account role"
            value={user.role === "admin" ? "Administrator" : "Member"}
            detail="Your current access level"
            icon="🛡️"
          />
        </section>

        {user.role === "admin" && (
          <section className="mb-10 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-6">
            <div className="mb-5">
              <p className="text-sm font-semibold text-indigo-300">
                ADMINISTRATION
              </p>
              <h3 className="mt-1 text-xl font-bold">
                Platform overview
              </h3>
            </div>

            {adminStats ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                  label="Registered users"
                  value={adminStats.total_users}
                  icon="👥"
                />

                <StatCard
                  label="All uploaded movies"
                  value={adminStats.total_movies}
                  icon="🎬"
                />

                <StatCard
                  label="Total storage"
                  value={formatBytes(adminStats.total_storage_bytes)}
                  icon="💾"
                />
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Administrator statistics are currently unavailable.
              </p>
            )}
          </section>
        )}

        <section className="mb-10 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="mb-5">
            <p className="text-sm font-semibold text-indigo-300">
              ADD TO YOUR LIBRARY
            </p>
            <h3 className="mt-1 text-xl font-bold">Upload a movie</h3>
            <p className="mt-1 text-sm text-slate-400">
              MP4, WebM, and QuickTime videos up to 100 MB.
            </p>
          </div>

          <form
            onSubmit={handleUpload}
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <input
              type="text"
              value={movieForm.title}
              onChange={(event) =>
                setMovieForm((previous) => ({
                  ...previous,
                  title: event.target.value,
                }))
              }
              required
              maxLength={200}
              placeholder="Movie title"
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-indigo-500"
            />

            <input
              type="file"
              id="movie-file"
              accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
              required
              onChange={(event) =>
                setMovieForm((previous) => ({
                  ...previous,
                  file: event.target.files?.[0] || null,
                }))
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-white"
            />

            <textarea
              value={movieForm.description}
              onChange={(event) =>
                setMovieForm((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
              }
              maxLength={5000}
              rows={3}
              placeholder="Description (optional)"
              className="resize-y rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-indigo-500 md:col-span-2"
            />

            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2 md:justify-self-start"
            >
              {busy ? "Processing..." : "Upload Movie"}
            </button>
          </form>
        </section>

        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-indigo-300">
                COLLECTION
              </p>
              <h3 className="mt-1 text-2xl font-bold">Movie library</h3>
            </div>

            <button
              type="button"
              onClick={loadDashboard}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              ↻ Refresh
            </button>
          </div>

          {movies.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center">
              <div className="text-4xl">🎬</div>
              <h4 className="mt-4 text-lg font-semibold">
                Your library is empty
              </h4>
              <p className="mt-2 text-sm text-slate-400">
                Upload your first movie to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {movies.map((movie) => (
                <article
                  key={movie.id}
                  className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 transition hover:-translate-y-1 hover:border-indigo-500/50"
                >
                  <div className="flex h-36 items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-800">
                    <span className="text-5xl">🎬</span>
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="break-words text-lg font-semibold">
                        {movie.title}
                      </h4>

                      <span className="shrink-0 rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300">
                        #{movie.id}
                      </span>
                    </div>

                    <p className="mt-2 min-h-10 whitespace-pre-wrap break-words text-sm text-slate-400">
                      {movie.description || "No description provided."}
                    </p>

                    <div className="mt-4 space-y-2 border-t border-slate-800 pt-4 text-xs text-slate-400">
                      <p className="break-all">
                        File: {movie.original_filename}
                      </p>

                      <div className="flex justify-between gap-3">
                        <span>{formatBytes(movie.file_size)}</span>
                        <span>Uploader #{movie.owner_id}</span>
                      </div>

                      <p>
                        Uploaded:{" "}
                        {movie.created_at
                          ? new Date(movie.created_at).toLocaleDateString()
                          : "Unknown"}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownload(movie)}
                      disabled={
                        user.role !== "admin" && movie.owner_id !== user.id
                      }
                      title={
                        user.role !== "admin" && movie.owner_id !== user.id
                          ? "Only the uploader or an administrator can download this movie."
                          : "Download movie"
                      }
                      className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                    >
                      {user.role === "admin" || movie.owner_id === user.id
                        ? "↓ Download Movie"
                        : "Download Restricted"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-12 border-t border-slate-800 py-6 text-center text-sm text-slate-500">
          MovieShare · Secure cloud-based movie sharing
        </footer>
      </div>
    </main>
  );
}

function StatCard({ label, value, detail, icon }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-2 break-words text-2xl font-bold">{value}</p>
          {detail && (
            <p className="mt-1 text-xs text-slate-500">{detail}</p>
          )}
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-xl">
          {icon}
        </div>
      </div>
    </article>
  );
}

export default App;