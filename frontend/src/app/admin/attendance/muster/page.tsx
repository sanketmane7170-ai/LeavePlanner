"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  ClipboardCheck, Download, RefreshCw, Search,
  ChevronLeft, ChevronRight, Users, CalendarDays, Home, UserX, X, Info,
  Pencil, RotateCcw, Save, AlertCircle, CheckCircle2,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
// U = Unpaid leave (fully unpaid approved leave, no salary impact)
type MusterStatus = "P" | "A" | "L" | "U" | "HD" | "WFH" | "WO" | "H" | "-" | "·";

interface CorrectionMeta {
  id: string;
  originalStatus: string;
  correctedStatus: string;
  reason: string | null;
}

interface MusterEmployee {
  id: string;
  fullName: string;
  employeeId: string;
  department: string | null;
  designation: string | null;
  attendance: Record<number, MusterStatus>;
  correctionMeta: Record<number, CorrectionMeta>;
  summary: {
    present: number; absent: number; leave: number; unpaidLeave: number;
    halfDay: number; wfh: number; weekOff: number;
    holiday: number; workingDays: number;
  };
}

interface MusterData {
  employees: MusterEmployee[];
  totalEmployees: number;
  daysInMonth: number;
  holidays: { date: string; name: string }[];
  month: number;
  year: number;
  page: number;
  limit: number;
  totalPages: number;
  totals: { present: number; absent: number; leave: number; unpaidLeave: number; wfh: number; halfDay: number };
}

interface TodaySummary {
  total: number; present: number; onLeave: number; onWfh: number; absent: number; isHoliday: boolean;
}

interface CellDetail {
  employee: MusterEmployee;
  day: number;
  dateStr: string;
  isoDate: string;        // YYYY-MM-DD for API
  status: MusterStatus;
  holidayName?: string;
  correction?: CorrectionMeta;
}

// ── Status config (all classes explicit — no dynamic Tailwind strings) ────────
const S: Record<MusterStatus, { label: string; cell: string; badge: string }> = {
  P:   { label: "Present",      cell: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700",   badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700" },
  A:   { label: "Absent",       cell: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-700",                           badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-700" },
  L:   { label: "Leave (Paid)", cell: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-700",         badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-700" },
  U:   { label: "Unpaid Leave", cell: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-200 dark:border-rose-700",                    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-200 dark:border-rose-700" },
  HD:  { label: "Half Day",     cell: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700",         badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-700" },
  WFH: { label: "WFH",          cell: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-700",                    badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-700" },
  WO:  { label: "Week Off",     cell: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700",                  badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700" },
  H:   { label: "Holiday",      cell: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-700",         badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-700" },
  "-": { label: "Pre-joining",  cell: "", badge: "" },
  "·": { label: "Upcoming",     cell: "", badge: "" },
};

// Fixed summary column styles — no dynamic class generation
const SUMMARY_COLS: { key: keyof MusterEmployee["summary"]; label: string; th: string; td: string }[] = [
  { key: "present",     label: "P",  th: "text-emerald-600 dark:text-emerald-400", td: "text-emerald-700 dark:text-emerald-400 font-bold" },
  { key: "absent",      label: "A",  th: "text-red-600 dark:text-red-400",         td: "text-red-700 dark:text-red-400 font-bold" },
  { key: "leave",       label: "L",  th: "text-orange-600 dark:text-orange-400",   td: "text-orange-700 dark:text-orange-400 font-bold" },
  { key: "unpaidLeave", label: "U",  th: "text-rose-600 dark:text-rose-400",       td: "text-rose-700 dark:text-rose-400 font-bold" },
  { key: "wfh",         label: "WFH",th: "text-cyan-600 dark:text-cyan-400",       td: "text-cyan-700 dark:text-cyan-400 font-bold" },
  { key: "halfDay",     label: "HD", th: "text-yellow-600 dark:text-yellow-400",   td: "text-yellow-700 dark:text-yellow-400 font-bold" },
  { key: "weekOff",     label: "WO", th: "text-slate-500 dark:text-slate-400",     td: "text-slate-500 dark:text-slate-400" },
  { key: "workingDays", label: "WDs",th: "text-blue-600 dark:text-blue-400",       td: "text-blue-700 dark:text-blue-400 font-bold" },
];

