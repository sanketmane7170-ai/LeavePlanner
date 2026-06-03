"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { BarChart2, Search, ChevronLeft, ChevronRight, RefreshCw, Download, X, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface SummaryRow {
  id: string;
  fullName: string;
  employeeId: string;
  department: string | null;
  designation: string | null;
  totalWorkingDays: number | null;
  presentDays: number | null;
  leaveDays: number | null;
  absentDays: number | null;
  wfhDays: number | null;
  attendancePct: number | null;
  generated: string | null;
}

interface SummaryData {
  rows: SummaryRow[];
  totalEmployees: number;
  month: number;
  year: number;
  page: number;
  limit: number;
  totalPages: number;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── Attendance bar ────────────────────────────────────────────────────────────
function AttBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-slate-400">—</span>;
  const color = pct >= 90 ? "bg-emerald-500" : pct >= 75 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums w-10 text-right">{pct}%</span>
    </div>
  );
}

// ── Excel export ──────────────────────────────────────────────────────────────
function exportExcel(data: SummaryData) {
  const header = ["Emp ID","Name","Department","Designation","Working Days","Present","Leave","Absent","WFH","Attendance %"];
  const rows = data.rows.map((r) => [
    r.employeeId, r.fullName, r.department ?? "", r.designation ?? "",
    r.totalWorkingDays ?? "", r.presentDays ?? "", r.leaveDays ?? "",
    r.absentDays ?? "", r.wfhDays ?? "", r.attendancePct ?? "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([
    [`Monthly Attendance Summary — ${MONTHS[data.month - 1]} ${data.year}`],
    [],
    header,
    ...rows,
  ]);
  ws["!cols"] = [{ wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, ...Array.from({ length: 6 }, () => ({ wch: 13 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Monthly Summary");
  XLSX.writeFile(wb, `Monthly_Summary_${data.month}_${data.year}.xlsx`);
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MonthlySummaryPage() {
  const now  = new Date();
  const [month, setMonth]     = useState(now.getMonth() + 1);
  const [year, setYear]       = useState(now.getFullYear());
  const [search, setSearch]   = useState("");
  const [dept, setDept]       = useState("");
  const [departments, setDepts] = useState<string[]>([]);
  const [page, setPage]       = useState(1);
  const limit = 25;

  const [data, setData]       = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        month: String(month), year: String(year),
        page: String(page), limit: String(limit),
        ...(search && { search }), ...(dept && { department: dept }),
      });
      const res = await api.get(`/admin/attendance/monthly-summary?${params}`);
      setData(res.data);
    } catch {
      toast.error("Failed to load monthly summary");
    } finally {
      setLoading(false);
    }
  }, [month, year, page, search, dept]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    setPage(1);
    api.get("/admin/employees/departments").then((r) => setDepts(r.data ?? [])).catch(() => {});
  }, [month, year, search, dept]);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const noReports = data && data.rows.every((r) => r.totalWorkingDays === null);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <BarChart2 size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Monthly Attendance Summary</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {MONTHS[month - 1]} {year} · {data?.totalEmployees ?? "—"} employees
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => data && exportExcel(data)} disabled={!data || loading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0">
            <Download size={13} /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee…"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <select value={dept} onChange={(e) => setDept(e.target.value)}
            className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40">
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
            className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {(search || dept) && (
            <button onClick={() => { setSearch(""); setDept(""); }}
              className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors">
              <X size={13} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Info banner if no reports generated yet */}
      {noReports && !loading && (
        <div className="flex items-start gap-2.5 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Monthly reports for {MONTHS[month - 1]} {year} have not been generated yet. Reports are auto-generated on the 1st of each month. Use the <strong>Muster View</strong> for live daily attendance data.
          </span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><WeaveSpinner size={28} /></div>
        ) : !data || data.rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <BarChart2 size={32} className="opacity-25" />
            <p className="text-sm">No employees found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800">
                  {["Employee","Department","Working Days","Present","Leave","Absent","WFH","Attendance"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{row.fullName}</p>
                      <p className="text-xs text-slate-400">{row.employeeId}{row.designation ? ` · ${row.designation}` : ""}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.department ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                      {row.totalWorkingDays ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("font-semibold tabular-nums", row.presentDays !== null ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400")}>
                        {row.presentDays ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("font-semibold tabular-nums", row.leaveDays !== null && row.leaveDays > 0 ? "text-orange-600 dark:text-orange-400" : "text-slate-500")}>
                        {row.leaveDays ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("font-semibold tabular-nums", row.absentDays !== null && row.absentDays > 0 ? "text-red-600 dark:text-red-400" : "text-slate-500")}>
                        {row.absentDays ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("font-semibold tabular-nums", row.wfhDays !== null && row.wfhDays > 0 ? "text-cyan-600 dark:text-cyan-400" : "text-slate-500")}>
                        {row.wfhDays ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 min-w-[120px]">
                      <AttBar pct={row.attendancePct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">{(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.totalEmployees)} of {data.totalEmployees}</span>
          <div className="flex items-center gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 min-w-[60px] text-center">{page} / {data.totalPages}</span>
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
