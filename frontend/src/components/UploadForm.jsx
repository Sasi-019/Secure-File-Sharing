import { useState } from "react";

import { percentDone } from "../services/rate";
import PeoplePicker from "./PeoplePicker";

const VISIBILITY_OPTIONS = [
  {
    value: "private",
    title: "🔒 Private",
    text: "Only you can see and download it.",
  },
  {
    value: "shared",
    title: "👥 Chosen people",
    text: "Only the colleagues you pick can download it.",
  },
  {
    value: "public",
    title: "🌐 Public",
    text: "Every employee is notified and can download it.",
  },
];

export default function UploadForm({ onUpload, uploading, progress = null }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [file, setFile] = useState(null);
  const [people, setPeople] = useState([]);

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
      visibility,
      recipients: visibility === "shared" ? people : [],
      file,
    });

    // Clear the form only when the upload succeeds.
    if (success) {
      setTitle("");
      setDescription("");
      setVisibility("private");
      setPeople([]);
      setFile(null);

      const fileInput = document.getElementById("file-input");
      if (fileInput) {
        fileInput.value = "";
      }
    }
  };

  const percent = progress ? percentDone(progress.loaded, progress.total) : null;

  return (
    <section className="panel panel-indigo !mb-0">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">
          Upload a file
        </h2>

        <p className="mt-2 text-sm text-slate-400">
          Add a file to your drive. It is filed automatically under Images,
          Videos, PDFs, Documents and so on.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="file-title"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Title
          </label>

          <input
            id="file-title"
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
            htmlFor="file-description"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Description
          </label>

          <textarea
            id="file-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Write a short description (optional)"
            rows={3}
            className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500"
          />
        </div>

        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-slate-300">
            Who can download it?
          </legend>

          <div className="grid gap-3 sm:grid-cols-3">
            {VISIBILITY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-xl border p-4 transition ${
                  visibility === option.value
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-slate-700 bg-slate-950 hover:border-slate-500"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={option.value}
                  checked={visibility === option.value}
                  onChange={() => setVisibility(option.value)}
                  className="sr-only"
                />

                <span className="block text-sm font-semibold text-white">
                  {option.title}
                </span>

                <span className="mt-1 block text-xs text-slate-400">
                  {option.text}
                </span>
              </label>
            ))}
          </div>

          {visibility === "shared" && (
            <div className="mt-4">
              <PeoplePicker selected={people} onChange={setPeople} />
            </div>
          )}
        </fieldset>

        <div>
          <label
            htmlFor="file-input"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            File
          </label>

          <input
            id="file-input"
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
          disabled={
            uploading ||
            !file ||
            !title.trim() ||
            (visibility === "shared" && people.length === 0)
          }
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading
            ? percent != null
              ? `Uploading… ${percent}%`
              : "Uploading file..."
            : "Upload file"}
        </button>
      </form>
    </section>
  );
}
