import { useEffect, useState } from "react";

import { getPeople } from "../services/api";

// Search colleagues and pick one or more as cards.
//
//   selected   array of chosen user ids
//   onChange   called with the new array
//   single     true = pick only one person
//   admins     show the administrator as a card too (used by Messages)
export default function PeoplePicker({
  selected = [],
  onChange,
  single = false,
  admins = false,
}) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [adminList, setAdminList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Wait a moment after typing before asking the server.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const data = await getPeople(query.trim());
        if (cancelled) return;
        setPeople(data.people || []);
        setAdminList(data.admins || []);
        setError("");
      } catch {
        if (!cancelled) setError("Could not load your colleagues.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const toggle = (id) => {
    if (single) {
      onChange([id]);
      return;
    }
    onChange(
      selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id]
    );
  };

  const Card = ({ person, badge }) => {
    const on = selected.includes(person.id);
    return (
      <button
        type="button"
        role={single ? "radio" : "checkbox"}
        aria-checked={on}
        onClick={() => toggle(person.id)}
        className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
          on
            ? "border-indigo-500 bg-indigo-500/15"
            : "border-slate-700 bg-slate-950 hover:border-slate-500"
        }`}
      >
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            on ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300"
          }`}
        >
          {on ? "✓" : person.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">
            {person.name}
          </span>
          <span className="block truncate text-xs text-slate-400">
            {badge || (person.employee_id ? `ID ${person.employee_id}` : "Employee")}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div>
      <label htmlFor="people-search" className="sr-only">
        Search people
      </label>
      <input
        id="people-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name or employee ID…"
        className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-500"
      />

      {!single && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <p>
            {selected.length === 0
              ? "Tap cards to choose one or more people."
              : `${selected.length} chosen`}
          </p>
          <span className="flex gap-3">
            <button
              type="button"
              onClick={() =>
                onChange([
                  ...new Set([
                    ...selected,
                    ...people.map((person) => person.id),
                    ...(admins ? adminList.map((person) => person.id) : []),
                  ]),
                ])
              }
              className="font-semibold text-indigo-300 hover:text-white"
            >
              Select all shown
            </button>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="font-semibold text-slate-300 hover:text-white"
              >
                Clear
              </button>
            )}
          </span>
        </div>
      )}

      {error && (
        <p role="alert" className="mb-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {admins &&
          adminList.map((person) => (
            <Card key={`a${person.id}`} person={person} badge="Administrator" />
          ))}

        {people.map((person) => (
          <Card key={person.id} person={person} />
        ))}
      </div>

      {!loading && people.length === 0 && !(admins && adminList.length) && (
        <p className="mt-3 text-sm text-slate-400">No colleagues found.</p>
      )}
    </div>
  );
}
