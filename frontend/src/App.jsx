import { useCallback, useEffect, useState } from "react";

import {
  getAdminDashboard,
  getCurrentUser,
  getMovieDownloadUrl,
  deleteMovie,
  getMovies,
  searchMovies,
  logoutUser,
  uploadMovie,
  getSharingNotifications,
  decideSharingRequest,
} from "./services/api";

import Header from "./components/Header";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";

import "./App.css";

function App() {
  // --------------------------------------------------
  // 1. Authentication and session state
  // --------------------------------------------------

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // --------------------------------------------------
  // 2. Movie data
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
  const [uploading, setUploading] = useState(false);
  const [downloadingMovieId, setDownloadingMovieId] = useState(null);
  const [deletingMovieId, setDeletingMovieId] = useState(null);

  // --------------------------------------------------
  // 4. General messages
  // --------------------------------------------------

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // --------------------------------------------------
  // 5. Movie-sharing notifications
  // --------------------------------------------------

  const [sharingNotifications, setSharingNotifications] = useState([]);
  const [loadingSharingNotifications, setLoadingSharingNotifications] =
    useState(false);
  const [sharingActionId, setSharingActionId] = useState(null);

  // --------------------------------------------------
  // 6. Load movies
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
      console.error(
        "Could not load administrator statistics:",
        err
      );

      setAdminStats(null);
    }
  }, [user]);

  // --------------------------------------------------
  // 8. Load movie-sharing notifications
  // --------------------------------------------------

  const loadSharingNotifications = useCallback(async () => {
    if (!user) {
      setSharingNotifications([]);
      return;
    }

    setLoadingSharingNotifications(true);

    try {
      const data = await getSharingNotifications();
      setSharingNotifications(data.notifications || []);
    } catch (err) {
      console.error(
        "Could not load sharing notifications:",
        err
      );

      setError(
        "Could not load sharing notifications. Please refresh."
      );
    } finally {
      setLoadingSharingNotifications(false);
    }
  }, [user]);

  // --------------------------------------------------
  // 9. Accept or reject a sharing request
  // --------------------------------------------------

  const handleSharingDecision = async (requestId, decision) => {
    setError("");
    setMessage("");
    setSharingActionId(requestId);

    try {
      const result = await decideSharingRequest(
        requestId,
        decision
      );

      setMessage(
        result.message ||
          `File access request ${decision} successfully.`
      );

      await loadSharingNotifications();
    } catch (err) {
      console.error(
        "Could not update sharing request:",
        err
      );

      const detail = err.response?.data?.detail;

      setError(
        typeof detail === "string"
          ? detail
          : "Could not update the access request. Please try again."
      );

      try {
        await loadSharingNotifications();
      } catch (refreshError) {
        console.error(
          "Could not refresh sharing notifications:",
          refreshError
        );
      }
    } finally {
      setSharingActionId(null);
    }
  };

  // --------------------------------------------------
  // 10. Refresh dashboard information
  // --------------------------------------------------

  const loadDashboard = useCallback(async () => {
    setError("");

    try {
      await loadMovies();
    } catch (err) {
      console.error("Could not load files:", err);

      setError(
        "Could not load files. Please refresh and try again."
      );
    }

    if (user?.role === "admin") {
      await loadAdminStats();
    }
  }, [loadMovies, loadAdminStats, user]);

  // --------------------------------------------------
  // 11. Restore login session
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
          setUser(currentUser);
        }
      } catch (err) {
        console.error(
          "Could not restore login session:",
          err
        );

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
  // 12. Load dashboard and notifications after login
  // --------------------------------------------------

  useEffect(() => {
    if (user) {
      loadDashboard();
      loadSharingNotifications();
    }
  }, [
    user,
    loadDashboard,
    loadSharingNotifications,
  ]);

  // --------------------------------------------------
  // 13. Handle successful login
  // --------------------------------------------------

  const handleLogin = (loggedInUser) => {
    setError("");
    setMessage("");

    setMovies([]);
    setAdminStats(null);
    setSharingNotifications([]);

    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
    setHasSearched(false);

    setUser(loggedInUser);
  };

  // --------------------------------------------------
  // 14. Handle movie uploads
  // --------------------------------------------------

  const handleUpload = async ({
    title,
    description,
    file,
  }) => {
    setError("");
    setMessage("");

    if (!file) {
      setError("Please select a file.");
      return false;
    }

    setUploading(true);

    try {
      const result = await uploadMovie({
        title,
        description,
        file,
      });

      setMessage(
        result.message || "File uploaded successfully!"
      );

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

      const detail = err.response?.data?.detail;

      setError(
        typeof detail === "string"
          ? detail
          : "File upload failed. Please check the file and try again."
      );

      return false;
    } finally {
      setUploading(false);
    }
  };

  // --------------------------------------------------
  // 15. Search movies
  // --------------------------------------------------

  const handleSearch = async () => {
    const query = searchQuery.trim();

    if (!query) {
      setSearchResults([]);
      setSearchError(
        "Please enter a file title or keyword."
      );
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

  // --------------------------------------------------
  // 16. Clear movie search
  // --------------------------------------------------

  const handleClearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
    setHasSearched(false);
  };

  // --------------------------------------------------
  // 17. Handle movie downloads
  // --------------------------------------------------

  const handleDownload = async (movieId) => {
    setError("");
    setMessage("");

    setDownloadingMovieId(movieId);

    try {
      const result = await getMovieDownloadUrl(movieId);

      if (!result.download_url) {
        throw new Error(
          "The server did not return a download URL."
        );
      }

      // Navigate in the same tab instead of window.open(): this runs after
      // an await, so phone browsers treat a new window as a pop-up and
      // block it. The download link sends "Content-Disposition:
      // attachment", so the browser saves the file and stays on this page.
      window.location.assign(result.download_url);
    } catch (err) {
      console.error("File download failed:", err);

      const detail = err.response?.data?.detail;

      setError(
        typeof detail === "string"
          ? detail
          : "Could not generate the file download link. Please try again."
      );
    } finally {
      setDownloadingMovieId(null);
    }
  };

  // --------------------------------------------------
  // 17b. Handle file deletion (owner only)
  // --------------------------------------------------

  const handleDelete = async (movieId) => {
    setError("");
    setMessage("");

    setDeletingMovieId(movieId);

    try {
      const result = await deleteMovie(movieId);

      // Remove the file from the lists straight away.
      const stillThere = (movie) => Number(movie.id) !== Number(movieId);

      setMovies((previous) => previous.filter(stillThere));
      setSearchResults((previous) => previous.filter(stillThere));

      setMessage(result.message || "File deleted.");

      // Requests for the deleted file are gone too.
      loadSharingNotifications();

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
  // 18. Handle logout
  // --------------------------------------------------

  const handleLogout = () => {
    logoutUser();

    setUser(null);
    setMovies([]);
    setAdminStats(null);
    setSharingNotifications([]);

    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
    setHasSearched(false);

    setError("");
    setMessage("");
  };

  // --------------------------------------------------
  // 19. Display session-loading screen
  // --------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-600 border-t-white" />

          <p className="text-lg font-medium">
            Checking your session...
          </p>

          <p className="mt-2 text-sm text-slate-400">
            Please wait while MovieShare loads.
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // 20. Display login page
  // --------------------------------------------------

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // --------------------------------------------------
  // 21. Display authenticated dashboard
  // --------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header
        user={user}
        onLogout={handleLogout}
      />

      <DashboardPage
        user={user}
        movies={movies}
        adminStats={adminStats}
        loadingMovies={loadingMovies}
        uploading={uploading}
        downloadingMovieId={downloadingMovieId}
        onUpload={handleUpload}
        onDownload={handleDownload}
        onDelete={handleDelete}
        deletingMovieId={deletingMovieId}
        onRefresh={loadDashboard}
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
        sharingNotifications={sharingNotifications}
        loadingSharingNotifications={
          loadingSharingNotifications
        }
        sharingActionId={sharingActionId}
        onSharingDecision={handleSharingDecision}
        onRefreshNotifications={loadSharingNotifications}
      />
    </div>
  );
}

export default App;