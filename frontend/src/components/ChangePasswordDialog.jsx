import { useState } from "react";

import { changePassword, errorMessage } from "../services/api";
import Modal from "./Modal";

export default function ChangePasswordDialog({ onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (next.length < 8) {
      setError("The new password needs at least 8 characters.");
      return;
    }
    if (next !== again) {
      setError("The two new passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      setDone(true);
    } catch (err) {
      setError(await errorMessage(err, "Could not change the password."));
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-indigo-500";

  return (
    <Modal title="Change password" onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p role="status" className="text-emerald-300">
            Your password was changed.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white"
          >
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </p>
          )}
          <label className="block text-sm text-slate-300">
            Current password
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className={`mt-2 ${field}`} autoComplete="current-password" />
          </label>
          <label className="block text-sm text-slate-300">
            New password
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={`mt-2 ${field}`} autoComplete="new-password" />
          </label>
          <label className="block text-sm text-slate-300">
            New password again
            <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} className={`mt-2 ${field}`} autoComplete="new-password" />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Change password"}
          </button>
        </form>
      )}
    </Modal>
  );
}
