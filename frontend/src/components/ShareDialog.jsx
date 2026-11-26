import { useState } from "react";

import Modal from "./Modal";
import PeoplePicker from "./PeoplePicker";

const OPTIONS = [
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
    text: "Every signed-in employee, administrators included, can download it.",
  },
];

// Change who can download one of your files.
export default function ShareDialog({ movie, onSave, onClose, saving }) {
  const [visibility, setVisibility] = useState(movie.visibility);
  const [people, setPeople] = useState(
    (movie.shared_with || []).map((person) => person.id)
  );

  const needPeople = visibility === "shared" && people.length === 0;
  const unchanged =
    visibility === movie.visibility &&
    (visibility !== "shared" ||
      (people.length === (movie.shared_with || []).length &&
        people.every((id) => (movie.shared_with || []).some((p) => p.id === id))));

  return (
    <Modal title={`Who can download “${movie.title}”?`} onClose={onClose} wide>
      <div className="space-y-5">
        <div role="radiogroup" className="grid gap-3 sm:grid-cols-3">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={visibility === option.value}
              onClick={() => setVisibility(option.value)}
              className={`rounded-xl border p-4 text-left transition ${
                visibility === option.value
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-slate-700 bg-slate-950 hover:border-slate-500"
              }`}
            >
              <span className="block text-sm font-semibold text-white">
                {option.title}
              </span>
              <span className="mt-1 block text-xs text-slate-400">
                {option.text}
              </span>
            </button>
          ))}
        </div>

        {visibility === "shared" && (
          <PeoplePicker selected={people} onChange={setPeople} />
        )}

        {visibility === "public" && movie.visibility !== "public" && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Every employee will be notified and will be able to download this
            file.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-medium text-slate-300 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || needPeople || unchanged}
            onClick={() =>
              onSave(movie.id, visibility, visibility === "shared" ? people : [])
            }
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {needPeople && (
          <p className="text-right text-xs text-slate-400">
            Choose at least one person.
          </p>
        )}
      </div>
    </Modal>
  );
}
