"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Home,
  Palmtree,
  Info,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WeaveSpinner } from "@/components/ui/weave-spinner";

// ── Types ─────────────────────────────────────────────────────────────────────
type DayStatus = "present" | "leave" | "absent" | "wfh" | "holiday" | "weekend" | "upcoming";

interface DayRecord {
  date: string; // YYYY-MM-DD
  status: DayStatus;
  leaveType?: string;
  holidayName?: string;
}

interface Summary {
  totalWorkingDays: number;
  presentDays: number;
  leaveDays: number;
  absentDays: number;
  wfhDays: number;
  attendancePct: number;
  leaveBreakdown: { type: string; label: string; days: number }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_CONFIG: Record<DayStatus, { bg: string; text: string; label: string }> = {
  present: {
    bg:    "bg-green-100 dark:bg-green-900/40 border border-green-200 dark:border-green-800",
    text:  "text-green-800 dark:text-green-300",
    label: "Present",
  },
  leave: {
    bg:    "bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-800",
    text:  "text-red-800 dark:text-red-300",
    label: "On Leave",
  },
  absent: {
    bg:    "bg-orange-100 dark:bg-orange-900/40 border border-orange-200 dark:border-orange-800",
    text:  "text-orange-800 dark:text-orange-300",
    label: "Absent",
  },
  wfh: {
    bg:    "bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800",
    text:  "text-blue-800 dark:text-blue-300",
    label: "WFH",
  },
  holiday: {
    bg:    "bg-purple-100 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-800",
    text:  "text-purple-800 dark:text-purple-300",
    label: "Holiday",
  },
  weekend: {
    bg:    "bg-slate-50 dark:bg-slate-900/30",
    text:  "text-slate-300 dark:text-slate-600",
    label: "Weekend",
  },
  upcoming: {
    bg:    "bg-slate-100/60 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-700",
    text:  "text-slate-400 dark:text-slate-500",
    label: "Upcoming",
  },
};

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number | string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", color)}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const now = new Date();
  // Default: previous month
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth()); // 1-12
  const [year, setYear]   = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());

  const [days, setSays]       = useState<DayRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ date: string; record: DayRecord } | null>(null);

  const maxMonth = now.getMonth() + 1; // can view up to current month
  const maxYear  = now.getFullYear();

  const canGoNext = year < maxYear || (year === maxYear && month < maxMonth);
  const canGoPrev = !(year === maxYear - 2 && month === 1); // limit 2 years back

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/employee/portal/monthly-calendar?month=${month}&year=${year}`);
      setSays(res.data.days ?? []);
      setSummary(res.data.summary ?? null);
    } catch {
      toast.error("Failed to load attendance report");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const goNext = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const goPrev = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };

  // Build a date → DayRecord map
  const dayMap = new Map<string, DayRecord>(days.map((d) => [d.date, d]));

  // Build the calendar grid: 2D array of week rows
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const attendanceColor =
    (summary?.attendancePct ?? 0) >= 90
      ? "text-green-600 dark:text-green-400"
      : (summary?.attendancePct ?? 0) >= 75
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-heading font-bold text-slate-900 dark:text-white">
            My Attendance Report
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Day-by-day view of your attendance
          </p>
        </div>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-3 shadow-sm">
        <Button variant="ghost" size="icon-sm" onClick={goPrev} disabled={!canGoPrev}>
          <ChevronLeft size={18} />
        </Button>
        <div className="text-center">
          <p className="font-heading font-bold text-slate-900 dark:text-white text-lg leading-tight">
            {MONTH_NAMES[month - 1]}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{year}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={goNext} disabled={!canGoNext}>
          <ChevronRight size={18} />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <WeaveSpinner className="animate-spin text-primary" size={28} />
        </div>
      ) : (
        <>
          {/* Summary stats */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard
                label="Working Days"
                value={summary.totalWorkingDays}
                color="bg-slate-100 dark:bg-slate-800"
                icon={<CalendarDays size={18} className="text-slate-600 dark:text-slate-300" />}
              />
              <StatCard
                label="Present"
                value={summary.presentDays}
                color="bg-green-100 dark:bg-green-900/40"
                icon={<CheckCircle2 size={18} className="text-green-600 dark:text-green-400" />}
              />
              <StatCard
                label="On Leave"
                value={summary.leaveDays}
                color="bg-red-100 dark:bg-red-900/40"
                icon={<Palmtree size={18} className="text-red-600 dark:text-red-400" />}
              />
              <StatCard
                label="Absent"
                value={summary.absentDays}
                color="bg-orange-100 dark:bg-orange-900/40"
                icon={<XCircle size={18} className="text-orange-600 dark:text-orange-400" />}
              />
              <StatCard
                label="WFH Days"
                value={summary.wfhDays}
                color="bg-blue-100 dark:bg-blue-900/40"
                icon={<Home size={18} className="text-blue-600 dark:text-blue-400" />}
              />
            </div>
          )}

          {/* Attendance rate */}
          {summary && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Attendance Rate
                </p>
                <span className={cn("text-2xl font-bold", attendanceColor)}>
                  {summary.attendancePct}%
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    summary.attendancePct >= 90
                      ? "bg-green-500"
                      : summary.attendancePct >= 75
                      ? "bg-amber-500"
                      : "bg-red-500"
                  )}
                  style={{ width: `${summary.attendancePct}%` }}
                />
              </div>
              {summary.leaveBreakdown.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {summary.leaveBreakdown.map((l) => (
                    <span
                      key={l.type}
                      className="inline-flex items-center gap-1 text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full"
                    >
                      <Palmtree size={10} />
                      {l.label}: <strong>{l.days}d</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Calendar grid */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800">
              {DAY_LABELS.map((d) => (
                <div
                  key={d}
                  className="py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Weeks */}
            {days.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
                <AlertTriangle size={32} className="mb-3 opacity-40" />
                <p className="text-sm font-medium">No data for this month</p>
                <p className="text-xs mt-1">
                  You may have joined after this period, or no records exist yet.
                </p>
              </div>
            ) : (
              weeks.map((week, wi) => (
                <div
                  key={wi}
                  className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 last:border-0"
                >
                  {week.map((dateStr, di) => {
                    if (!dateStr) {
                      return (
                        <div
                          key={di}
                          className="min-h-[64px] p-1.5 bg-slate-50/50 dark:bg-slate-950/30"
                        />
                      );
                    }

                    const record = dayMap.get(dateStr);
                    const dayNum = parseInt(dateStr.split("-")[2]);
                    const cfg    = record ? STATUS_CONFIG[record.status] : null;
                    const isToday =
                      dateStr ===
                      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

                    return (
                      <div
                        key={dateStr}
                        className={cn(
                          "min-h-[64px] p-1.5 relative cursor-default transition-all",
                          "border-r border-slate-100 dark:border-slate-800 last:border-r-0",
                          !record || record.status === "weekend"
                            ? "bg-slate-50/40 dark:bg-slate-950/20"
                            : "hover:brightness-95"
                        )}
                        onMouseEnter={() => record && setTooltip({ date: dateStr, record })}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {/* Day number */}
                        <div
                          className={cn(
                            "w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-1",
                            isToday
                              ? "bg-primary text-white"
                              : record && record.status !== "weekend"
                              ? cfg?.text
                              : "text-slate-400 dark:text-slate-600"
                          )}
                        >
                          {dayNum}
                        </div>

                        {/* Status pill */}
                        {record && record.status !== "weekend" && (
                          <div
                            className={cn(
                              "rounded-lg px-1.5 py-0.5 text-[10px] font-semibold leading-tight truncate",
                              cfg?.bg,
                              cfg?.text
                            )}
                          >
                            {record.status === "holiday"
                              ? record.holidayName ?? "Holiday"
                              : cfg?.label}
                          </div>
                        )}

                        {/* Tooltip on hover */}
                        {tooltip?.date === dateStr && record && (
                          <div className="absolute z-20 left-1/2 -translate-x-1/2 top-full mt-1 w-44 bg-slate-900 dark:bg-slate-700 text-white text-xs rounded-xl shadow-xl px-3 py-2 pointer-events-none">
                            <p className="font-semibold mb-0.5">
                              {new Date(dateStr).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                            <p className="text-slate-300">
                              Status: <strong>{STATUS_CONFIG[record.status].label}</strong>
                            </p>
                            {record.holidayName && (
                              <p className="text-slate-300 mt-0.5">{record.holidayName}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 justify-center pb-4">
            {(Object.entries(STATUS_CONFIG) as [DayStatus, typeof STATUS_CONFIG[DayStatus]][])
              .filter(([s]) => s !== "weekend" && s !== "upcoming")
              .map(([status, cfg]) => (
                <div key={status} className="flex items-center gap-1.5 text-xs">
                  <div className={cn("w-3.5 h-3.5 rounded", cfg.bg)} />
                  <span className="text-slate-600 dark:text-slate-400">{cfg.label}</span>
                </div>
              ))}
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              WFH days are counted as <strong>Present</strong> in your attendance rate.
              Holidays and weekends are excluded from working-day calculations.
              You will receive this report by email on the 1st of each month.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
