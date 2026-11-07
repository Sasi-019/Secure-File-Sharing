export default function Header({ user, onLogout }) {
  const isAdmin = user?.role === "admin";

  const displayName = user?.name || user?.email || "User";

  return (
    <header className="border-b border-slate-800 bg-slate-950">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        {/* FileShare branding */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-2xl">
            📁
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              FileShare
            </h1>

            <p className="text-xs text-slate-400">
              Private file sharing with owner approval
            </p>
          </div>
        </div>

        {/* User information and logout */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden text-right sm:block">
            <p className="max-w-48 truncate text-sm font-medium text-white">
              {displayName}
            </p>

            <p className="text-xs text-slate-400">
              {user?.email}
            </p>
          </div>

          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              isAdmin
                ? "border-purple-500/30 bg-purple-500/10 text-purple-300"
                : "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
            }`}
          >
            {isAdmin ? "Administrator" : "User"}
          </span>

          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}