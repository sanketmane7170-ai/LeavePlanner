"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth,
  isSameDay, parseISO,
} from "date-fns";
import {
  CalendarDays, ChevronLeft, ChevronRight, Users, Home,
  Search, Filter, Download, List, Grid3x3, X, AlertCircle,
  CheckCircle2, XCircle, RefreshCw, Clock,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CalEvent {
  id: string;
  type: "LEAVE" | "WFH";
  status: string;
  leaveType: string | null;
  fromDate: string;
  toDate: string;
  isHalfDay: boolean;
  halfDaySlot: string | null;
  totalDays: number;
  reason: string;
  employee: { id: string; fullName: string; employeeId: string; department: string | null };
}

interface CalData {
  events: CalEvent[];
  holidays: { date: string; name: string }[];
  employees: { id: string; fullName: string; employeeId: string; department: string | null }[];
  summary: { onLeaveToday: number; wfhToday: number; pendingCount: number; totalEmployees: number };
  month: number;
  year: number;
}

// ── Color config (fully explicit Tailwind classes) ─────────────────────────────
const EVENT_STYLES: Record<string, { approved: string; pending: string }> = {
  SICK:               { approved: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",     pending: "bg-red-50 text-red-500 border-red-200 border-dashed dark:bg-red-900/20 dark:text-red-400 dark:border-red-800" },
  PERSONAL:           { approved: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800", pending: "bg-blue-50 text-blue-500 border-blue-200 border-dashed dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800" },
  TRANSPORT_WEATHER:  { approved: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800", pending: "bg-amber-50 text-amber-500 border-amber-200 border-dashed dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800" },
  GENERAL:            { approved: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800", pending: "bg-emerald-50 text-emerald-500 border-emerald-200 border-dashed" },
  WFH:                { approved: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-800",   pending: "bg-cyan-50 text-cyan-500 border-cyan-200 border-dashed dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800" },
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  SICK: "Sick", PERSONAL: "Personal", TRANSPORT_WEATHER: "Transport", GENERAL: "Leave",
};

function getEventStyle(ev: CalEvent): string {
  const key    = ev.type === "WFH" ? "WFH" : (ev.leaveType ?? "GENERAL");
  const styles = EVENT_STYLES[key] ?? EVENT_STYLES.GENERAL;
  return ev.status === "APPROVED" ? styles.approved : styles.pending;
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

const LEAVE_TYPE_OPTIONS = ["SICK", "PERSONAL", "TRANSPORT_WEATHER", "GENERAL"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── Excel export ──────────────────────────────────────────────────────────────
function exportExcel(data: CalData) {
  const headers = ["Date", "Employee", "ID", "Department", "Type", "Leave Type", "Duration", "Status", "Reason"];
  const rows = data.events.map((ev) => [
    format(parseISO(ev.fromDate), "dd MMM yyyy"),
    ev.employee.fullName,
    ev.employee.employeeId,
    ev.employee.department ?? "",
    ev.type,
    ev.leaveType ?? "WFH",
    ev.isHalfDay ? "Half Day" : `${ev.totalDays}d`,
    ev.status,
    ev.reason,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = [{ wch: 14 },{ wch: 22 },{ wch: 10 },{ wch: 18 },{ wch: 8 },{ wch: 18 },{ wch: 10 },{ wch: 10 },{ wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Team Calendar");
  XLSX.writeFile(wb, `Team_Calendar_${data.month}_${data.year}.xlsx`);
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, cls, icon: Icon }: { label: string; value: number | string; cls: string; icon: React.ElementType }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", cls)}>
        <Icon size={17} />
      </div>
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{value}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminTeamCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [data, setData]               = useState<CalData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [view, setView]               = useState<"calendar" | "list">("calendar");

  // Filters
  const [department, setDepartment] = useState("");
  const [leaveType, setLeaveType]   = useState("");
  const [empSearch, setEmpSearch]   = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Day popup
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const departments = data
    ? Array.from(new Set(data.employees.map((e) => e.department).filter((d): d is string => !!d)))
    : [];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        month: String(currentDate.getMonth() + 1),
        year:  String(currentDate.getFullYear()),
        ...(department && { department }),
        ...(leaveType  && { leaveType }),
      });
      const res = await api.get(`/team-calendar/admin?${params}`);
      setData(res.data);
    } catch {
      toast.error("Failed to load team calendar");
    } finally {
      setLoading(false);
    }
  }, [currentDate, department, leaveType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter events by empSearch on the client
  const filteredEvents = (data?.events ?? []).filter((ev) => {
    if (!empSearch) return true;
    const q = empSearch.toLowerCase();
    return ev.employee.fullName.toLowerCase().includes(q) || ev.employee.employeeId.toLowerCase().includes(q);
  });

  // Calendar helpers
  const monthStart  = startOfMonth(currentDate);
  const monthEnd    = endOfMonth(monthStart);
  const calStart    = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd      = endOfWeek(monthEnd,    { weekStartsOn: 0 });
  const days        = eachDayOfInterval({ start: calStart, end: calEnd });
  const weekDays    = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const holidaySet = new Map((data?.holidays ?? []).map((h) => [
    format(parseISO(h.date as unknown as string), "yyyy-MM-dd"), h.name
  ]));

  const getEventsForDay = (day: Date) => {
    const dayStr = format(day, "yyyy-MM-dd");
    return filteredEvents.filter((ev) => {
      const from = format(parseISO(ev.fromDate), "yyyy-MM-dd");
      const to   = format(parseISO(ev.toDate),   "yyyy-MM-dd");
      return dayStr >= from && dayStr <= to;
    });
  };

  const selectedDayEvents = selectedDay ? getEventsForDay(selectedDay) : [];
  const selectedHoliday   = selectedDay ? holidaySet.get(format(selectedDay, "yyyy-MM-dd")) : null;

  // ── Approve / Reject from calendar ────────────────────────────────────────
  const handleAction = async (eventId: string, type: "LEAVE" | "WFH", action: "approve" | "reject") => {
    setActionLoading(eventId);
    try {
      const base = type === "LEAVE" ? "/admin/leaves" : "/admin/wfh";
      await api.patch(`${base}/${eventId}/${action}`);
      toast.success(`${type === "LEAVE" ? "Leave" : "WFH"} ${action}d`);
      await fetchData();
      // Refresh selected day events from fresh data
      setSelectedDay((d) => d ? new Date(d) : null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const filtersActive = !!(department || leaveType || empSearch);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarDays size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Team Calendar</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              {data ? ` · ${data.summary.totalEmployees} employees` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Month navigation */}
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentDate((d) => subMonths(d, 1))}
              className="h-8 w-8 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setCurrentDate(new Date())}
              className="h-8 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium">
              Today
            </button>
            <button onClick={() => setCurrentDate((d) => addMonths(d, 1))}
              className="h-8 w-8 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button onClick={() => setView("calendar")}
              className={cn("h-7 w-8 flex items-center justify-center rounded-lg transition-colors",
                view === "calendar" ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500 hover:text-slate-700")}>
              <Grid3x3 size={14} />
            </button>
            <button onClick={() => setView("list")}
              className={cn("h-7 w-8 flex items-center justify-center rounded-lg transition-colors",
                view === "list" ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500 hover:text-slate-700")}>
              <List size={14} />
            </button>
          </div>

          <button onClick={fetchData} className="h-8 w-8 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setShowFilters((v) => !v)}
            className={cn("h-8 px-3 text-sm flex items-center gap-1.5 rounded-xl border transition-colors",
              filtersActive ? "border-primary/30 text-primary bg-primary/5" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800")}>
            <Filter size={13} />
            Filters
            {filtersActive && <span className="h-2 w-2 rounded-full bg-primary" />}
          </button>
          <Button size="sm" onClick={() => data && exportExcel(data)} disabled={!data || loading}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0 h-8">
            <Download size={13} /> Export
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Employees"  value={data.summary.totalEmployees} cls="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"       icon={Users} />
          <StatCard label="On Leave Today"   value={data.summary.onLeaveToday}   cls="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" icon={CalendarDays} />
          <StatCard label="WFH Today"        value={data.summary.wfhToday}       cls="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400"         icon={Home} />
          <StatCard label="Pending Requests" value={data.summary.pendingCount}   cls={cn(data.summary.pendingCount > 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400")} icon={data.summary.pendingCount > 0 ? AlertCircle : CheckCircle2} />
        </div>
      )}

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Employee search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)}
                placeholder="Search employee…"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            {/* Department */}
            <select value={department} onChange={(e) => setDepartment(e.target.value)}
              className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[150px]">
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {/* Leave type */}
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}
              className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="">All Types</option>
              {LEAVE_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABELS[t] ?? t}</option>)}
              <option value="WFH">WFH</option>
            </select>
            {filtersActive && (
              <button onClick={() => { setEmpSearch(""); setDepartment(""); setLeaveType(""); }}
                className="h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors">
                <X size={13} /> Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: "Sick Leave",   cls: "bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400" },
          { label: "Personal",     cls: "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400" },
          { label: "Transport",    cls: "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400" },
          { label: "General",      cls: "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400" },
          { label: "WFH",          cls: "bg-cyan-100 text-cyan-700 border border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400" },
          { label: "Public Holiday", cls: "bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-400" },
        ].map((l) => (
          <span key={l.label} className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold", l.cls)}>{l.label}</span>
        ))}
        <span className="text-[11px] text-slate-400">· Dashed border = Pending approval</span>
      </div>

      {/* ── Calendar View ────────────────────────────────────────────────────── */}
      {view === "calendar" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* Month title */}
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {format(currentDate, "MMMM yyyy")}
            </h2>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
            {weekDays.map((d) => (
              <div key={d} className="py-2 text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="relative">
            {loading && (
              <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm z-10 flex items-center justify-center">
                <WeaveSpinner size={28} />
              </div>
            )}
            <div className="grid grid-cols-7 auto-rows-[minmax(110px,auto)]">
              {days.map((day, idx) => {
                const inMonth  = isSameMonth(day, monthStart);
                const isToday  = isSameDay(day, new Date());
                const dayStr   = format(day, "yyyy-MM-dd");
                const holiday  = holidaySet.get(dayStr);
                const isWkend  = day.getDay() === 0 || day.getDay() === 6;
                const dayEvts  = getEventsForDay(day);
                const SHOW_MAX = 3;
                const overflow = dayEvts.length > SHOW_MAX ? dayEvts.length - SHOW_MAX : 0;

                return (
                  <div
                    key={dayStr}
                    onClick={() => { if (inMonth) { setSelectedDay(day); } }}
                    className={cn(
                      "border-b border-r border-slate-100 dark:border-slate-800/80 p-1.5 transition-colors cursor-pointer",
                      !inMonth && "bg-slate-50/50 dark:bg-slate-900/30 opacity-50 cursor-default",
                      holiday && inMonth && "bg-purple-50/60 dark:bg-purple-900/10",
                      isWkend && !holiday && inMonth && "bg-slate-50/40 dark:bg-slate-800/20",
                      inMonth && "hover:bg-primary/5 dark:hover:bg-primary/10",
                      (idx + 1) % 7 === 0 && "border-r-0",
                    )}
                  >
                    {/* Date number */}
                    <div className="flex items-start justify-between mb-1">
                      <span className={cn(
                        "text-sm font-semibold h-6 w-6 flex items-center justify-center rounded-full leading-none",
                        !inMonth && "text-slate-400",
                        isToday && inMonth && "bg-primary text-white shadow-sm",
                        !isToday && inMonth && "text-slate-700 dark:text-slate-300",
                      )}>
                        {format(day, "d")}
                      </span>
                      {holiday && inMonth && (
                        <span className="text-[9px] font-semibold text-purple-600 dark:text-purple-400 truncate max-w-[60px] text-right leading-tight">
                          {holiday}
                        </span>
                      )}
                    </div>

                    {/* Events */}
                    <div className="space-y-0.5">
                      {dayEvts.slice(0, SHOW_MAX).map((ev, i) => (
                        <div key={`${ev.id}-${i}`}
                          className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium truncate border transition-all", getEventStyle(ev))}
                          title={`${ev.employee.fullName} · ${ev.type === "WFH" ? "WFH" : LEAVE_TYPE_LABELS[ev.leaveType ?? "GENERAL"] ?? ev.leaveType}${ev.status === "PENDING" ? " (Pending)" : ""}${ev.isHalfDay ? " ½" : ""}`}
                        >
                          {getInitials(ev.employee.fullName)} {ev.type === "WFH" ? "WFH" : (LEAVE_TYPE_LABELS[ev.leaveType ?? ""] ?? "L")}{ev.isHalfDay ? " ½" : ""}
                          {ev.status === "PENDING" && " •"}
                        </div>
                      ))}
                      {overflow > 0 && (
                        <div className="text-[9px] font-semibold text-slate-400 pl-1">+{overflow} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── List View ────────────────────────────────────────────────────────── */}
      {view === "list" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16"><WeaveSpinner size={24} /></div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <CalendarDays size={28} className="opacity-25" />
              <p className="text-sm">No events this month</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                    {["Date","Employee","Dept","Type","Duration","Status","Action"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[...filteredEvents].sort((a,b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime()).map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400 text-xs">
                        {format(parseISO(ev.fromDate), "dd MMM")}
                        {ev.fromDate !== ev.toDate && ` → ${format(parseISO(ev.toDate), "dd MMM")}`}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 dark:text-white">{ev.employee.fullName}</p>
                        <p className="text-xs text-slate-400">{ev.employee.employeeId}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{ev.employee.department ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border", getEventStyle(ev))}>
                          {ev.type === "WFH" ? "WFH" : (LEAVE_TYPE_LABELS[ev.leaveType ?? ""] ?? ev.leaveType)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
                        {ev.isHalfDay ? "Half Day" : `${ev.totalDays}d`}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
                          ev.status === "APPROVED" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : ev.status === "PENDING" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {ev.status === "APPROVED" ? <CheckCircle2 size={10} /> : ev.status === "PENDING" ? <Clock size={10} /> : <XCircle size={10} />}
                          {ev.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {ev.status === "PENDING" && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleAction(ev.id, ev.type, "approve")} disabled={!!actionLoading}
                              className="h-6 px-2 rounded-lg text-[11px] font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 transition-colors disabled:opacity-50">
                              {actionLoading === ev.id ? <WeaveSpinner size={10} className="animate-spin" /> : "Approve"}
                            </button>
                            <button onClick={() => handleAction(ev.id, ev.type, "reject")} disabled={!!actionLoading}
                              className="h-6 px-2 rounded-lg text-[11px] font-semibold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 transition-colors disabled:opacity-50">
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Day popup ────────────────────────────────────────────────────────── */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedDay(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">
                  {format(selectedDay, "EEEE, dd MMMM yyyy")}
                </h3>
                {selectedHoliday && (
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">🏖 Public Holiday: {selectedHoliday}</p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedDayEvents.length === 0 ? "No events" : `${selectedDayEvents.length} event${selectedDayEvents.length > 1 ? "s" : ""}`}
                </p>
              </div>
              <button onClick={() => setSelectedDay(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X size={15} />
              </button>
            </div>

            {/* Events list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {selectedDayEvents.length === 0 && !selectedHoliday && (
                <p className="text-sm text-slate-400 text-center py-6">No leaves or WFH on this day.</p>
              )}
              {selectedHoliday && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                  <div className="h-9 w-9 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0 text-lg">🏖</div>
                  <div>
                    <p className="text-sm font-semibold text-purple-800 dark:text-purple-300">{selectedHoliday}</p>
                    <p className="text-xs text-purple-600 dark:text-purple-400">Public Holiday</p>
                  </div>
                </div>
              )}
              {selectedDayEvents.map((ev) => (
                <div key={ev.id} className={cn("rounded-xl border p-3 space-y-2", getEventStyle(ev))}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-white/50 dark:bg-slate-800/50 flex items-center justify-center text-xs font-bold shrink-0">
                        {getInitials(ev.employee.fullName)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{ev.employee.fullName}</p>
                        <p className="text-[11px] opacity-70 truncate">{ev.employee.employeeId}{ev.employee.department ? ` · ${ev.employee.department}` : ""}</p>
                      </div>
                    </div>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                      ev.status === "APPROVED" ? "bg-white/60 dark:bg-slate-700/60" : "bg-amber-200/60 dark:bg-amber-900/60"
                    )}>
                      {ev.status}
                    </span>
                  </div>

                  <div className="text-xs opacity-80 space-y-0.5">
                    <p><strong>Type:</strong> {ev.type === "WFH" ? "Work From Home" : `${LEAVE_TYPE_LABELS[ev.leaveType ?? ""] ?? ev.leaveType} Leave`}</p>
                    <p><strong>Duration:</strong> {ev.isHalfDay ? `Half Day${ev.halfDaySlot ? ` (${ev.halfDaySlot === "FIRST_HALF" ? "Morning" : "Afternoon"})` : ""}` : `${ev.totalDays} day${ev.totalDays !== 1 ? "s" : ""}`}</p>
                    {ev.reason && <p className="truncate"><strong>Reason:</strong> {ev.reason}</p>}
                  </div>

                  {ev.status === "PENDING" && (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => handleAction(ev.id, ev.type, "approve")} disabled={!!actionLoading}
                        className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                        {actionLoading === ev.id ? <WeaveSpinner size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                        Approve
                      </button>
                      <button onClick={() => handleAction(ev.id, ev.type, "reject")} disabled={!!actionLoading}
                        className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 disabled:opacity-50 transition-colors">
                        <XCircle size={11} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="px-4 pb-4 pt-2 shrink-0">
              <Button variant="outline" size="sm" className="w-full" onClick={() => setSelectedDay(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
