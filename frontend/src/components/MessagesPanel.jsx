import { useCallback, useEffect, useState } from "react";

import {
  errorMessage,
  getMessages,
  markMessageRead,
  sendMessage,
} from "../services/api";
import Modal from "./Modal";
import PeoplePicker from "./PeoplePicker";

const TABS = [
  { key: "inbox", label: "Inbox" },
  { key: "sent", label: "Sent" },
  { key: "new", label: "New message" },
];

function when(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

// One-to-one messages: read, send, and attach one of your files. A file you
// attach is shared with that one person only.
export default function MessagesPanel({
  myFiles = [],
  initialTab = "inbox",
  onDownload,
  onChanged,
  onClose,
}) {
  const [tab, setTab] = useState(initialTab);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [to, setTo] = useState([]);
  const [body, setBody] = useState("");
  const [fileId, setFileId] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(
    async (box) => {
      setLoading(true);
      setError("");
      try {
        const data = await getMessages(box);
        const list = data.messages || [];
        setItems(list);

        // Opening the inbox reads what is in it.
        if (box === "inbox") {
          const unread = list.filter((m) => !m.is_read);
          if (unread.length) {
            await Promise.all(
              unread.map((m) => markMessageRead(m.id).catch(() => null))
            );
            onChanged?.();
          }
        }
      } catch (err) {
        setError(await errorMessage(err, "Could not load your messages."));
      } finally {
        setLoading(false);
      }
    },
    [onChanged]
  );

  useEffect(() => {
    if (tab === "inbox" || tab === "sent") load(tab);
  }, [tab, load]);

  const send = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (to.length === 0) {
      setError("Choose at least one person to send it to.");
      return;
    }
    if (!body.trim()) {
      setError("Write a message first.");
      return;
    }

    setSending(true);
    try {
      const result = await sendMessage({
        recipientIds: to,
        body: body.trim(),
        movieId: fileId ? Number(fileId) : null,
      });
      setNotice(result.message || "Sent.");
      setTo([]);
      setBody("");
      setFileId("");
      onChanged?.({ filesChanged: Boolean(fileId) });
      setTab("sent");
    } catch (err) {
      setError(await errorMessage(err, "Could not send the message."));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal title="Messages" onClose={onClose} wide>
      <div role="tablist" className="mb-5 inline-flex rounded-xl border border-slate-700 p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => {
              setTab(item.key);
              setError("");
              setNotice("");
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === item.key ? "bg-indigo-600 text-white" : "text-slate-300 hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {tab === "new" ? (
        <form onSubmit={send} className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-300">To (choose one or more people)</p>
            <PeoplePicker admins selected={to} onChange={setTo} />
          </div>

          <label className="block text-sm font-medium text-slate-300">
            Message
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Write your message…"
              className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-500"
            />
          </label>

          <label className="block text-sm font-medium text-slate-300">
            Attach one of your files (optional)
            <select
              value={fileId}
              onChange={(event) => setFileId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-indigo-500"
            >
              <option value="">No file</option>
              {myFiles.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.title} ({file.original_filename})
                </option>
              ))}
            </select>
            {fileId && (
              <span className="mt-2 block text-xs text-slate-400">
                Only the people you choose will be able to download it.
              </span>
            )}
          </label>

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {sending
              ? "Sending…"
              : to.length > 1
                ? `Send message to ${to.length} people`
                : "Send message"}
          </button>
        </form>
      ) : loading ? (
        <p className="py-8 text-center text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-slate-400">
          {tab === "inbox" ? "No messages yet." : "You have not sent any messages."}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((m) => (
            <li
              key={m.id}
              className={`rounded-xl border p-4 ${
                tab === "inbox" && !m.is_read
                  ? "border-indigo-500/60 bg-indigo-500/10"
                  : "border-slate-700 bg-slate-950"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">
                  {tab === "inbox" ? "From " : "To "}
                  {m.other?.name || "Unknown"}
                  {m.other?.role === "admin" && (
                    <span className="ml-2 rounded-full bg-purple-500/15 px-2 py-0.5 text-xs text-purple-300">
                      Administrator
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">{when(m.created_at)}</p>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-300">
                {m.body}
              </p>
              {m.file && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-800 px-3 py-2">
                  <p className="min-w-0 break-all text-sm text-slate-200">
                    📎 {m.file.title}
                    <span className="ml-2 text-xs text-slate-400">
                      {m.file.filename}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onDownload?.({
                        id: m.file.id,
                        title: m.file.title,
                        file_size: m.file.file_size,
                      })
                    }
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    Download
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
