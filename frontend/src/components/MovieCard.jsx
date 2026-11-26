import { categoryInfo } from "./fileCategories";

export default function MovieCard({
  movie,
  currentUser,
  onDownload,
  onDelete,
  onShare,
  downloading = false,
  deleting = false,
  toggling = false,
}) {
  const isOwner =
    movie.is_owner ?? Number(currentUser?.id) === Number(movie.owner_id);

  const isPublic = movie.visibility === "public";
  const isShared = movie.visibility === "shared";
  const sharedNames = (movie.shared_with || []).map((p) => p.name);
  const category = categoryInfo(movie.category);
  const busy = downloading || deleting || toggling;
  const badge = isPublic
    ? {
        text: movie.is_announcement ? "📢 Announcement" : "🌐 Public",
        css: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
      }
    : isShared
      ? {
          text: isOwner
            ? `👥 Shared with ${sharedNames.length}`
            : "👥 Shared with you",
          css: "border-sky-500/40 bg-sky-500/10 text-sky-300",
        }
      : {
          text: "🔒 Private",
          css: "border-slate-600 bg-slate-800 text-slate-300",
        };

  const fileSize =
    movie.file_size != null
      ? `${(movie.file_size / (1024 * 1024)).toFixed(2)} MB`
      : "Unknown size";

  const uploadedDate = movie.created_at
    ? new Date(movie.created_at).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Unknown date";

  const uploaderName = isOwner
    ? "You"
    : movie.uploader?.name || "Unknown user";

  function handleDeleteClick() {
    const confirmed = window.confirm(
      `Delete "${movie.title}" permanently?\n\nThis cannot be undone.`
    );

    if (confirmed) {
      onDelete(movie.id);
    }
  }

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-md shadow-black/30 transition hover:border-indigo-400">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div
          title={category.label}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-2xl"
        >
          {category.icon}
        </div>

        <span
          title={isOwner && isShared ? sharedNames.join(", ") : undefined}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${badge.css}`}
        >
          {badge.text}
        </span>
      </div>

      <h3 className="break-words text-lg font-semibold text-white">
        {movie.title}
      </h3>

      <p className="mt-2 flex-1 break-words text-sm leading-6 text-slate-400">
        {movie.description || "No description provided."}
      </p>

      <dl className="mt-5 space-y-3 border-t border-slate-800 pt-4 text-sm">
        <div>
          <dt className="text-xs font-medium text-slate-400">File</dt>
          <dd className="mt-1 break-all text-slate-300">
            {movie.original_filename || "Unknown file"}
          </dd>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs font-medium text-slate-400">Size</dt>
            <dd className="mt-1 text-slate-300">{fileSize}</dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-slate-400">
              Type
            </dt>
            <dd className="mt-1 text-slate-300">{category.label}</dd>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs font-medium text-slate-400">
              Uploaded by
            </dt>
            <dd className="mt-1 break-words text-slate-300">
              {uploaderName}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-slate-400">On</dt>
            <dd className="mt-1 text-slate-300">{uploadedDate}</dd>
          </div>
        </div>
      </dl>

      <div className="mt-5 space-y-3">
        <button
          type="button"
          onClick={() => onDownload(movie)}
          disabled={busy}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {downloading ? "Downloading…" : "Download file"}
        </button>

        {isOwner && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onShare(movie)}
              disabled={busy}
              className="rounded-xl border border-slate-600 px-3 py-3 text-sm font-semibold text-slate-200 transition hover:border-indigo-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {toggling ? "Saving…" : "Who can see it"}
            </button>

            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={busy}
              className="rounded-xl border border-red-500/50 px-3 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete file"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
