import { useCallback, useEffect, useRef, useState } from "react";

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/api";

const ICONS = {
  announcement: "📢",
  public_file: "🌐",
  shared_file: "👥",
  message: "✉️",
};

function timeAgo(value) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

// The bell icon with the unread count and a list of what is new.
export default function NotificationBell({ onOpen, refreshKey = 0 }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const box = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await getNotifications();
      setUnread(data.unread || 0);
      setItems(data.notifications || []);
    } catch {
      // The bell is a convenience: a failed refresh is not an error.
    }
  }, []);

  // Check for news now, every 30 seconds, and whenever the page says so.
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load, refreshKey]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const choose = async (item) => {
    setOpen(false);
    if (!item.is_read) {
      try {
        await markNotificationRead(item.id);
      } catch {
        // ignore
      }
      load();
    }
    onOpen?.(item);
  };

  const readAll = async () => {
    try {
      await markAllNotificationsRead();
    } catch {
      // ignore
    }
    load();
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) load();
        }}
        aria-label={`Notifications, ${unread} unread`}
        aria-expanded={open}
        className="relative rounded-xl border border-slate-700 px-3.5 py-2.5 text-lg text-slate-200 transition hover:border-indigo-500"
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span
            data-testid="bell-count"
            className="absolute -right-2 -top-2 min-w-6 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-xs font-bold text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-3 w-80 max-w-[85vw] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <p className="text-sm font-semibold text-white">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={readAll}
                className="text-xs font-medium text-indigo-300 hover:text-indigo-200"
              >
                Mark all as read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Nothing new yet.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => choose(item)}
                    className={`flex w-full items-start gap-3 border-b border-slate-800 px-4 py-3 text-left transition hover:bg-slate-800 ${
                      item.is_read ? "" : "bg-indigo-500/10"
                    }`}
                  >
                    <span aria-hidden="true" className="text-lg">
                      {ICONS[item.type] || "🔔"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm ${
                          item.is_read ? "text-slate-300" : "font-semibold text-white"
                        }`}
                      >
                        {item.message}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {timeAgo(item.created_at)}
                      </span>
                    </span>
                    {!item.is_read && (
                      <span
                        aria-label="unread"
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-400"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
