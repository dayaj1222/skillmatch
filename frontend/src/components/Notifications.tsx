import { useEffect, useRef, useState } from "react";
import { Bell } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import type { Notification } from "../lib/types";

/**
 * Notification bell.
 *
 * Sits to the left of "New project". The icon stays black; a small red dot
 * appears only while there is at least one pending item (an invite waiting on
 * you, or a tip that has not yet settled). Items clear themselves once
 * resolved, so the dot goes back to black on its own.
 */
export function Notifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const r = await api.notifications();
      setItems(r.items);
    } catch {
      setItems([]);
    }
  };

  const dismiss = (n: Notification) => {
    setItems((prev) => prev.filter((x) => !(x.kind === n.kind && x.id === n.id)));
    void api.dismissNotification(n.kind, n.id).catch(() => {
      // If it fails, re-sync on next poll.
      void load();
    });
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const count = items.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn-secondary h-9 w-9 px-0"
        aria-label={count ? `${count} notifications` : "Notifications"}
        title={count ? `${count} pending` : "No notifications"}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={15} weight="bold" className="text-ink" />
        {count > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-alert ring-2 ring-paper"
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 rounded-sm border border-rule bg-paper shadow-lg">
          <div className="border-b border-rule px-4 py-2.5">
            <p className="text-[0.8125rem] font-medium text-ink">Notifications</p>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[0.8125rem] text-faint">
              You're all caught up.
            </p>
          ) : (
            <ul className="max-h-80 overflow-auto">
              {items.map((n) => (
                <li key={`${n.kind}-${n.id}`} className="border-b border-rule last:border-0">
                  <Link
                    to={n.link}
                    onClick={() => {
                      setOpen(false);
                      dismiss(n);
                    }}
                    className="block px-4 py-3 transition-colors hover:bg-surface"
                  >
                    <p className="text-[0.875rem] font-medium text-ink">{n.title}</p>
                    {n.detail && (
                      <p className="mt-0.5 text-[0.8125rem] text-muted">{n.detail}</p>
                    )}
                    <p className="mt-1 text-[0.7rem] uppercase tracking-[0.1em] text-faint">
                      {n.kind}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}