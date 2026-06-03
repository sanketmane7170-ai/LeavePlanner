"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  ClipboardList, Search, RefreshCw, Download, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, X, Filter, Calendar,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LogEntry {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  category: string;
  targetType: string;
  targetId: string;
  description: string | null;
  meta: Record<string, any> | null;
  rawMeta: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface Summary {
  todayCount: number;
  weekCount: number;
  topAdmins: { adminId: string; adminName: string; count: number }[];
  todayActions: { action: string; category: string; count: number }[];
}

interface LogsData {
  data: LogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: Summary;
}

interface AdminOption {
  adminId: string;
  adminName: string;
  email: string | null;
  count: number;
}

// ── Category config (all explicit Tailwind classes) ───────────────────────────
const CAT: Record<string, { label: string; badge: string; dot: string }> = {
  CREATE:  { label: "Created",   badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700", dot: "bg-emerald-500" },
  UPDATE:  { label: "Updated",   badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-700",                   dot: "bg-blue-500" },
  DELETE:  { label: "Deleted",   badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-700",                         dot: "bg-red-500" },
  APPROVE: { label: "Approved",  badge: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-700",             dot: "bg-green-500" },
  REJECT:  { label: "Rejected",  badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-700",       dot: "bg-orange-500" },
  SYSTEM:  { label: "System",    badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-700",       dot: "bg-purple-500" },
  OTHER:   { label: "Other",     badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700",                dot: "bg-slate-400" },
};

const TARGET_LABELS: Record<string, string> = {
  EMPLOYEE: "Employee", LEAVE: "Leave", WFH: "WFH", POLICY: "Policy",
  SETTINGS: "Settings", ATTENDANCE: "Attendance", ANNOUNCEMENT: "Announcement",
  ADMIN: "Admin", CRON: "System", EMAIL: "Email",
};

const CATEGORIES = ["CREATE","UPDATE","DELETE","APPROVE","REJECT","SYSTEM"];
const TARGET_TYPES = ["EMPLOYEE","LEAVE","WFH","POLICY","SETTINGS","ATTENDANCE","ANNOUNCEMENT","ADMIN"];

// ── Relative time ─────────────────────────────────────────────────────────────
function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)  return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function absTime(ts: string): string {
  return new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Log row ───────────────────────────────────────────────────────────────────
function LogRow({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const cat = CAT[log.category] ?? CAT.OTHER;

  return (
    <>
      <tr
        className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Time */}
        <td className="px-4 py-3 whitespace-nowrap">
          <span title={absTime(log.createdAt)} className="text-xs text-slate-600 dark:text-slate-400">
            {relTime(log.createdAt)}
          </span>
        </td>

        {/* Category badge */}
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold", cat.badge)}>
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", cat.dot)} />
            {cat.label}
          </span>
        </td>

        {/* Admin */}
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-sm font-medium text-slate-900 dark:text-white">{log.adminName}</span>
        </td>

        {/* Target type */}
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
            {TARGET_LABELS[log.targetType] ?? log.targetType}
          </span>
        </td>

        {/* Description / action */}
        <td className="px-4 py-3">
          <p className="text-sm text-slate-700 dark:text-slate-300 truncate max-w-[320px]">
            {log.description ?? log.action.replace(/_/g, " ")}
          </p>
        </td>

        {/* IP */}
        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-400 hidden lg:table-cell">
          {log.ipAddress ?? "—"}
        </td>

        {/* Expand */}
        <td className="px-4 py-3 text-slate-400">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Left: core info */}
              <div className="space-y-2 text-sm">
                <p><span className="text-slate-500">Action:</span> <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{log.action}</span></p>
                <p><span className="text-slate-500">Target ID:</span> <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{log.targetId}</span></p>
                <p><span className="text-slate-500">Admin ID:</span> <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{log.adminId}</span></p>
                <p><span className="text-slate-500">Timestamp:</span> <span className="text-slate-700 dark:text-slate-300">{absTime(log.createdAt)}</span></p>
                {log.ipAddress && (
                  <p><span className="text-slate-500">IP:</span> <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{log.ipAddress}</span></p>
                )}
              </div>
              {/* Right: meta */}
              {log.meta && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Metadata</p>
                  <pre className="text-xs bg-slate-100 dark:bg-slate-800 rounded-xl p-3 overflow-auto max-h-36 text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {JSON.stringify(log.meta, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Excel export ──────────────────────────────────────────────────────────────
function exportExcel(logs: LogEntry[]) {
  const headers = ["Time","Admin","Category","Target","Description","Action","IP"];
  const rows = logs.map((l) => [
    absTime(l.createdAt),
    l.adminName,
    CAT[l.category]?.label ?? l.category,
    TARGET_LABELS[l.targetType] ?? l.targetType,
    l.description ?? l.action,
    l.action,
    l.ipAddress ?? "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 50 }, { wch: 35 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "System Logs");
  XLSX.writeFile(wb, `System_Logs_${new Date().toISOString().split("T")[0]}.xlsx`);
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SystemLogsPage() {
  const now = new Date();

  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState("");
  const [targetType, setTargetType] = useState("");
  const [adminId, setAdminId]   = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [page, setPage]         = useState(1);
  const limit = 50;

  const [applied, setApplied] = useState({ search: "", category: "", targetType: "", adminId: "", dateFrom: "", dateTo: "" });

  const [data, setData]           = useState<LogsData | null>(null);
  const [adminOptions, setAdmins] = useState<AdminOption[]>([]);
  const [loading, setLoading]     = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const fetchLogs = useCallback(async (filters: typeof applied, pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pg), limit: String(limit),
        ...(filters.search     && { search:     filters.search }),
        ...(filters.category   && { category:   filters.category }),
        ...(filters.targetType && { targetType: filters.targetType }),
        ...(filters.adminId    && { adminId:    filters.adminId }),
        ...(filters.dateFrom   && { dateFrom:   filters.dateFrom }),
        ...(filters.dateTo     && { dateTo:     filters.dateTo }),
      });
      const res = await api.get(`/admin/system-logs?${params}`);
      setData(res.data);
    } catch {
      toast.error("Failed to load system logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(applied, page); }, [applied, page, fetchLogs]);

  useEffect(() => {
    api.get("/admin/system-logs/admins").then((r) => setAdmins(r.data ?? [])).catch(() => {});
  }, []);

  const handleApply = () => {
    setPage(1);
    setApplied({ search, category, targetType, adminId, dateFrom, dateTo });
  };

  const handleReset = () => {
    const empty = { search: "", category: "", targetType: "", adminId: "", dateFrom: "", dateTo: "" };
    setSearch(""); setCategory(""); setTargetType(""); setAdminId(""); setDateFrom(""); setDateTo("");
    setPage(1);
    setApplied(empty);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        limit: "1000",
        ...(applied.search     && { search:     applied.search }),
        ...(applied.category   && { category:   applied.category }),
        ...(applied.targetType && { targetType: applied.targetType }),
        ...(applied.adminId    && { adminId:    applied.adminId }),
        ...(applied.dateFrom   && { dateFrom:   applied.dateFrom }),
        ...(applied.dateTo     && { dateTo:     applied.dateTo }),
      });
      const res = await api.get(`/admin/system-logs?${params}`);
      exportExcel(res.data.data);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const filtersActive = Object.values(applied).some(Boolean);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ClipboardList size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">System Logs</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Complete audit trail of all admin actions
              {data ? ` · ${data.total.toLocaleString()} total entries` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => fetchLogs(applied, page)} disabled={loading} className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}
            className={cn("gap-1.5", filtersActive && "ring-2 ring-primary/30 text-primary")}>
            <Filter size={13} />
            <span className="hidden sm:inline">Filters</span>
            {filtersActive && <span className="h-2 w-2 rounded-full bg-primary ml-1" />}
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exporting || !data} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0">
            {exporting ? <WeaveSpinner size={13} className="animate-spin" /> : <Download size={13} />}
            Export
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {data?.summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Actions Today</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{data.summary.todayCount}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">This Week</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{data.summary.weekCount}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Top Admin Today</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
              {data.summary.topAdmins[0]?.adminName ?? "—"}
            </p>
            {data.summary.topAdmins[0] && (
              <p className="text-xs text-slate-400">{data.summary.topAdmins[0].count} actions</p>
            )}
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Today by Category</p>
            <div className="flex flex-wrap gap-1">
              {data.summary.todayActions.slice(0, 5).map((a) => {
                const cat = CAT[a.category] ?? CAT.OTHER;
                return (
                  <span key={a.action} className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold", cat.badge)}>
                    {a.count} {cat.label}
                  </span>
                );
              })}
              {data.summary.todayActions.length === 0 && <span className="text-xs text-slate-400">No actions today</span>}
            </div>
          </div>
        </div>
      )}

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
                placeholder="Search action, admin, description…"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>

            {/* Category */}
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CAT[c]?.label ?? c}</option>)}
            </select>

            {/* Target type */}
            <select value={targetType} onChange={(e) => setTargetType(e.target.value)}
              className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="">All Resources</option>
              {TARGET_TYPES.map((t) => <option key={t} value={t}>{TARGET_LABELS[t] ?? t}</option>)}
            </select>

            {/* Admin */}
            <select value={adminId} onChange={(e) => setAdminId(e.target.value)}
              className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[150px]">
              <option value="">All Admins</option>
              {adminOptions.map((a) => <option key={a.adminId} value={a.adminId}>{a.adminName}</option>)}
            </select>
          </div>

          {/* Date range */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex items-center gap-2">
              <Calendar size={13} className="text-slate-400 shrink-0" />
              <span className="text-xs text-slate-500">Date range:</span>
            </div>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40" />
            <span className="text-slate-400 text-sm">to</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40" />

            <Button size="sm" onClick={handleApply} className="h-[38px] px-4">Apply</Button>
            <button onClick={handleReset}
              className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors">
              <X size={13} /> Reset
            </button>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {filtersActive && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-slate-500">Filters:</span>
          {applied.search     && <Chip label={`"${applied.search}"`}     onRemove={() => { setSearch(""); setApplied((p) => ({ ...p, search: "" })); }} />}
          {applied.category   && <Chip label={CAT[applied.category]?.label ?? applied.category} onRemove={() => { setCategory(""); setApplied((p) => ({ ...p, category: "" })); }} />}
          {applied.targetType && <Chip label={TARGET_LABELS[applied.targetType] ?? applied.targetType} onRemove={() => { setTargetType(""); setApplied((p) => ({ ...p, targetType: "" })); }} />}
          {applied.adminId    && <Chip label={adminOptions.find((a) => a.adminId === applied.adminId)?.adminName ?? applied.adminId} onRemove={() => { setAdminId(""); setApplied((p) => ({ ...p, adminId: "" })); }} />}
          {(applied.dateFrom || applied.dateTo) && <Chip label={`${applied.dateFrom || "…"} → ${applied.dateTo || "…"}`} onRemove={() => { setDateFrom(""); setDateTo(""); setApplied((p) => ({ ...p, dateFrom: "", dateTo: "" })); }} />}
        </div>
      )}

      {/* Log table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <WeaveSpinner size={28} />
            <p className="text-sm text-slate-500">Loading logs…</p>
          </div>
        ) : !data || data.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <ClipboardList size={32} className="opacity-25" />
            <p className="text-sm">No log entries found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                  {["Time","Category","Admin","Resource","Description","IP",""].map((h) => (
                    <th key={h} className={cn(
                      "px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap",
                      h === "IP" && "hidden lg:table-cell"
                    )}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data.map((log) => <LogRow key={log.id} log={log} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} of {data.total.toLocaleString()} entries
          </span>
          <div className="flex items-center gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 min-w-[70px] text-center">{page} / {data.totalPages}</span>
            <button disabled={page === data.totalPages} onClick={() => setPage((p) => p + 1)}
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────────
function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
      {label}
      <button onClick={onRemove} className="hover:opacity-70 transition-opacity">
        <X size={11} />
      </button>
    </span>
  );
}
