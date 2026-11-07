import { useState } from "react";
import { loginUser, registerUser } from "../services/api";

export default function LoginPage({ onLogin }) {
  const [selectedRole, setSelectedRole] = useState("user");
  const [authMode, setAuthMode] = useState("login");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = selectedRole === "admin";
  const isRegistering = authMode === "register";

  const handleRoleChange = (role) => {
    setSelectedRole(role);
    setAuthMode("login");
    setError("");

    setForm({
      name: "",
      email: "",
      password: "",
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.email.trim() || !form.password) {
      setError("Please enter your email and password.");
      return;
    }

    if (isRegistering && !form.name.trim()) {
      setError("Please enter your name.");
      return;
    }

    setBusy(true);

    try {
      let user;

      if (isRegistering) {
        user = await registerUser({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
        });

        // Register the account, then sign in with the new credentials.
        user = await loginUser({
          email: form.email.trim(),
          password: form.password,
        });
      } else {
        user = await loginUser({
          email: form.email.trim(),
          password: form.password,
        });
      }

      // Selecting Admin in the interface does not grant admin privileges.
      // The account must already have the admin role on the backend.
      if (isAdmin && user.role !== "admin") {
        localStorage.removeItem("movieshare_token");
        setError(
          "This account does not have administrator privileges. Please use an admin account."
        );
        return;
      }

      // Prevent a regular user from entering through the Admin login card.
      if (!isAdmin && user.role === "admin") {
        localStorage.removeItem("movieshare_token");
        setError(
          "This is an administrator account. Please select Admin Login."
        );
        return;
      }

      onLogin(user);
    } catch (err) {
      const detail = err.response?.data?.detail;

      setError(
        typeof detail === "string"
          ? detail
          : "Authentication failed. Please check your details and try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-white">
      <div className="w-full max-w-5xl">
        {/* Branding */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-3xl shadow-lg shadow-indigo-950/40">
            📁
          </div>

          <h1 className="text-4xl font-bold tracking-tight">
            FileShare
          </h1>

          <p className="mt-3 text-slate-400">
            Private file sharing with owner approval
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* User card */}
          <button
            type="button"
            onClick={() => handleRoleChange("user")}
            className={`rounded-2xl border p-6 text-left transition ${
              !isAdmin
                ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30"
                : "border-slate-800 bg-slate-900 hover:border-slate-600"
            }`}
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 text-2xl">
              👤
            </div>

            <h2 className="text-xl font-semibold">User Login</h2>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Access your account, upload files, and share them only with people you approve.
            </p>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-indigo-300">
              {isAdmin ? "Select user access" : "Selected"}
            </p>
          </button>

          {/* Admin card */}
          <button
            type="button"
            onClick={() => handleRoleChange("admin")}
            className={`rounded-2xl border p-6 text-left transition ${
              isAdmin
                ? "border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30"
                : "border-slate-800 bg-slate-900 hover:border-slate-600"
            }`}
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/15 text-2xl">
              🛡️
            </div>

            <h2 className="text-xl font-semibold">Admin Login</h2>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Access administrator features and view platform-wide statistics.
            </p>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-purple-300">
              {isAdmin ? "Selected" : "Administrator access"}
            </p>
          </button>
        </div>

        {/* Authentication form */}
        <section className="mx-auto mt-6 max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
          <div className="mb-6">
            <p className="text-sm font-medium text-indigo-300">
              {isAdmin ? "ADMINISTRATOR ACCESS" : "USER ACCESS"}
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              {isAdmin
                ? "Welcome, Administrator"
                : isRegistering
                  ? "Create your account"
                  : "Welcome back"}
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              {isAdmin
                ? "Sign in with an existing administrator account."
                : isRegistering
                  ? "Register to start using FileShare."
                  : "Sign in to access your files."}
            </p>
          </div>

          {/* User login/register tabs */}
          {!isAdmin && (
            <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setError("");
                }}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  !isRegistering
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Login
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthMode("register");
                  setError("");
                }}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  isRegistering
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Register
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-300"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {isRegistering && !isAdmin && (
              <div>
                <label
                  htmlFor="register-name"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Full name
                </label>

                <input
                  id="register-name"
                  type="text"
                  autoComplete="name"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="Enter your name"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-indigo-500"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="login-email"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Email address
              </label>

              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                placeholder="you@example.com"
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-indigo-500"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Password
              </label>

              <input
                id="login-password"
                type="password"
                autoComplete={
                  isRegistering ? "new-password" : "current-password"
                }
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                placeholder="Enter your password"
                required
                minLength={isRegistering ? 8 : undefined}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-indigo-500"
              />

              {isRegistering && (
                <p className="mt-2 text-xs text-slate-500">
                  Use at least 8 characters.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              className={`w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                isAdmin
                  ? "bg-purple-600 hover:bg-purple-500"
                  : "bg-indigo-600 hover:bg-indigo-500"
              }`}
            >
              {busy
                ? "Please wait..."
                : isAdmin
                  ? "Sign in as Admin"
                  : isRegistering
                    ? "Create account"
                    : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            FileShare uses authenticated access to protect your private files.
          </p>
        </section>

        <p className="mt-8 text-center text-xs text-slate-600">
          FileShare · Private cloud storage
        </p>
      </div>
    </main>
  );
}