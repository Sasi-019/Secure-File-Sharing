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

// Log in with an employee ID or a company email, plus the password.
export async function loginUser({ identifier, password }) {
  const response = await api.post("/auth/login", {
    identifier,
    password,
  });

  const { access_token, user } = response.data;

  localStorage.setItem("movieshare_token", access_token);

  return user;
}

// Create your own account (everyone starts as a regular user).
export async function registerUser({ name, email, password, employeeId }) {
  const response = await api.post("/auth/register", {
    name,
    email,
    password,
    employee_id: employeeId || null,
  });

  return response.data;
}

// Change your own password.
export async function changePassword({ currentPassword, newPassword }) {
  const response = await api.post("/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return response.data;
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

// Retrieve the files you may see (yours + others' public files).
export async function getMovies() {
  const response = await api.get("/movies/");
  return response.data;
}

// Search those files by title or description.
export async function searchMovies(query) {
  const response = await api.get("/movies/search", {
    params: {
      q: query,
    },
  });

  return response.data;
}

// Upload a file. ``onProgress({loaded, total})`` is called while the bytes
// are being sent, so the page can show a live upload rate.
export async function uploadMovie({
  title,
  description,
  visibility = "private",
  recipients = [],
  file,
  onProgress,
  signal,
}) {
  const formData = new FormData();

  formData.append("title", title);
  formData.append("description", description || "");
  formData.append("visibility", visibility);
  formData.append("recipients", recipients.join(","));
  formData.append("file", file);

  const startedAt = performance.now();
  let sentAt = null;

  const response = await api.post("/movies/upload", formData, {
    signal,
    onUploadProgress: (event) => {
      const total = event.total || file.size;
      const loaded = Math.min(event.loaded || 0, total);

      // The moment the last byte left this device. After that the server
      // is only saving the file to cloud storage, which is not network time.
      if (sentAt == null && total && loaded >= total) {
        sentAt = performance.now();
      }

      if (onProgress) onProgress({ loaded, total });
    },
  });

  const sendMs = Math.max(
    1,
    Math.round((sentAt ?? performance.now()) - startedAt)
  );

  // Report how long the sending took, so upload speed can be charted.
  // Best-effort: a failure here must never make a successful upload look
  // like it failed.
  const movieId = response.data?.movie?.id;

  if (movieId != null) {
    try {
      await api.post(`/movies/${movieId}/upload-timing`, {
        duration_ms: sendMs,
      });
    } catch (timingError) {
      console.warn("Could not report upload timing:", timingError);
    }
  }

  return { ...response.data, send_ms: sendMs };
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

// Download a file and report progress while it arrives.
// ``onProgress({loaded, total})`` drives the live download rate. The signed
// link carries its own permission, so a plain request (no login header) is
// used, which also avoids a cross-origin pre-flight.
export async function downloadMovieFile(
  movieId,
  { onProgress, signal } = {}
) {
  const info = await getMovieDownloadUrl(movieId);

  if (!info.download_url) {
    throw new Error("The server did not return a download link.");
  }

  const response = await axios.get(info.download_url, {
    responseType: "blob",
    signal,
    onDownloadProgress: (event) => {
      const total = event.total || info.file_size || 0;

      if (onProgress) {
        onProgress({ loaded: event.loaded || 0, total });
      }
    },
  });

  return {
    blob: response.data,
    filename: info.filename || info.title || "download",
    info,
  };
}

// Hand a downloaded file to the browser so it is saved to the device.
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  link.remove();

  // Give the browser a moment to start the save before freeing memory.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// A readable message from a failed request. A failed blob download carries
// its JSON error inside a Blob, which is unpacked here.
export async function errorMessage(error, fallback) {
  const data = error?.response?.data;

  try {
    if (data instanceof Blob) {
      const parsed = JSON.parse(await data.text());
      if (typeof parsed.detail === "string") return parsed.detail;
    } else if (typeof data?.detail === "string") {
      return data.detail;
    }
  } catch {
    // fall through to the fallback
  }

  return fallback;
}

// Make one of your own files private, public, or shared with chosen people.
export async function setMovieVisibility(movieId, visibility, recipients = []) {
  const response = await api.patch(`/movies/${movieId}/visibility`, {
    visibility,
    recipients,
  });
  return response.data;
}

// Colleagues you can share with (the administrator is listed separately).
export async function getPeople(query = "") {
  const response = await api.get("/people", { params: { q: query } });
  return response.data;
}

// The bell: unread count and the newest notifications.
export async function getNotifications() {
  const response = await api.get("/notifications");
  return response.data;
}

export async function markAllNotificationsRead() {
  const response = await api.post("/notifications/read-all");
  return response.data;
}

export async function markNotificationRead(id) {
  const response = await api.patch(`/notifications/${id}/read`);
  return response.data;
}

// One-to-one messages, optionally with one of your files.
// Send one message to one or several people (recipientIds is a list).
export async function sendMessage({ recipientIds, body, movieId = null }) {
  const response = await api.post("/messages", {
    recipient_ids: recipientIds,
    body,
    movie_id: movieId,
  });
  return response.data;
}

export async function getMessages(box = "inbox") {
  const response = await api.get("/messages", { params: { box } });
  return response.data;
}

export async function markMessageRead(id) {
  const response = await api.patch(`/messages/${id}/read`);
  return response.data;
}

// Administrator: add an employee account.
export async function addEmployee({ name, employeeId, email, password, quotaMb }) {
  const response = await api.post("/admin/users", {
    name,
    employee_id: employeeId,
    email,
    password,
    quota_mb: quotaMb || null,
  });
  return response.data;
}

// Administrator: set how much storage one employee may use.
export async function setUserQuota(userId, quotaMb) {
  const response = await api.patch(`/admin/users/${userId}/quota`, {
    quota_mb: quotaMb,
  });
  return response.data;
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

export default api;
