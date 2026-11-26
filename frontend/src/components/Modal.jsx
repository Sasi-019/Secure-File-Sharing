import { useEffect } from "react";

// A simple pop-up window. Closes with the X button, a click outside, or Esc.
export default function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? "max-w-3xl" : "max-w-xl"} rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:text-white"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
