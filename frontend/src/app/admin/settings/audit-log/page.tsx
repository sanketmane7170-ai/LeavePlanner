"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ScrollText, Activity, User, RefreshCw } from "lucide-react";
import api from "@/lib/api";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import { cn } from "@/lib/utils";

interface AuditEntry {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  targetType: string;
  targetId: string;
  meta: string | null;
  createdAt: string;
}

const ACTION_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  IMPORT_LEAVE:       { label: "Import Leave",       color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",         dot: "bg-blue-500" },
  IMPORT_LEAVE_BULK:  { label: "Bulk Import",        color: "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",   dot: "bg-purple-500" },
  APPROVE_LEAVE:      { label: "Approve Leave",      color: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400",       dot: "bg-green-500" },
  REJECT_LEAVE:       { label: "Reject Leave",       color: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",             dot: "bg-red-500" },
  DELETE_EMPLOYEE:    { label: "Delete Employee",    color: "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400",           dot: "bg-rose-500" },
  CREATE_EMPLOYEE:    { label: "Create Employee",    color: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  UPDATE_SETTINGS:    { label: "Update Settings",   color: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",       dot: "bg-amber-500" },
  PROMOTE_ADMIN:      { label: "Promote Admin",      color: "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400",   dot: "bg-indigo-500" },
  DEMOTE_ADMIN:       { label: "Demote Admin",       color: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400",   dot: "bg-orange-500" },
  
  APPLY_LEAVE:        { label: "Apply Leave",        color: "bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400",             dot: "bg-sky-500" },
  CANCEL_LEAVE:       { label: "Cancel Leave",       color: "bg-slate-50 dark:bg-slate-900/20 text-slate-600 dark:text-slate-400",       dot: "bg-slate-500" },
  OVERRIDE_ABSENT:    { label: "Override Absent",    color: "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400",           dot: "bg-cyan-500" },
  
  APPLY_WFH:          { label: "Apply WFH",          color: "bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400",           dot: "bg-teal-500" },
  APPROVE_WFH:        { label: "Approve WFH",        color: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  REJECT_WFH:         { label: "Reject WFH",         color: "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400",           dot: "bg-rose-500" },
  
  EMAIL_SEND_SUCCESS: { label: "Email Sent",         color: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400",       dot: "bg-green-500" },
  EMAIL_SEND_FAILED:  { label: "Email Failed",       color: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",             dot: "bg-red-500" },
  
  CRON_ABSENT_CHECK_START:    { label: "Cron: Absent Start", color: "bg-fuchsia-50 dark:bg-fuchsia-900/20 text-fuchsia-600 dark:text-fuchsia-400", dot: "bg-fuchsia-400" },
  CRON_ABSENT_CHECK_COMPLETE: { label: "Cron: Absent Done",  color: "bg-fuchsia-50 dark:bg-fuchsia-900/20 text-fuchsia-600 dark:text-fuchsia-400", dot: "bg-fuchsia-500" },
  CRON_ABSENT_CHECK_FAILED:   { label: "Cron: Absent Fail",  color: "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400",           dot: "bg-rose-600" },
  
  CRON_BACKUP_START:          { label: "Cron: Backup Start", color: "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400",   dot: "bg-indigo-400" },
  CRON_BACKUP_SUCCESS:        { label: "Cron: Backup Done",  color: "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400",   dot: "bg-indigo-500" },
  CRON_BACKUP_FAILED:         { label: "Cron: Backup Fail",  color: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",             dot: "bg-red-600" },
  
  CRON_MONTHLY_REPORT_START:   { label: "Cron: Report Start", color: "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400",   dot: "bg-violet-400" },
  CRON_MONTHLY_REPORT_SUCCESS: { label: "Cron: Report Done",  color: "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400",   dot: "bg-violet-500" },
  CRON_MONTHLY_REPORT_FAILED:  { label: "Cron: Report Fail",  color: "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400",           dot: "bg-rose-600" },
  
  CRON_BIRTHDAY_CHECK_START:    { label: "Cron: Bday Start",   color: "bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400",           dot: "bg-pink-400" },
  CRON_BIRTHDAY_CHECK_COMPLETE: { label: "Cron: Bday Done",    color: "bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400",           dot: "bg-pink-500" },
  CRON_BIRTHDAY_CHECK_FAILED:   { label: "Cron: Bday Fail",    color: "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400",           dot: "bg-rose-600" },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? {
    label: action.replace(/_/g, " "),
    color: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
    dot: "bg-slate-400",
  };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const AVATAR_COLORS = [
  "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
  "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
  "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300",
];

function renderMeta(metaStr: string | null) {
  if (!metaStr) return null;
  try {
    const data = JSON.parse(metaStr);
    if (typeof data !== "object" || data === null) {
      return <span className="text-slate-600 dark:text-slate-300">{metaStr}</span>;
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-xs py-1">
        {Object.entries(data).map(([key, val]) => {
          const friendlyKey = key
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (str) => str.toUpperCase());
          
          let friendlyVal = "";
          if (typeof val === "object" && val !== null) {
            friendlyVal = JSON.stringify(val);
          } else {
            friendlyVal = String(val);
          }

          return (
            <div key={key} className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{friendlyKey}</span>
              <span className="font-medium text-slate-700 dark:text-slate-200 font-mono break-all leading-relaxed">{friendlyVal}</span>
            </div>
          );
        })}
      </div>
    );
  } catch {
    return <span className="text-slate-600 dark:text-slate-300 font-mono text-xs break-all">{metaStr}</span>;
  }
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;
  const totalPages = Math.ceil(total / limit);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res = await api.get(`/admin/settings/audit-log?page=${page}&limit=${limit}`);
      setLogs(res.data.data);
      setTotal(res.data.total);
    } catch {
      toast.error("Failed to load audit log");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Cache admin name → color index
  const adminColorMap: Record<string, string> = {};
  let colorIdx = 0;
  logs.forEach((log) => {
    if (!adminColorMap[log.adminName]) {
      adminColorMap[log.adminName] = AVATAR_COLORS[colorIdx % AVATAR_COLORS.length];
      colorIdx++;
    }
  });

  return (
    <div className="max-w-5xl space-y-6">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-600/10 via-slate-500/5 to-transparent border border-slate-200/80 dark:border-slate-700/50 p-6">
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-slate-500/15 flex items-center justify-center shrink-0">
              <ScrollText className="text-slate-600 dark:text-slate-400" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-heading font-bold text-slate-900 dark:text-white">Audit Log</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Full trail of administrative actions in the system.
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchLogs(true)}
            disabled={refreshing}
            className="flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
          >
            <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
            Refresh
          </button>
        </div>
        <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-slate-400/5 blur-2xl pointer-events-none" />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm text-sm">
          <Activity size={15} className="text-primary" />
          <span className="font-semibold text-slate-900 dark:text-white">{total}</span>
          <span className="text-slate-500 dark:text-slate-400">total events</span>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm text-sm">
            <span className="text-slate-500">Page</span>
            <span className="font-semibold text-slate-900 dark:text-white">{page}</span>
            <span className="text-slate-500">of {totalPages}</span>
          </div>
        )}
      </div>

      {/* Log entries */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <WeaveSpinner className="animate-spin text-primary" size={28} />
          <p className="text-sm text-slate-500">Loading audit logs…</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
          <div className="h-14 w-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <ScrollText size={24} className="text-slate-400 opacity-60" />
          </div>
          <p className="font-medium text-slate-700 dark:text-slate-300">No audit log entries</p>
          <p className="text-sm text-slate-400 mt-1">Administrative actions will appear here.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="grid grid-cols-[180px_1fr_160px_140px_32px] px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900">
              {["Time", "Admin", "Action", "Target", ""].map((h) => (
                <span key={h} className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</span>
              ))}
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.map((log) => {
                const cfg = getActionConfig(log.action);
                const initials = (log.adminName ?? "?").charAt(0).toUpperCase();
                const avatarColor = adminColorMap[log.adminName] ?? AVATAR_COLORS[0];
                const isExpanded = expandedId === log.id;
                return (
                  <div key={log.id} className="border-b last:border-0 border-slate-100 dark:border-slate-800/60">
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className={cn(
                        "grid grid-cols-[180px_1fr_160px_140px_32px] px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors items-center cursor-pointer select-none",
                        isExpanded && "bg-slate-50/40 dark:bg-slate-800/20"
                      )}
                    >
                      {/* Time */}
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {new Date(log.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-slate-400">
                            {new Date(log.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
                          <span className="text-[11px] text-slate-400">{timeAgo(log.createdAt)}</span>
                        </div>
                      </div>

                      {/* Admin */}
                      <div className="flex items-center gap-2.5">
                        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0", avatarColor)}>
                          {initials}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white leading-tight">{log.adminName}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <User size={10} className="text-slate-400" />
                            <span className="text-[11px] text-slate-400 font-mono">{log.adminId.slice(-6)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action badge */}
                      <div>
                        <span className={cn("inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold", cfg.color)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", cfg.dot)} />
                          {cfg.label}
                        </span>
                      </div>

                      {/* Target */}
                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{log.targetType}</p>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">…{log.targetId.slice(-8)}</p>
                      </div>

                      {/* Chevron */}
                      <div className="flex justify-end text-slate-450 dark:text-slate-500">
                        <ChevronRight size={16} className={cn("transition-transform duration-200", isExpanded && "rotate-90")} />
                      </div>
                    </div>
                    {isExpanded && log.meta && (
                      <div className="bg-slate-50/40 dark:bg-slate-900/10 border-t border-slate-100 dark:border-slate-800/80 px-8 py-4">
                        <div className="border-l-2 border-primary/40 pl-4 py-1">
                          {renderMeta(log.meta)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {logs.map((log) => {
              const cfg = getActionConfig(log.action);
              const initials = (log.adminName ?? "?").charAt(0).toUpperCase();
              const avatarColor = adminColorMap[log.adminName] ?? AVATAR_COLORS[0];
              const isExpanded = expandedId === log.id;
              return (
                <div
                  key={log.id}
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm cursor-pointer select-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0", avatarColor)}>
                        {initials}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{log.adminName}</p>
                        <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold mt-1", cfg.color)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {new Date(log.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(log.createdAt)}</p>
                      <ChevronRight size={14} className={cn("text-slate-400 mt-2 transition-transform duration-200", isExpanded && "rotate-90")} />
                    </div>
                  </div>
                  {isExpanded && log.meta && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 pl-1">
                      {renderMeta(log.meta)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} events
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, idx) => {
                  const p = page <= 3 ? idx + 1 : page - 2 + idx;
                  if (p > totalPages) return null;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        "h-9 w-9 flex items-center justify-center rounded-xl text-sm font-medium transition-colors",
                        p === page
                          ? "bg-primary text-white shadow-sm shadow-primary/30"
                          : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
