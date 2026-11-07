import { useState } from "react";
import { requestMovieAccess } from "../services/api";

export default function MovieCard({
  movie,
  currentUser,
  requestStatus = null,
  onDownload,
  onDelete,
  downloading,
  deleting,
}) {
  const [requesting, setRequesting] = useState(false);
  const [requestedNow, setRequestedNow] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState("");

  const isOwner =
    Number(currentUser?.id) === Number(movie.owner_id);

  // Everyone who does not own the file, administrators included, has to
  // ask the owner and be accepted before they can download it.
  const accessStatus = isOwner
    ? "owner"
    : requestStatus || (requestedNow ? "pending" : "none");

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
        second: "2-digit",
      })
    : "Unknown date";

  const uploaderName = movie.uploader?.name || "Unknown user";
  const uploaderEmail = movie.uploader?.email || "Email unavailable";

  async function handleRequestAccess() {
    setRequesting(true);
    setRequestMessage("");
    setRequestError("");

    try {
      const result = await requestMovieAccess(movie.id);

      setRequestedNow(true);
      setRequestMessage(
        result.message || "Access request sent successfully."
      );
    } catch (error) {
      const detail = error.response?.data?.detail;

      setRequestError(
        typeof detail === "string"
          ? detail
          : "Could not request access. Please try again."
      );
    } finally {
      setRequesting(false);
    }
  }

  function handleDeleteClick() {
    const confirmed = window.confirm(
      `Delete "${movie.title}" permanently?\n\n` +
        "Anyone you shared it with will lose access. " +
        "This cannot be undone."
    );

    if (confirmed) {
      onDelete(movie.id);
    }
  }

  const primaryButton =
    "w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-indigo-500/50">
      {/* Movie header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-2xl">
          📁
        </div>

        <span className="max-w-[60%] break-words rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
          {movie.content_type || "File"}
        </span>
      </div>

      {/* Movie title */}
      <h3 className="break-words text-lg font-semibold text-white">
        {movie.title}
      </h3>

      {/* Movie description */}
      <p className="mt-2 flex-1 break-words text-sm leading-6 text-slate-400">
        {movie.description || "No description provided."}
      </p>

      {/* Uploader details */}
      <div className="mt-5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">
            👤
          </span>

          <h4 className="text-sm font-semibold text-indigo-300">
            Uploaded by
          </h4>
        </div>

        <p className="break-words text-sm font-medium text-white">
          {uploaderName}
        </p>

        <p className="mt-1 break-all text-xs text-slate-400">
          {uploaderEmail}
        </p>

        <p className="mt-3 text-xs text-slate-500">
          User ID: {movie.uploader?.id ?? movie.owner_id}
        </p>
      </div>

      {/* File information */}
      <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
        <div>
          <p className="text-xs font-medium text-slate-400">
            Original filename
          </p>

          <p className="mt-1 break-all text-sm text-slate-300">
            {movie.original_filename || "Unknown file"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-slate-400">
              File size
            </p>

            <p className="mt-1 text-sm text-slate-300">
              {fileSize}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-400">
              Format
            </p>

            <p className="mt-1 break-words text-sm text-slate-300">
              {movie.content_type || "Unknown"}
            </p>
          </div>
        </div>

        {/* Upload date and time */}
        <div>
          <p className="text-xs font-medium text-slate-400">
            Uploaded on
          </p>

          <p className="mt-1 text-sm text-slate-300">
            {uploadedDate}
          </p>
        </div>
      </div>

      {/* Actions depend on who is looking at the file */}
      <div className="mt-5 space-y-3">
        {(accessStatus === "owner" || accessStatus === "accepted") && (
          <button
            type="button"
            onClick={() => onDownload(movie.id)}
            disabled={downloading || deleting}
            className={`${primaryButton} bg-indigo-600 hover:bg-indigo-500`}
          >
            {downloading ? "Preparing download..." : "Download file"}
          </button>
        )}

        {accessStatus === "owner" && (
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={deleting || downloading}
            className="w-full rounded-xl border border-red-500/50 px-4 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete file"}
          </button>
        )}

        {accessStatus === "none" && (
          <button
            type="button"
            onClick={handleRequestAccess}
            disabled={requesting}
            className={`${primaryButton} bg-emerald-600 hover:bg-emerald-500`}
          >
            {requesting ? "Sending request..." : "Request Access"}
          </button>
        )}

        {accessStatus === "pending" && (
          <>
            <button
              type="button"
              disabled
              className={`${primaryButton} bg-slate-700`}
            >
              Request pending
            </button>

            <p role="status" className="text-xs text-slate-400">
              {requestMessage ||
                "Waiting for the owner to accept. The button changes to Download file once they do."}
            </p>
          </>
        )}

        {accessStatus === "rejected" && (
          <>
            <button
              type="button"
              disabled
              className={`${primaryButton} bg-slate-700`}
            >
              Request declined
            </button>

            <p className="text-xs text-slate-400">
              The owner declined your request for this file.
            </p>
          </>
        )}

        {requestError && (
          <p role="alert" className="text-sm text-red-400">
            {requestError}
          </p>
        )}
      </div>
    </article>
  );
}