const DOW_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, cls, icon: Icon }: {
  label: string; value: number | string; cls: string; icon: React.ElementType;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", cls)}>
        <Icon size={17} />
      </div>
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}

// ── Excel export ──────────────────────────────────────────────────────────────
function exportExcel(data: MusterData, orgName = "Attendance Muster") {
  const wb    = XLSX.utils.book_new();
  const month = MONTHS[data.month - 1];
  const days  = data.daysInMonth;

  // ── Sheet 1: Muster ───────────────────────────────────────────────────────
  const musterHeader = [
    "Emp ID", "Name", "Department", "Designation",
    ...Array.from({ length: days }, (_, i) => String(i + 1)),
    "P", "A", "L (Paid)", "U (Unpaid)", "WFH", "HD", "WO", "H", "Working Days",
  ];
  const musterRows = data.employees.map((e) => [
    e.employeeId, e.fullName, e.department ?? "", e.designation ?? "",
    ...Array.from({ length: days }, (_, i) => e.attendance[i + 1] ?? ""),
    e.summary.present, e.summary.absent, e.summary.leave, e.summary.unpaidLeave,
    e.summary.wfh, e.summary.halfDay, e.summary.weekOff,
    e.summary.holiday, e.summary.workingDays,
  ]);

  const musterWs = XLSX.utils.aoa_to_sheet([
    [`${orgName} — ${month} ${data.year}`],
    [],
    musterHeader,
    ...musterRows,
  ]);

  // Column widths
  musterWs["!cols"] = [
    { wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 18 },
    ...Array.from({ length: days }, () => ({ wch: 4 })),
    ...Array.from({ length: 8 }, () => ({ wch: 6 })),
  ];

  XLSX.utils.book_append_sheet(wb, musterWs, "Muster");

  // ── Sheet 2: Summary ──────────────────────────────────────────────────────
  const summaryHeader = ["Emp ID", "Name", "Department", "Designation", "Working Days", "Present", "Paid Leave", "Unpaid Leave", "Absent", "WFH", "Half Day", "Week Off", "Holiday"];
  const summaryRows = data.employees.map((e) => [
    e.employeeId, e.fullName, e.department ?? "", e.designation ?? "",
    e.summary.workingDays, e.summary.present, e.summary.leave, e.summary.unpaidLeave,
    e.summary.absent, e.summary.wfh, e.summary.halfDay,
    e.summary.weekOff, e.summary.holiday,
  ]);

  const summaryWs = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryRows]);
  summaryWs["!cols"] = [{ wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, ...Array.from({ length: 8 }, () => ({ wch: 12 }))];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

  XLSX.writeFile(wb, `Attendance_Muster_${data.month}_${data.year}.xlsx`);
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MusterViewPage() {
  const now = new Date();

  // Filter state
  const [month, setMonth]   = useState(now.getMonth() + 1);
  const [year, setYear]     = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [dept, setDept]     = useState("");

  // Applied filter state (only updates on Apply/auto-apply)
  const [applied, setApplied] = useState({ month: now.getMonth() + 1, year: now.getFullYear(), search: "", dept: "" });

  const [page, setPage]             = useState(1);
  const [data, setData]             = useState<MusterData | null>(null);
  const [todaySummary, setToday]    = useState<TodaySummary | null>(null);
  const [departments, setDepts]     = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);
  const [exporting, setExporting]   = useState(false);
  const [detail, setDetail]         = useState<CellDetail | null>(null);

  const limit = 20;

  // Fetch muster data
  const fetchData = async (m: number, y: number, s: string, d: string, pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        month: String(m), year: String(y), page: String(pg), limit: String(limit),
        ...(s && { search: s }), ...(d && { department: d }),
      });
      const res = await api.get(`/admin/attendance/muster?${params}`);
      setData(res.data);
    } catch {
      toast.error("Failed to load muster data");
    } finally {
      setLoading(false);
    }
  };

  // Initial load — one-time fetches
  useEffect(() => {
    api.get("/admin/attendance/today-summary").then((r) => setToday(r.data)).catch(() => {});
    api.get("/admin/employees/departments").then((r) => setDepts(r.data ?? [])).catch(() => {});
  }, []);

  // Fetch when applied filters or page change
  useEffect(() => {
    fetchData(applied.month, applied.year, applied.search, applied.dept, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, page]);

  const handleApply = () => {
    setPage(1);
    setApplied({ month, year, search, dept });
  };

  const handleReset = () => {
    const defaults = { month: now.getMonth() + 1, year: now.getFullYear(), search: "", dept: "" };
    setMonth(defaults.month);
    setYear(defaults.year);
    setSearch(defaults.search);
    setDept(defaults.dept);
    setPage(1);
    setApplied(defaults);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        month: String(applied.month), year: String(applied.year), export: "true",
        ...(applied.search && { search: applied.search }),
        ...(applied.dept && { department: applied.dept }),
      });
      const res = await api.get(`/admin/attendance/muster?${params}`);
      exportExcel(res.data);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  // Build day headers from the active data
  const dayHeaders = data
    ? Array.from({ length: data.daysInMonth }, (_, i) => {
        const d          = new Date(data.year, data.month - 1, i + 1);
        const dayNum     = i + 1;
        const dow        = d.getDay(); // 0=Sun, 6=Sat
        const isWeekend  = dow === 0 || dow === 6;
        const ds         = `${data.year}-${String(data.month).padStart(2,"0")}-${String(dayNum).padStart(2,"0")}`;
        const holiday    = data.holidays.find((h) => h.date === ds);
        return { dayNum, dow, label: DOW_SHORT[dow], isWeekend, holiday };
      })
    : [];

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const filtersChanged = month !== applied.month || year !== applied.year || search !== applied.search || dept !== applied.dept;

  return (
    <div className="p-4 sm:p-6 space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ClipboardCheck size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Attendance Muster</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {MONTHS[applied.month - 1]} {applied.year}
              {data ? ` · ${data.totalEmployees} employees` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => fetchData(applied.month, applied.year, applied.search, applied.dept, page)} disabled={loading} className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exporting || !data} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0">
            {exporting ? <WeaveSpinner size={13} className="animate-spin" /> : <Download size={13} />}
            Export Excel
          </Button>
        </div>
      </div>

      {/* ── Today's summary cards ────────────────────────────────────────────── */}
      {todaySummary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label="Total Employees" value={todaySummary.total}   cls="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"       icon={Users} />
          <StatCard label="Present Today"   value={todaySummary.isHoliday ? "Holiday" : todaySummary.present}
                    cls="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" icon={CalendarDays} />
          <StatCard label="On Leave"        value={todaySummary.onLeave}  cls="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"  icon={CalendarDays} />
          <StatCard label="WFH"             value={todaySummary.onWfh}    cls="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400"          icon={Home} />
          <StatCard label="Absent"          value={todaySummary.absent}   cls="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"              icon={UserX} />
        </div>
      )}

      {/* ── Filter bar ───────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
              placeholder="Search by name or ID…"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Department */}
          <select value={dept} onChange={(e) => setDept(e.target.value)}
            className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[140px]">
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>

          {/* Month */}
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
            className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>

          {/* Year */}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Apply */}
          <Button
            size="sm"
            onClick={handleApply}
            className={cn("h-[38px] px-4 gap-1.5", filtersChanged && "ring-2 ring-primary/30")}
          >
            {filtersChanged ? "● Apply" : "Apply"}
          </Button>

          {/* Reset */}
          <button onClick={handleReset}
            className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors">
            <X size={13} /> Reset
          </button>
        </div>

        {filtersChanged && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
            <Info size={11} /> Filters changed — click Apply to update the muster.
          </p>
        )}
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(["P","A","L","U","HD","WFH","WO","H"] as MusterStatus[]).map((s) => (
          <span key={s} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold", S[s].badge)}>
            {s} {S[s].label}
          </span>
        ))}
        <span className="text-[11px] text-slate-400 ml-1">· = upcoming day</span>
      </div>

      {/* ── Muster Grid ──────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <WeaveSpinner size={28} />
            <p className="text-sm text-slate-500">Loading attendance data…</p>
          </div>
        ) : !data || data.employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <ClipboardCheck size={32} className="opacity-25" />
            <p className="text-sm">No employees found for the selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse text-xs" style={{ minWidth: "max-content" }}>
              {/* ── Column groups for visual separation ── */}
              <colgroup>
                <col style={{ minWidth: 180 }} />
                {Array.from({ length: data.daysInMonth }, (_, i) => <col key={i} style={{ width: 32 }} />)}
                {SUMMARY_COLS.map((c) => <col key={c.key} style={{ width: 38 }} />)}
              </colgroup>

              {/* ── Header ── */}
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-50 dark:bg-slate-950 px-3 py-3 text-left text-xs font-bold text-slate-600 dark:text-slate-300 border-b border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                    Employee
                  </th>
                  {dayHeaders.map(({ dayNum, label, isWeekend, holiday }) => (
                    <th
                      key={dayNum}
                      title={holiday ? `Public Holiday: ${holiday.name}` : undefined}
                      className={cn(
                        "px-0 py-1.5 text-center border-b border-slate-200 dark:border-slate-800",
                        holiday
                          ? "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400"
                          : isWeekend
                          ? "bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500"
                          : "bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400"
                      )}
                    >
                      <div className="font-bold leading-tight">{String(dayNum).padStart(2,"0")}</div>
                      <div className="text-[9px] font-normal opacity-80 leading-tight">{label}</div>
                    </th>
                  ))}
                  {/* Summary headers */}
                  {SUMMARY_COLS.map((c) => (
                    <th key={c.key} className={cn(
                      "px-1 py-3 text-center text-[10px] font-bold border-b border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950",
                      c.th
                    )}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* ── Body ── */}
              <tbody>
                {data.employees.map((emp, idx) => {
                  const isEven = idx % 2 === 0;
                  const rowBg  = isEven ? "bg-white dark:bg-slate-900" : "bg-slate-50/60 dark:bg-slate-800/20";

                  return (
                    <tr key={emp.id} className={cn("hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors group", rowBg)}>
                      {/* Sticky employee cell */}
                      <td className={cn(
                        "sticky left-0 z-10 px-3 py-2 border-b border-r border-slate-100 dark:border-slate-800 group-hover:bg-primary/5 dark:group-hover:bg-primary/10",
                        rowBg
                      )}>
                        <p className="font-semibold text-slate-900 dark:text-white truncate max-w-[165px] leading-tight">
                          {emp.fullName}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-tight">
                          {emp.employeeId}{emp.department ? ` · ${emp.department}` : ""}
                        </p>
                      </td>

                      {/* Day cells */}
                      {dayHeaders.map(({ dayNum, isWeekend, holiday }) => {
                        const status = emp.attendance[dayNum] ?? "-";
                        const cfg    = S[status];

                        if (status === "-") {
                          return (
                            <td key={dayNum} className={cn("border-b border-slate-100 dark:border-slate-800/60 p-0.5 text-center", isWeekend ? "bg-slate-50/80 dark:bg-slate-800/30" : "")}>
                              <span className="flex items-center justify-center w-7 h-6 text-[10px] text-slate-200 dark:text-slate-700">—</span>
                            </td>
                          );
                        }
                        if (status === "·") {
                          return (
                            <td key={dayNum} className="border-b border-slate-100 dark:border-slate-800/60 p-0.5 text-center">
                              <span className="flex items-center justify-center w-7 h-6 text-[11px] text-slate-300 dark:text-slate-600">·</span>
                            </td>
                          );
                        }

                        return (
                          <td key={dayNum} className={cn("border-b border-slate-100 dark:border-slate-800/60 p-0.5 text-center", holiday ? "bg-purple-50/60 dark:bg-purple-900/10" : isWeekend ? "bg-slate-50/80 dark:bg-slate-800/30" : "")}>
                            <button
                              onClick={() => {
                                const iso = `${data.year}-${String(data.month).padStart(2,"0")}-${String(dayNum).padStart(2,"0")}`;
                                setDetail({
                                  employee: emp,
                                  day: dayNum,
                                  isoDate: iso,
                                  dateStr: new Date(data.year, data.month - 1, dayNum).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }),
                                  status,
                                  holidayName: holiday?.name,
                                  correction: emp.correctionMeta?.[dayNum],
                                });
                              }}
                              title={emp.correctionMeta?.[dayNum] ? `Corrected (was ${emp.correctionMeta[dayNum].originalStatus})` : cfg.label}
                              className={cn(
                                "relative flex items-center justify-center w-7 h-6 rounded text-[10px] font-bold transition-transform hover:scale-110",
                                cfg.cell,
                                emp.correctionMeta?.[dayNum] && "ring-2 ring-violet-400 dark:ring-violet-500"
                              )}
                            >
                              {status}
                              {emp.correctionMeta?.[dayNum] && (
                                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-violet-500 border border-white dark:border-slate-900" />
                              )}
                            </button>
                          </td>
                        );
                      })}

                      {/* Summary cells */}
                      {SUMMARY_COLS.map((c) => (
                        <td key={c.key} className={cn(
                          "px-1 py-2 text-center border-b border-l border-slate-100 dark:border-slate-800/60 tabular-nums text-xs",
                          c.td
                        )}>
                          {emp.summary[c.key]}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>

              {/* ── Page totals row ── */}
              {data.employees.length > 1 && (
                <tfoot>
                  <tr className="bg-slate-100 dark:bg-slate-800/60 border-t-2 border-slate-300 dark:border-slate-700">
                    <td className="sticky left-0 z-10 px-3 py-2 bg-slate-100 dark:bg-slate-800/60 font-bold text-xs text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700">
                      Page Totals
                    </td>
                    {Array.from({ length: data.daysInMonth }, (_, i) => (
                      <td key={i} className="border-l border-slate-200 dark:border-slate-700" />
                    ))}
                    {SUMMARY_COLS.map((c) => {
                      const total = data.employees.reduce((s, e) => s + e.summary[c.key], 0);
                      return (
                        <td key={c.key} className={cn("px-1 py-2 text-center border-l border-slate-200 dark:border-slate-700 font-bold text-xs tabular-nums", c.th)}>
                          {total}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────────── */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Showing {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.totalEmployees)} of {data.totalEmployees} employees
          </span>
          <div className="flex items-center gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 min-w-[70px] text-center">
              {page} / {data.totalPages}
            </span>
            <button disabled={page === data.totalPages} onClick={() => setPage((p) => p + 1)}
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Day detail + edit modal ───────────────────────────────────────────── */}
      {detail && (
        <AttendanceDetailModal
          detail={detail}
          onClose={() => setDetail(null)}
          onSaved={() => {
            setDetail(null);
            fetchData(applied.month, applied.year, applied.search, applied.dept, page);
          }}
        />
      )}
    </div>
  );
}

// ── Attendance Detail + Edit Modal ────────────────────────────────────────────
const EDITABLE_STATUSES: MusterStatus[] = ["P", "A", "L", "U", "HD", "WFH"];

function AttendanceDetailModal({
  detail,
  onClose,
  onSaved,
}: {
  detail: CellDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [editMode, setEditMode]   = useState(false);
  const [newStatus, setNewStatus] = useState<MusterStatus>(detail.status);
  const [reason, setReason]       = useState(detail.correction?.reason ?? "");
  const [saving, setSaving]       = useState(false);
  const [reverting, setReverting] = useState(false);

  const isEditable = detail.status !== "-" && detail.status !== "·";

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post("/admin/attendance/correction", {
        employeeId:      detail.employee.id,
        date:            detail.isoDate,
        correctedStatus: newStatus,
        originalStatus:  detail.correction?.originalStatus ?? detail.status,
        reason:          reason.trim() || null,
      });
      toast.success(`Attendance updated to ${newStatus} for ${detail.employee.fullName} on ${detail.dateStr}`);
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to save correction");
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async () => {
    if (!detail.correction) return;
    setReverting(true);
    try {
      await api.delete(`/admin/attendance/correction/${detail.correction.id}`);
      toast.success("Correction removed — attendance reverted to derived status");
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to revert correction");
    } finally {
      setReverting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <X size={15} />
        </button>

        {/* Header */}
        <div className="mb-4 pr-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Attendance</p>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">{detail.employee.fullName}</h3>
          <p className="text-xs text-slate-500">
            {detail.employee.employeeId}
            {detail.employee.department ? ` · ${detail.employee.department}` : ""}
          </p>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">{detail.dateStr}</p>
        </div>

        {/* Correction banner */}
        {detail.correction && !editMode && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 mb-4">
            <AlertCircle size={14} className="text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
            <div className="text-xs text-violet-700 dark:text-violet-300">
              <span className="font-semibold">Admin correction applied.</span>
              <span className="ml-1">
                Was <strong>{detail.correction.originalStatus}</strong> → Now <strong>{detail.correction.correctedStatus}</strong>
              </span>
              {detail.correction.reason && (
                <p className="mt-0.5 italic text-violet-600 dark:text-violet-400">"{detail.correction.reason}"</p>
              )}
            </div>
          </div>
        )}

        {/* Current status badge */}
        {!editMode && (
          <>
            <div className={cn("inline-flex items-center gap-2 px-3 py-1.5 rounded-xl mb-4 text-sm font-bold", S[detail.status]?.badge ?? "bg-slate-100 text-slate-600")}>
              {detail.status} — {S[detail.status]?.label ?? "—"}
              {detail.correction && (
                <span className="text-xs font-normal opacity-75 ml-1">
                  (corrected)
                </span>
              )}
            </div>

            {detail.holidayName && (
              <p className="text-xs text-purple-600 dark:text-purple-400 mb-3 flex items-center gap-1">
                <span className="font-semibold">Holiday:</span> {detail.holidayName}
              </p>
            )}

            {/* Month summary */}
            <div className="grid grid-cols-4 gap-2 mb-5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              {[
                { label: "P",      val: detail.employee.summary.present,     cls: "text-emerald-600 dark:text-emerald-400" },
                { label: "A",      val: detail.employee.summary.absent,      cls: "text-red-600 dark:text-red-400" },
                { label: "L",      val: detail.employee.summary.leave,       cls: "text-orange-600 dark:text-orange-400" },
                { label: "U",      val: detail.employee.summary.unpaidLeave, cls: "text-rose-600 dark:text-rose-400" },
                { label: "WFH",    val: detail.employee.summary.wfh,         cls: "text-cyan-600 dark:text-cyan-400" },
                { label: "HD",     val: detail.employee.summary.halfDay,     cls: "text-yellow-600 dark:text-yellow-400" },
              ].map(({ label, val, cls }) => (
                <div key={label} className="text-center">
                  <p className={cn("text-lg font-bold tabular-nums leading-tight", cls)}>{val}</p>
                  <p className="text-[10px] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Edit form */}
        {editMode && (
          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                New Attendance Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                {EDITABLE_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setNewStatus(s)}
                    className={cn(
                      "py-2.5 rounded-xl border-2 text-xs font-bold transition-all",
                      newStatus === s
                        ? cn(S[s].cell, "border-current scale-105")
                        : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300"
                    )}
                  >
                    {s}
                    <span className="block text-[9px] font-normal mt-0.5 opacity-80">{S[s].label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Reason <span className="font-normal normal-case text-slate-400">(optional)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Employee was present but system showed absent"
                rows={3}
                className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {!editMode ? (
            <>
              {isEditable && (
                <Button size="sm" variant="outline" onClick={() => { setEditMode(true); setNewStatus(detail.status); }}
                  className="flex-1 gap-1.5">
                  <Pencil size={13} /> Edit
                </Button>
              )}
              {detail.correction && (
                <Button size="sm" variant="outline" onClick={handleRevert} disabled={reverting}
                  className="flex-1 gap-1.5 text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20">
                  {reverting ? <WeaveSpinner size={12} className="animate-spin" /> : <RotateCcw size={13} />}
                  Revert
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onClose} className={cn(isEditable || detail.correction ? "" : "flex-1")}>
                Close
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditMode(false)} disabled={saving} className="flex-1">
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || newStatus === detail.status}
                className="flex-1 gap-1.5">
                {saving ? <WeaveSpinner size={12} className="animate-spin" /> : <Save size={13} />}
                {saving ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </div>

        {/* Info note */}
        {editMode && newStatus === detail.status && (
          <p className="text-xs text-slate-400 text-center mt-2 flex items-center justify-center gap-1">
            <Info size={11} /> Select a different status to save
          </p>
        )}
      </div>
    </div>
  );
}
