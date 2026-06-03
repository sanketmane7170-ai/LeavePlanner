"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Home, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";

// ── Types ─────────────────────────────────────────────────────────────────────
interface WfhApp {
  id: string;
  date: string;
  toDate?: string | null;
  isHalfDay: boolean;
  halfDaySlot?: string | null;
  totalDays: number;
  reason: string;
  status: string;
  adminComment?: string | null;
  createdAt: string;
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  PENDING:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  APPROVED:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  REJECTED:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  CANCELLED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLES[status] ?? STATUS_STYLES.PENDING)}>
      {status}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function EmployeeWfhTab({ employeeId }: { employeeId: string }) {
  const [apps, setApps]       = useState<WfhApp[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [year, setYear]       = useState(new Date().getFullYear());
  const limit = 10;
  const totalPages = Math.ceil(total / limit);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        employeeId,
        year: String(year),
        page: String(page),
        limit: String(limit),
      });
      const res = await api.get(`/admin/wfh?${params}`);
      setApps(res.data.data);
      setTotal(res.data.total);
    } catch {
      toast.error("Failed to load WFH history");
    } finally {
      setLoading(false);
    }
  }, [employeeId, year, page]);

  useEffect(() => { load(); }, [load]);

  // Reset page when year changes
  useEffect(() => { setPage(1); }, [year]);

  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

  const approved = apps.filter((a) => a.status === "APPROVED").reduce((s, a) => s + a.totalDays, 0);
  const pending  = apps.filter((a) => a.status === "PENDING").reduce((s, a) => s + a.totalDays, 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={load} className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Stats */}
      {!loading && total > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">Approved</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{approved}d</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">Pending</p>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">{pending}d</p>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <WeaveSpinner size={22} />
        </div>
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
          <Home size={28} className="opacity-30" />
          <p className="text-sm">No WFH applications in {year}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {apps.map((app) => (
            <div key={app.id} className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-3 py-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {formatDate(app.date)}
                    {app.toDate && app.toDate !== app.date && (
                      <span className="text-slate-400 font-normal"> → {formatDate(app.toDate)}</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {app.isHalfDay
                      ? `Half Day — ${app.halfDaySlot === "FIRST_HALF" ? "Morning" : "Afternoon"}`
                      : `${app.totalDays} day${app.totalDays !== 1 ? "s" : ""}`}
                  </p>
                </div>
                <StatusBadge status={app.status} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {app.reason}
              </p>
              {app.adminComment && (
                <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                  Admin: {app.adminComment}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-slate-400">{total} total</span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 min-w-[40px] text-center">
              {page}/{totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
