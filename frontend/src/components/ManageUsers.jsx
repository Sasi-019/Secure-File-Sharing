import { useEffect, useState } from "react";
import {
  getAdminUsers,
  blockUser,
  unblockUser,
} from "../services/api";

export default function ManageUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);

  // Convert storage bytes into a readable size.
  const formatStorage = (bytes) => {
    const size = Number(bytes) || 0;

    if (size < 1024) {
      return `${size} B`;
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(2)} KB`;
    }

    if (size < 1024 * 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    }

    return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Format account registration dates.
  const formatDate = (dateString) => {
    if (!dateString) {
      return "Unknown";
    }

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }

    return date.toLocaleString();
  };

  // Fetch all registered users from the backend.
  const loadUsers = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getAdminUsers();
      const updatedUsers = data.users || [];

      setUsers(updatedUsers);

      // Keep the selected profile synchronized with the latest data.
      setSelectedUser((previous) => {
        if (!previous) {
          return null;
        }

        return (
          updatedUsers.find((user) => user.id === previous.id) || null
        );
      });
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to load users. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Block or unblock a regular user.
  const handleAccountStatus = async (user) => {
    const action = user.is_active ? "block" : "unblock";

    const confirmationMessage =
      action === "block"
        ? `Are you sure you want to block ${user.name}?\n\nThey will no longer be able to access protected FileShare features.`
        : `Are you sure you want to unblock ${user.name}?\n\nThey will regain access to FileShare.`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    try {
      setActionLoading(true);
      setError("");
      setMessage("");

      if (action === "block") {
        await blockUser(user.id);
        setMessage(`${user.name} has been blocked successfully.`);
      } else {
        await unblockUser(user.id);
        setMessage(`${user.name} has been unblocked successfully.`);
      }

      // Reload the table and selected profile with the latest status.
      await loadUsers();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          `Unable to ${action} this account. Please try again.`
      );
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <section className="mb-10">
      {/* Section heading */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-purple-400">
            ADMINISTRATION
          </p>

          <h2 className="mt-2 text-2xl font-bold text-white">
            Manage Users
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            View registered accounts, inspect contributions, and manage
            account access.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setMessage("");
            loadUsers();
          }}
          disabled={loading || actionLoading}
          className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-purple-500 hover:text-white disabled:opacity-50"
        >
          {loading ? "Loading..." : "↻ Refresh users"}
        </button>
      </div>

      {/* Success message */}
      {message && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
        >
          {message}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {/* Users table */}
      {loading && users.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
          Loading registered users...
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
          No registered users found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-800/70 text-slate-300">
                <tr>
                  <th className="px-5 py-4 font-semibold">User</th>
                  <th className="px-5 py-4 font-semibold">Role</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Files</th>
                  <th className="px-5 py-4 font-semibold">Storage</th>
                  <th className="px-5 py-4 font-semibold">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="transition hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-white">
                        {user.name}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        {user.email}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        ID: {user.id}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          user.role === "admin"
                            ? "bg-purple-500/15 text-purple-300"
                            : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          user.is_active
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-red-500/15 text-red-300"
                        }`}
                      >
                        {user.is_active ? "Active" : "Blocked"}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-slate-300">
                      {user.movies_uploaded}
                    </td>

                    <td className="px-5 py-4 text-slate-300">
                      {formatStorage(user.storage_used_bytes)}
                    </td>

                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => {
                          setMessage("");
                          setError("");
                          setSelectedUser(user);
                        }}
                        className="rounded-lg border border-indigo-500/40 px-3 py-2 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-500/10"
                      >
                        View details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
            Total registered accounts: {users.length}
          </div>
        </div>
      )}

      {/* Selected user profile */}
      {selectedUser && (
        <div className="mt-6 rounded-2xl border border-indigo-500/30 bg-slate-900 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-indigo-400">
                USER PROFILE
              </p>

              <h3 className="mt-2 text-xl font-bold text-white">
                {selectedUser.name}
              </h3>

              <p className="mt-1 text-sm text-slate-400">
                {selectedUser.email}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              disabled={actionLoading}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:text-white disabled:opacity-50"
            >
              Close
            </button>
          </div>

          {/* User details */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl bg-slate-800/70 p-4">
              <p className="text-sm text-slate-400">User ID</p>
              <p className="mt-2 font-semibold text-white">
                {selectedUser.id}
              </p>
            </div>

            <div className="rounded-xl bg-slate-800/70 p-4">
              <p className="text-sm text-slate-400">Account role</p>
              <p className="mt-2 font-semibold capitalize text-white">
                {selectedUser.role}
              </p>
            </div>

            <div className="rounded-xl bg-slate-800/70 p-4">
              <p className="text-sm text-slate-400">Account status</p>
              <p
                className={`mt-2 font-semibold ${
                  selectedUser.is_active
                    ? "text-emerald-300"
                    : "text-red-300"
                }`}
              >
                {selectedUser.is_active ? "Active" : "Blocked"}
              </p>
            </div>

            <div className="rounded-xl bg-slate-800/70 p-4">
              <p className="text-sm text-slate-400">Registered</p>
              <p className="mt-2 text-sm font-medium text-white">
                {formatDate(selectedUser.created_at)}
              </p>
            </div>

            <div className="rounded-xl bg-slate-800/70 p-4">
              <p className="text-sm text-slate-400">Files uploaded</p>
              <p className="mt-2 font-semibold text-white">
                {selectedUser.movies_uploaded}
              </p>
            </div>

            <div className="rounded-xl bg-slate-800/70 p-4">
              <p className="text-sm text-slate-400">Storage used</p>
              <p className="mt-2 font-semibold text-white">
                {formatStorage(selectedUser.storage_used_bytes)}
              </p>
            </div>
          </div>

          {/* Block / Unblock controls */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-5">
            <div>
              <h4 className="font-semibold text-white">
                Account access
              </h4>

              <p className="mt-1 text-sm text-slate-400">
                {selectedUser.role === "admin"
                  ? "Administrator accounts cannot be blocked from this panel."
                  : selectedUser.is_active
                    ? "This account is currently active."
                    : "This account is currently blocked."}
              </p>
            </div>

            {selectedUser.role !== "admin" && (
              <button
                type="button"
                onClick={() => handleAccountStatus(selectedUser)}
                disabled={actionLoading || loading}
                className={`rounded-xl px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  selectedUser.is_active
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                {actionLoading
                  ? "Please wait..."
                  : selectedUser.is_active
                    ? "Block User"
                    : "Unblock User"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}