export default function StatCard({ label, value, detail, icon }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">{label}</p>

          <p className="mt-2 break-words text-2xl font-bold">
            {value}
          </p>

          {detail && (
            <p className="mt-1 text-xs text-slate-500">
              {detail}
            </p>
          )}
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-xl">
          {icon}
        </div>
      </div>
    </article>
  );
}