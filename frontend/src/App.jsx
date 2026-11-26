import { useCallback, useEffect, useRef, useState } from "react";

import {
  getAdminDashboard,
  getCurrentUser,
  deleteMovie,
  downloadMovieFile,
  errorMessage,
  getMovies,
  saveBlob,
  searchMovies,
  setMovieVisibility,
  logoutUser,
  uploadMovie,
} from "./services/api";
import { RateMeter } from "./services/rate";

import Header from "./components/Header";
import MessagesPanel from "./components/MessagesPanel";
import ChangePasswordDialog from "./components/ChangePasswordDialog";
import TransferPanel from "./components/TransferPanel";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";

import "./App.css";

// How long a finished transfer stays in the panel.
// A finished transfer card closes itself after this long.
const DONE_VISIBLE_MS = 2500;

function App() {
  // --------------------------------------------------
  // 1. Authentication and session state
  // --------------------------------------------------

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Storage used and allowed, shown as a bar on the drive.
  const [storage, setStorage] = useState(null);

  // Pop-ups, and the tab a notification asked for.
  const [messagesOpen, setMessagesOpen] = useState(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [requestedTab, setRequestedTab] = useState(null);
  const [bellKey, setBellKey] = useState(0);

  // --------------------------------------------------
  // 2. File data
  // --------------------------------------------------

  const [movies, setMovies] = useState([]);

  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const [adminStats, setAdminStats] = useState(null);

  // --------------------------------------------------
  // 3. Loading states
  // --------------------------------------------------

  const [loadingMovies, setLoadingMovies] = useState(false);
  const [deletingMovieId, setDeletingMovieId] = useState(null);
  const [togglingMovieId, setTogglingMovieId] = useState(null);

  // Uploads and downloads in progress (or just finished), each with its
  // live speed. See components/TransferPanel.jsx.
  const [transfers, setTransfers] = useState([]);
  const meters = useRef({});
  const histories = useRef({});
  const controllers = useRef({});

  // --------------------------------------------------
  // 4. General messages
  // --------------------------------------------------

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // --------------------------------------------------
  // 5. Transfer bookkeeping
  // --------------------------------------------------

  const addTransfer = useCallback((transfer) => {
    setTransfers((list) => [...list, transfer]);
  }, []);

  const patchTransfer = useCallback((id, patch) => {
    setTransfers((list) =>
      list.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }, []);

  const dismissTransfer = useCallback((id) => {
    setTransfers((list) => list.filter((item) => item.id !== id));
    delete meters.current[id];
    delete histories.current[id];
    delete controllers.current[id];
  }, []);

  // A progress event arrived: update the numbers and the live speed.
  const reportProgress = useCallback(
    (id, { loaded, total }) => {
      const meter = meters.current[id];

      if (!meter) return;

      const now = performance.now();

      meter.push(loaded, now);

      // Keep the last readings so the card can draw a live speed graph.
      const history = histories.current[id] || (histories.current[id] = []);
      const rate = meter.rate(now);

      // One reading about every half second: { t: seconds since start, rate }.
      const t = (now - meter.startedAt) / 1000;
      const lastT = history.length ? history[history.length - 1].t : -1;

      if (t - lastT >= 0.5) history.push({ t, rate });
      if (history.length > 1200) history.shift();

      const patch = {
        loaded,
        rate,
        history: [...history],
        lastEventAt: now,
      };

      // Keep the known size when an event does not carry one.
      if (total) patch.total = total;

      patchTransfer(id, patch);
    },
    [patchTransfer]
  );

  const finishTransfer = useCallback(
    (id, patch) => {
      const meter = meters.current[id];
      const now = performance.now();

      patchTransfer(id, {
        ...patch,
        rate: 0,
        durationMs: meter?.startedAt != null ? now - meter.startedAt : null,
      });

      if (patch.status === "done") {
        window.setTimeout(() => dismissTransfer(id), DONE_VISIBLE_MS);
      }
    },
    [patchTransfer, dismissTransfer]
  );

  const newTransfer = (kind, name, total) => {
    const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const meter = new RateMeter();
    const now = performance.now();

    meter.start(now);
    meters.current[id] = meter;

    addTransfer({
      id,
      kind,
      name,
      loaded: 0,
      total: total || 0,
      history: [],
      startedAt: now,
      rate: 0,
      averageRate: 0,
      durationMs: null,
      status: "active",
      error: "",
      lastEventAt: now,
    });

    return id;
  };

  const cancelTransfer = useCallback((id) => {
    controllers.current[id]?.abort();
  }, []);

  // --------------------------------------------------
  // 6. Load files
  // --------------------------------------------------

  const loadMovies = useCallback(async () => {
    setLoadingMovies(true);

    try {
      const data = await getMovies();
      setMovies(data.movies || []);
    } finally {
      setLoadingMovies(false);
    }
  }, []);

  const refreshStorage = useCallback(async () => {
    try {
      const me = await getCurrentUser();
      setStorage(me.storage || null);
    } catch (err) {
      console.error("Could not refresh storage:", err);
    }
  }, []);

  // --------------------------------------------------
  // 7. Load administrator statistics
  // --------------------------------------------------

  const loadAdminStats = useCallback(async () => {
    if (user?.role !== "admin") {
      setAdminStats(null);
      return;
    }

    try {
      const data = await getAdminDashboard();
      setAdminStats(data.statistics || null);
    } catch (err) {
      console.error("Could not load administrator statistics:", err);
      setAdminStats(null);
    }
  }, [user]);

  // --------------------------------------------------
  // 8. Refresh dashboard information
  // --------------------------------------------------

  const loadDashboard = useCallback(async () => {
    setError("");

    try {
      await loadMovies();
    } catch (err) {
      console.error("Could not load files:", err);

      setError("Could not load files. Please refresh and try again.");
    }

    if (user?.role === "admin") {
      await loadAdminStats();
    }
  }, [loadMovies, loadAdminStats, user]);

  // --------------------------------------------------
  // 9. Restore login session
  // --------------------------------------------------

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
          setStorage(currentUser.storage || null);
          setUser(currentUser);
        }
      } catch (err) {
        console.error("Could not restore login session:", err);

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

  // --------------------------------------------------
  // 10. Load dashboard after login
  // --------------------------------------------------

  useEffect(() => {
    if (user) {
      loadDashboard();
    }
  }, [user, loadDashboard]);

  // --------------------------------------------------
  // 11. Handle successful login
  // --------------------------------------------------

  const handleLogin = (loggedInUser) => {
    setError("");
    setMessage("");

    setMovies([]);
    setAdminStats(null);

    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
    setHasSearched(false);

    setStorage(loggedInUser.storage || null);
    setUser(loggedInUser);
  };

  // --------------------------------------------------
  // 12. Upload (with live speed)
  // --------------------------------------------------

  const handleUpload = async ({
    title,
    description,
    visibility,
    recipients = [],
    file,
  }) => {
    setError("");
    setMessage("");

    if (!file) {
      setError("Please select a file.");
      return false;
    }

    const id = newTransfer("upload", file.name, file.size);

    try {
      const result = await uploadMovie({
        title,
        description,
        visibility,
        recipients,
        file,
        onProgress: (progress) => reportProgress(id, progress),
      });

      refreshStorage();

      const sendSeconds = (result.send_ms || 1) / 1000;

      finishTransfer(id, {
        status: "done",
        loaded: file.size,
        total: file.size,
        averageRate: file.size / sendSeconds,
      });

      setMessage(result.message || "File uploaded successfully!");

      try {
        await loadMovies();
      } catch (refreshError) {
        console.error(
          "File uploaded, but the file list could not refresh:",
          refreshError
        );

        setError(
          "The file was uploaded, but the file list could not refresh. Please refresh the dashboard."
        );
      }

      if (user?.role === "admin") {
        await loadAdminStats();
      }

      return true;
    } catch (err) {
      console.error("File upload failed:", err);

      const text = await errorMessage(
        err,
        "File upload failed. Please check the file and try again."
      );

      finishTransfer(id, { status: "error", error: text });
      setError(text);

      return false;
    }
  };

  // --------------------------------------------------
  // 13. Search files
  // --------------------------------------------------

  const handleSearch = async () => {
    const query = searchQuery.trim();

    if (!query) {
      setSearchResults([]);
      setSearchError("Please enter a file title or keyword.");
      setHasSearched(true);
      return;
    }

    setSearchLoading(true);
    setSearchError("");
    setHasSearched(true);

    try {
      const data = await searchMovies(query);
      setSearchResults(data.movies || []);
    } catch (err) {
      console.error("File search failed:", err);

      const detail = err.response?.data?.detail;

      setSearchResults([]);

      setSearchError(
        typeof detail === "string"
          ? detail
          : "Could not search files. Please try again."
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
    setHasSearched(false);
  };

  // --------------------------------------------------
  // 14. Download (with live speed)
  // --------------------------------------------------

  const handleDownload = async (movie) => {
    setError("");
    setMessage("");

    // One download of the same file at a time.
    const alreadyRunning = transfers.some(
      (item) =>
        item.kind === "download" &&
        item.status === "active" &&
        item.movieId === movie.id
    );

    if (alreadyRunning) return;

    const id = newTransfer("download", movie.title, movie.file_size);
    patchTransfer(id, { movieId: movie.id });

    const controller = new AbortController();
    controllers.current[id] = controller;

    try {
      const { blob, filename } = await downloadMovieFile(movie.id, {
        signal: controller.signal,
        onProgress: (progress) => reportProgress(id, progress),
      });

      const meter = meters.current[id];
      const averageRate = meter ? meter.average(performance.now()) : 0;

      saveBlob(blob, filename);

      finishTransfer(id, {
        status: "done",
        loaded: blob.size,
        total: blob.size,
        averageRate,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        finishTransfer(id, { status: "cancelled" });
        return;
      }

      console.error("File download failed:", err);

      const text = await errorMessage(
        err,
        "Could not download the file. Please try again."
      );

      finishTransfer(id, { status: "error", error: text });
      setError(text);
    }
  };

  // --------------------------------------------------
  // 15. Delete a file (owner only)
  // --------------------------------------------------

  const handleDelete = async (movieId) => {
    setError("");
    setMessage("");

    setDeletingMovieId(movieId);

    try {
      const result = await deleteMovie(movieId);

      const stillThere = (movie) => Number(movie.id) !== Number(movieId);

      setMovies((previous) => previous.filter(stillThere));
      setSearchResults((previous) => previous.filter(stillThere));

      setMessage(result.message || "File deleted.");
      refreshStorage();

      if (user?.role === "admin") {
        loadAdminStats();
      }
    } catch (err) {
      console.error("File delete failed:", err);

      const detail = err.response?.data?.detail;

      setError(
        typeof detail === "string"
          ? detail
          : "Could not delete the file. Please try again."
      );
    } finally {
      setDeletingMovieId(null);
    }
  };

  // --------------------------------------------------
  // 16. Make a file public or private (owner only)
  // --------------------------------------------------

  const handleToggleVisibility = async (movieId, visibility, recipients = []) => {
    setError("");
    setMessage("");

    setTogglingMovieId(movieId);

    try {
      const result = await setMovieVisibility(movieId, visibility, recipients);

      const apply = (movie) =>
        Number(movie.id) === Number(movieId)
          ? {
              ...movie,
              visibility: result.visibility,
              shared_with: result.shared_with || [],
            }
          : movie;

      setMovies((previous) => previous.map(apply));
      setSearchResults((previous) => previous.map(apply));

      setMessage(result.message || "Visibility updated.");
      return true;
    } catch (err) {
      console.error("Could not change visibility:", err);

      setError(
        await errorMessage(
          err,
          "Could not change who can see the file. Please try again."
        )
      );
      return false;
    } finally {
      setTogglingMovieId(null);
    }
  };

  // --------------------------------------------------
  // 16b. A notification was clicked
  // --------------------------------------------------

  const handleOpenNotification = (item) => {
    if (item.type === "message") {
      setMessagesOpen("inbox");
    } else {
      setRequestedTab({
        key: item.type === "shared_file" ? "shared" : "public",
        nonce: Date.now(),
      });
    }

    // New files may have arrived since the page loaded.
    loadMovies().catch(() => null);
  };

  // --------------------------------------------------
  // 17. Handle logout
  // --------------------------------------------------

  const handleLogout = () => {
    // Stop anything still downloading.
    Object.values(controllers.current).forEach((controller) =>
      controller.abort()
    );

    logoutUser();

    setUser(null);
    setStorage(null);
    setMessagesOpen(null);
    setPasswordOpen(false);
    setMovies([]);
    setAdminStats(null);
    setTransfers([]);

    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
    setHasSearched(false);

    setError("");
    setMessage("");
  };

  // --------------------------------------------------
  // 18. Session-loading screen
  // --------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-600 border-t-white" />

          <p className="text-lg font-medium">Checking your session...</p>

          <p className="mt-2 text-sm text-slate-400">
            Please wait while FileShare loads.
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // 19. Login page
  // --------------------------------------------------

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // --------------------------------------------------
  // 20. Authenticated dashboard
  // --------------------------------------------------

  const activeUpload = transfers.find(
    (item) => item.kind === "upload" && item.status === "active"
  );

  const downloadingIds = transfers
    .filter((item) => item.kind === "download" && item.status === "active")
    .map((item) => item.movieId);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header
        user={user}
        onLogout={handleLogout}
        onOpenNotification={handleOpenNotification}
        onOpenMessages={() => setMessagesOpen("inbox")}
        onChangePassword={() => setPasswordOpen(true)}
        bellRefreshKey={bellKey}
      />

      <DashboardPage
        user={user}
        movies={movies}
        adminStats={adminStats}
        loadingMovies={loadingMovies}
        uploading={Boolean(activeUpload)}
        uploadProgress={
          activeUpload
            ? { loaded: activeUpload.loaded, total: activeUpload.total }
            : null
        }
        downloadingIds={downloadingIds}
        deletingMovieId={deletingMovieId}
        togglingMovieId={togglingMovieId}
        onUpload={handleUpload}
        onDownload={handleDownload}
        onDelete={handleDelete}
        onToggleVisibility={handleToggleVisibility}
        onRefresh={loadDashboard}
        storage={storage}
        requestedTab={requestedTab}
        message={message}
        error={error}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
        searchLoading={searchLoading}
        searchError={searchError}
        hasSearched={hasSearched}
        onSearch={handleSearch}
        onClearSearch={handleClearSearch}
      />

      {messagesOpen && (
        <MessagesPanel
          initialTab={messagesOpen}
          myFiles={movies.filter((movie) => movie.is_owner)}
          onDownload={handleDownload}
          onChanged={(info) => {
            setBellKey((value) => value + 1);
            if (info?.filesChanged) loadMovies().catch(() => null);
          }}
          onClose={() => setMessagesOpen(null)}
        />
      )}

      {passwordOpen && (
        <ChangePasswordDialog onClose={() => setPasswordOpen(false)} />
      )}

      <TransferPanel
        transfers={transfers}
        onCancel={cancelTransfer}
        onDismiss={dismissTransfer}
      />
    </div>
  );
}

export default App;
