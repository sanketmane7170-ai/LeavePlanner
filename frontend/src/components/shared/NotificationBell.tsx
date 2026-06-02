"use client";

import { useState, useEffect, useRef } from "react";
import {
  Bell,
  CheckCircle2,
  XCircle,
  CalendarDays,
  Home,
  ShieldCheck,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  link?: string;
  createdAt: string;
}

const TYPE_CFG: Record<string, { icon: React.ElementType; dot: string; iconCls: string }> = {
  LEAVE_APPLIED:   { icon: CalendarDays,  dot: "bg-blue-500",   iconCls: "text-blue-500"   },
  LEAVE_APPROVED:  { icon: CheckCircle2,  dot: "bg-green-500",  iconCls: "text-green-500"  },
  LEAVE_REJECTED:  { icon: XCircle,       dot: "bg-red-500",    iconCls: "text-red-500"    },
  LEAVE_CANCELLED: { icon: XCircle,       dot: "bg-slate-400",  iconCls: "text-slate-400"  },
  WFH_APPLIED:     { icon: Home,          dot: "bg-teal-500",   iconCls: "text-teal-500"   },
  WFH_APPROVED:    { icon: CheckCircle2,  dot: "bg-green-500",  iconCls: "text-green-500"  },
  WFH_REJECTED:    { icon: XCircle,       dot: "bg-red-500",    iconCls: "text-red-500"    },
  POLICY_ASSIGNED: { icon: ShieldCheck,   dot: "bg-purple-500", iconCls: "text-purple-500" },
  ABSENT:          { icon: AlertTriangle, dot: "bg-orange-500", iconCls: "text-orange-500" },
};
const DEFAULT_CFG = { icon: Info, dot: "bg-slate-400", iconCls: "text-slate-400" };

export function NotificationBell() {
  const [items, setItems]           = useState<Notification[]>([]);
  const [unread, setUnread]         = useState(0);
  const [open, setOpen]             = useState(false);
  const panelRef                    = useRef<HTMLDivElement>(null);
  const router                      = useRouter();

  const fetch = async () => {
    try {
      const res = await api.get("/notifications");
      setItems(res.data);
      setUnread(res.data.filter((n: Notification) => !n.isRead).length);
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetch();
    const t = setInterval(fetch, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const markOne = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems((p) => p.map((n) => n.id === id ? { ...n, isRead: true } : n));
      setUnread((p) => Math.max(0, p - 1));
    } catch { /* silent */ }
  };

  const markAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.patch("/notifications/read-all");
      setItems((p) => p.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
    } catch { /* silent */ }
  };

  const handleClick = (n: Notification) => {
    if (!n.isRead) markOne(n.id);
    if (n.link) router.push(n.link);
    setOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* ── Bell ─────────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Bell size={18} className="text-slate-600 dark:text-slate-300" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 h-4 min-w-[16px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-0.5 ring-2 ring-white dark:ring-slate-950 leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* ── Panel ────────────────────────────────────────────────────────── */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <span className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              Notifications
              {unread > 0 && (
                <span className="h-5 min-w-[20px] flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-bold px-1">
                  {unread}
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={markAll}
                  className="text-xs text-primary hover:underline font-medium whitespace-nowrap"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="ml-2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500">
                <Bell size={28} className="mb-2 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              items.map((n) => {
                const cfg  = TYPE_CFG[n.type] ?? DEFAULT_CFG;
                const Icon = cfg.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors",
                      "hover:bg-slate-50 dark:hover:bg-slate-800/60",
                      !n.isRead && "bg-primary/[0.04] dark:bg-primary/[0.07]"
                    )}
                  >
                    {/* Icon circle */}
                    <div className="mt-0.5 h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <Icon size={14} className={cfg.iconCls} />
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-xs leading-snug line-clamp-2",
                        n.isRead
                          ? "text-slate-500 dark:text-slate-400"
                          : "text-slate-800 dark:text-slate-100 font-medium"
                      )}>
                        {n.message}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>

                    {/* Unread dot */}
                    {!n.isRead && (
                      <div className={cn("h-2 w-2 rounded-full shrink-0 mt-1.5", cfg.dot)} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
