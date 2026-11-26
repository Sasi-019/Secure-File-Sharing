import { useState } from "react";

import { errorMessage, loginUser, logoutUser, registerUser } from "../services/api";

const inputClass =
  "w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-500";

// Simple sign-in: pick User or Admin, then email + password.
// Users can also create an account (Register tab). Administrators only sign in.
export default function LoginPage({ onLogin }) {
  const [access, setAccess] = useState("user"); // "user" | "admin"
  const [tab, setTab] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = access === "admin";
  const creating = !isAdmin && tab === "register";

  const chooseAccess = (value) => {
    setAccess(value);
    setTab("login");
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (creating && !name.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    if (creating && password.length < 8) {
      setError("Your password must have at least 8 characters.");
      return;
    }

    setBusy(true);

    try {
      if (creating) {
        await registerUser({
          name: name.trim(),
          email: email.trim(),
          password,
        });
      }

      const user = await loginUser({ identifier: email.trim(), password });

      if (isAdmin && user.role !== "admin") {
        logoutUser();
        setError("This is not an administrator account.");
        return;
      }

      onLogin(user);
    } catch (err) {
      setError(
        await errorMessage(
          err,
          creating
            ? "Could not create the account. Please try again."
            : "Could not sign in. Please try again."
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const Choice = ({ value, icon, title, text }) => {
    const selected = access === value;
    return (
      <button
        type="button"
        onClick={() => chooseAccess(value)}
        aria-pressed={selected}
        className={`rounded-2xl border p-6 text-left transition ${
          selected
            ? "border-purple-500 bg-purple-500/10"
            : "border-slate-800 bg-slate-900 hover:border-slate-600"
        }`}
      >
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-2xl">
          {icon}
        </span>
        <span className="block text-xl font-bold text-white">{title}</span>
        <span className="mt-2 block text-sm text-slate-400">{text}</span>
        <span className="mt-4 block text-xs font-semibold uppercase tracking-wide text-indigo-300">
          {selected ? "Selected" : `Select ${value} access`}
        </span>
      </button>
    );
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-950 px-5 py-10 text-white">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-3xl">
          📁
        </div>
        <h1 className="text-3xl font-bold tracking-tight">FileShare</h1>
        <p className="mt-2 text-sm text-slate-400">
          Your personal cloud drive
        </p>
      </div>

      <div className="mb-6 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        <Choice
          value="user"
          icon="👤"
          title="User Login"
          text="Access your account, upload files, and keep them private, share them with colleagues, or make them public."
        />
        <Choice
          value="admin"
          icon="🛡️"
          title="Admin Login"
          text="Access administrator features and view platform-wide statistics."
        />
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
            {isAdmin ? "Administrator access" : "User access"}
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            {isAdmin
              ? "Welcome, Administrator"
              : creating
                ? "Create your account"
                : "Welcome back"}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {isAdmin
              ? "Sign in with an existing administrator account."
              : creating
                ? "Register to start using your drive."
                : "Sign in to access your files."}
          </p>
        </div>

        {!isAdmin && (
          <div
            role="tablist"
            className="grid grid-cols-2 rounded-xl border border-slate-800 bg-slate-950 p-1"
          >
            {[
              ["login", "Login"],
              ["register", "Register"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => {
                  setTab(key);
                  setError("");
                }}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  tab === key
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {creating && (
          <div>
            <label
              htmlFor="auth-name"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Full name
            </label>
            <input
              id="auth-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              className={inputClass}
            />
          </div>
        )}

        <div>
          <label
            htmlFor="auth-email"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Email address
          </label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="auth-password"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            autoComplete={creating ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? "Please wait…"
            : isAdmin
              ? "Sign in as administrator"
              : creating
                ? "Create account"
                : "Sign in"}
        </button>
      </form>
    </main>
  );
}
