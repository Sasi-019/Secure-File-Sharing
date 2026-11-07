import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000",
  headers: {
    Accept: "application/json",
  },
});

// Attach the login token to authenticated requests.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("movieshare_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Register a new user.
export async function registerUser({ name, email, password }) {
  const response = await api.post("/auth/register", {
    name,
    email,
    password,
  });

  return response.data;
}

// Log in an existing user.
export async function loginUser({ email, password }) {
  const response = await api.post("/auth/login", {
    email,
    password,
  });

  const { access_token, user } = response.data;

  localStorage.setItem("movieshare_token", access_token);

  return user;
}

// Get the currently authenticated user.
export async function getCurrentUser() {
  const response = await api.get("/auth/me");
  return response.data;
}

// Log out.
export function logoutUser() {
  localStorage.removeItem("movieshare_token");
}

// Retrieve movies.
export async function getMovies() {
  const response = await api.get("/movies/");
  return response.data;
}

// Search movies by title or description.
export async function searchMovies(query) {
  const response = await api.get("/movies/search", {
    params: {
      q: query,
    },
  });

  return response.data;
}

// Upload a movie.
export async function uploadMovie({ title, description, file }) {
  const formData = new FormData();

  formData.append("title", title);
  formData.append("description", description || "");
  formData.append("file", file);

  const startedAt = performance.now();

  const response = await api.post("/movies/upload", formData);

  // Report how long the upload took, so upload speed and duration can be
  // charted. This is best-effort: a failure here must never make a
  // successful upload look like it failed.
  const movieId = response.data?.movie?.id;

  if (movieId != null) {
    const durationMs = Math.max(
      1,
      Math.round(performance.now() - startedAt)
    );

    try {
      await api.post(`/movies/${movieId}/upload-timing`, {
        duration_ms: durationMs,
      });
    } catch (timingError) {
      console.warn("Could not report upload timing:", timingError);
    }
  }

  return response.data;
}

// Ask the server for a short-lived download link for a file.
// The returned address is built from the same API address this page
// already uses, so it works from any device and any host name.
export async function getMovieDownloadUrl(movieId) {
  const response = await api.get(`/movies/${movieId}/download`);

  const { download_path: path } = response.data;

  const base = String(api.defaults.baseURL || "").replace(/\/+$/, "");

  return {
    ...response.data,
    download_url: path ? `${base}${path}` : null,
  };
}

// Permanently delete one of your own files.
export async function deleteMovie(movieId) {
  const response = await api.delete(`/movies/${movieId}`);
  return response.data;
}

// Retrieve administrator statistics.
export async function getAdminDashboard() {
  const response = await api.get("/admin/dashboard");
  return response.data;
}

// Retrieve all registered users for the administrator.
export async function getAdminUsers() {
  const response = await api.get("/admin/users");
  return response.data;
}

// Administrator graphs. period: "day" | "week" | "month".
export async function getAdminAnalytics(period = "day") {
  const response = await api.get("/admin/analytics", {
    params: { period },
  });
  return response.data;
}

// Administrator: most active users.
export async function getAdminUserActivity(days = 30) {
  const response = await api.get("/admin/user-activity", {
    params: { days },
  });
  return response.data;
}

// Administrator: recorded downloads, newest first.
export async function getAdminDownloadHistory(limit = 20, offset = 0) {
  const response = await api.get("/admin/downloads", {
    params: { limit, offset },
  });
  return response.data;
}

// The signed-in user's own statistics.
export async function getMyStats() {
  const response = await api.get("/stats/me");
  return response.data;
}

// Block a regular user.
export async function blockUser(userId) {
  const response = await api.patch(`/admin/users/${userId}/block`);
  return response.data;
}

// Unblock a regular user.
export async function unblockUser(userId) {
  const response = await api.patch(`/admin/users/${userId}/unblock`);
  return response.data;
}

// Request access to another user's movie.
export async function requestMovieAccess(movieId) {
  const response = await api.post(
    `/sharing/movies/${movieId}/request`
  );

  return response.data;
}

// Get notifications for the logged-in user.
export async function getSharingNotifications() {
  const response = await api.get("/sharing/notifications");
  return response.data;
}

// Mark a notification as read.
export async function markSharingNotificationRead(notificationId) {
  const response = await api.patch(
    `/sharing/notifications/${notificationId}/read`
  );
  return response.data;
}

// Accept or reject a movie access request.
export async function decideSharingRequest(requestId, decision) {
  const response = await api.patch(
    `/sharing/requests/${requestId}/decision`,
    null,
    {
      params: { decision },
    }
  );
  return response.data;
}

export default api;
