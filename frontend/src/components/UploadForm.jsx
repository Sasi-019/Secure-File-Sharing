import { useState } from "react";

export default function UploadForm({
  onUpload,
  uploading,
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!file) {
      return;
    }

    if (!title.trim()) {
      return;
    }

    const success = await onUpload({
      title: title.trim(),
      description: description.trim(),
      file,
    });

    // Clear the form only when the upload succeeds.
    if (success) {
      setTitle("");
      setDescription("");
      setFile(null);

      const fileInput = document.getElementById("movie-file");
      if (fileInput) {
        fileInput.value = "";
      }
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">
          Upload a file
        </h2>

        <p className="mt-2 text-sm text-slate-400">
          Add a file to your private FileShare library.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="movie-title"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            File title
          </label>

          <input
            id="movie-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Enter a title for the file"
            required
            maxLength={200}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500"
          />
        </div>

        <div>
          <label
            htmlFor="movie-description"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Description
          </label>

          <textarea
            id="movie-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Write a short description (optional)"
            rows={3}
            className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500"
          />
        </div>

        <div>
          <label
            htmlFor="movie-file"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            File
          </label>

          <input
            id="movie-file"
            type="file"
            onChange={(event) =>
              setFile(event.target.files?.[0] || null)
            }
            required
            className="block w-full cursor-pointer rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:font-medium file:text-white hover:file:bg-indigo-500"
          />

          <p className="mt-2 text-xs text-slate-500">
            Any file type up to 100 MB. Programs such as .exe or .bat are not allowed. Only upload files you own or have permission to share.
          </p>

          {file && (
            <p className="mt-2 break-all text-xs text-indigo-300">
              Selected: {file.name}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={uploading || !file || !title.trim()}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? "Uploading file..." : "Upload file"}
        </button>
      </form>
    </section>
  );
}