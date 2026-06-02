"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarDays, Home, Plus, ChevronLeft, ChevronRight,
  Calendar, Star, Users,
} from "lucide-react";
import api from "@/lib/api";
import { LEAVE_TYPE_LABELS, leaveStatusVariant, formatDate } from "@/lib/utils";
import type { LeaveBalance } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";



// ── Types ─────────────────────────────────────────────────────────────────────
interface WfhBalance {
  policy: { name: string; daysAllowed: number } | null;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  month: number;
  year: number;
}

interface RecentApp {
  id: string;
  appType: "LEAVE" | "WFH";
  leaveType?: string;
  fromDate: string;
  toDate: string;
  totalDays: number;
  status: string;
  reason: string;
  createdAt: string;
}

interface CalendarEvent {
  date: string;
  type: "LEAVE" | "WFH" | "HOLIDAY";
  status?: string;
  leaveType?: string;
  name?: string;
}

interface Holiday { id: string; name: string; date: string; year: number; }

interface DashboardData {
  leaveBalances: LeaveBalance[];
  wfhBalance: WfhBalance;
  recentApplications: RecentApp[];
  upcomingHolidays: Holiday[];
  calendarEvents: CalendarEvent[];
  employee: {
    fullName: string;
    employeeId: string;
    leavePolicy: any;
    wfhPolicy: any;
    reportingManager?: { fullName: string } | null;
    workingSchedule?: { workingDays: string[]; saturdayRule: string } | null;
    probationMonths?: number;
    dateOfJoining?: string | null;
  };
  currentMonth: number;
  currentYear: number;
}

// ── Status badge ──────────────────────────────────────────────────────────────
type SV = "success" | "warning" | "destructive" | "gray" | "default";
const svClass: Record<SV, string> = {
  success:     "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  warning:     "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  destructive: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  gray:        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  default:     "bg-primary/10 text-primary",
};
function StatusBadge({ status }: { status: string }) {
  const v = leaveStatusVariant(status as any) as SV;
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", svClass[v])}>{status}</span>;
}

// ── Balance card ──────────────────────────────────────────────────────────────
function BalanceCard({
  label, usedDays, totalDays, remainingDays, pendingDays = 0, color,
}: {
  label: string; usedDays: number; totalDays: number; remainingDays: number;
  pendingDays?: number; color: string;
}) {
  const pct = totalDays > 0 ? (usedDays / totalDays) * 100 : 0;
  const barColor = remainingDays > totalDays * 0.5 ? "bg-green-500" : remainingDays > totalDays * 0.2 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center mb-2.5", color)}>
        <CalendarDays size={16} />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">{label}</p>
      <p className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
        {remainingDays}
        <span className="text-sm font-normal text-slate-500 ml-1">/ {totalDays}</span>
      </p>
      <div className="mt-1.5 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-slate-400">
        <span>{usedDays} used{pendingDays > 0 ? ` · ${pendingDays} pending` : ""}</span>
        <span>{remainingDays} left</span>
      </div>
    </div>
  );
}

// ── Mini Calendar ─────────────────────────────────────────────────────────────
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

function MiniCalendar({
  year, month, events,
}: {
  year: number; month: number; events: CalendarEvent[];
}) {
  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(month);

  const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const today = new Date();

  // Build event map for the viewed month
  const eventMap: Record<string, CalendarEvent[]> = {};
  events.forEach((e) => {
    const d = new Date(e.date);
    if (d.getFullYear() === viewYear && d.getMonth() + 1 === viewMonth) {
      const key = d.getDate().toString();
      if (!eventMap[key]) eventMap[key] = [];
      eventMap[key].push(e);
    }
  });

  const prevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const getDotColor = (ev: CalendarEvent): string => {
    if (ev.type === "HOLIDAY") return "bg-purple-400";
    if (ev.type === "WFH") return ev.status === "APPROVED" ? "bg-green-500" : "bg-teal-400";
    if (ev.type === "LEAVE") return ev.status === "APPROVED" ? "bg-primary" : "bg-amber-400";
    return "bg-slate-400";
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-heading font-semibold text-sm text-slate-900 dark:text-white">
          {MONTH_NAMES[viewMonth - 1]} {viewYear}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <ChevronLeft size={14} />
          </button>
          <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-0.5">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} />;
          const isToday =
            day === today.getDate() && viewMonth === today.getMonth() + 1 && viewYear === today.getFullYear();
          const dayEvents = eventMap[day.toString()] ?? [];

          return (
            <div
              key={day}
              className={cn(
                "flex flex-col items-center pt-0.5 pb-0.5 rounded-lg",
                isToday && "bg-primary/10"
              )}
            >
              <span className={cn(
                "text-[11px] font-medium w-5 h-5 flex items-center justify-center rounded-full",
                isToday ? "bg-primary text-white" : "text-slate-700 dark:text-slate-300"
              )}>
                {day}
              </span>
              {/* Dots for events */}
              <div className="flex gap-0.5 mt-0.5 h-1.5 flex-wrap justify-center">
                {dayEvents.slice(0, 3).map((ev, i) => (
                  <span key={i} className={cn("w-1 h-1 rounded-full", getDotColor(ev))} title={ev.name ?? ev.type} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2.5">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />Leave</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Pending</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />WFH</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />Holiday</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EmployeeDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/employee/portal/dashboard")
      .then((r) => setData(r.data))
      .catch(() => toast.error("Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <WeaveSpinner className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p>Failed to load dashboard. Please refresh.</p>
      </div>
    );
  }

  const { leaveBalances, wfhBalance, recentApplications, upcomingHolidays, calendarEvents, employee } = data;
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const BALANCE_COLORS: Record<string, string> = {
    SICK: "text-blue-600 bg-blue-50 dark:bg-blue-900/20",
    TRANSPORT_WEATHER: "text-amber-600 bg-amber-50 dark:bg-amber-900/20",
    PERSONAL: "text-purple-600 bg-purple-50 dark:bg-purple-900/20",
  };

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-heading font-bold text-slate-900 dark:text-white">
          {greeting}, {employee.fullName.split(" ")[0]}! 👋
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {leaveBalances.map((b) => (
          <BalanceCard
            key={b.id}
            label={LEAVE_TYPE_LABELS[b.leaveType] ?? b.leaveType}
            usedDays={b.usedDays}
            totalDays={b.totalDays}
            remainingDays={b.remainingDays}
            color={BALANCE_COLORS[b.leaveType] ?? "text-slate-600 bg-slate-100 dark:bg-slate-800"}
          />
        ))}
        {wfhBalance.policy ? (
          <BalanceCard
            label="WFH Allowance"
            usedDays={wfhBalance.usedDays}
            totalDays={wfhBalance.policy.daysAllowed}
            remainingDays={wfhBalance.remainingDays}
            pendingDays={wfhBalance.pendingDays}
            color="text-green-600 bg-green-50 dark:bg-green-900/20"
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm opacity-65 flex flex-col justify-between h-full">
            <div>
              <div className="h-8 w-8 rounded-xl flex items-center justify-center mb-2.5 text-slate-400 bg-slate-100 dark:bg-slate-800">
                <Home size={16} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">WFH Allowance</p>
              <p className="text-lg font-bold text-slate-400 dark:text-slate-550 mt-1">
                Not Assigned
              </p>
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1">
              <span>0 days allowed</span>
              <span>—</span>
            </div>
          </div>
        )}

        {/* Probation details card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between h-full">
          <div>
            <div className="h-8 w-8 rounded-xl flex items-center justify-center mb-2.5 text-purple-600 bg-purple-50 dark:bg-purple-900/20">
              <Star size={16} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">Probation Status</p>
            <p className="text-[14px] font-bold text-slate-900 dark:text-white mt-1.5 leading-snug">
              {employee.probationMonths ? `${employee.probationMonths}-Month Period` : "Confirmed Status"}
            </p>
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1">
            <span>Joined: {employee.dateOfJoining ? formatDate(employee.dateOfJoining) : "—"}</span>
          </div>
        </div>

        {/* Reporting Manager card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-850 shadow-sm flex flex-col justify-between h-full">
          <div>
            <div className="h-8 w-8 rounded-xl flex items-center justify-center mb-2.5 text-blue-600 bg-blue-50 dark:bg-blue-900/20">
              <Users size={16} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">Reporting Manager</p>
            <p className="text-[13px] font-bold text-slate-900 dark:text-white mt-1.5 truncate leading-snug">
              {employee.reportingManager?.fullName ?? "No Manager Assigned"}
            </p>
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1">
            <span>Supervisor</span>
          </div>
        </div>
      </div>

      {/* Quick apply */}
      <div className="flex flex-wrap gap-3">
        {employee.leavePolicy && (
          <Link href="/employee/apply-leave">
            <Button size="sm">
              <Plus size={15} className="mr-1.5" />
              Apply Leave
            </Button>
          </Link>
        )}
        {employee.wfhPolicy && (
          <Link href="/employee/apply-wfh">
            <Button variant="secondary" size="sm">
              <Home size={15} className="mr-1.5" />
              Apply WFH
            </Button>
          </Link>
        )}
        <Link href="/employee/my-leaves">
          <Button variant="outline" size="sm">
            <CalendarDays size={15} className="mr-1.5" />
            View All Leaves
          </Button>
        </Link>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Calendar + Upcoming holidays */}
        <div className="space-y-4">
          <MiniCalendar
            year={data.currentYear}
            month={data.currentMonth}
            events={calendarEvents}
          />

          {/* Upcoming holidays */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
            <h3 className="font-heading font-semibold text-slate-900 dark:text-white text-sm mb-3 flex items-center gap-1.5">
              <Star size={14} className="text-amber-500" />
              Upcoming Holidays
            </h3>
            {upcomingHolidays.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">No upcoming holidays</p>
            ) : (
              <div className="space-y-2">
                {upcomingHolidays.map((h) => {
                  const d = new Date(h.date);
                  const daysUntil = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={h.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{h.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} ·{" "}
                          {d.toLocaleDateString("en-IN", { weekday: "short" })}
                        </p>
                      </div>
                      <span className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        daysUntil <= 7
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      )}>
                        {daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `${daysUntil}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Recent applications */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-heading font-semibold text-slate-900 dark:text-white text-sm">
                Recent Applications
              </h3>
              <Link href="/employee/my-leaves">
                <Button variant="ghost" size="sm" className="text-xs h-7">View All</Button>
              </Link>
            </div>

            {recentApplications.length === 0 ? (
              <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                <Calendar size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No applications yet</p>
                <p className="text-xs mt-1">Apply for leave or WFH to see them here</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentApplications.map((app) => (
                  <div key={`${app.appType}-${app.id}`} className="flex items-start gap-3 px-5 py-3.5">
                    <div className={cn(
                      "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                      app.appType === "LEAVE"
                        ? "bg-primary/10 text-primary"
                        : "bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                    )}>
                      {app.appType === "LEAVE" ? <CalendarDays size={15} /> : <Home size={15} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {app.appType === "LEAVE"
                            ? (LEAVE_TYPE_LABELS[app.leaveType ?? ""] ?? app.leaveType ?? "Leave")
                            : "Work From Home"}
                        </p>
                        <StatusBadge status={app.status} />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {formatDate(app.fromDate)}
                        {app.fromDate !== app.toDate && ` → ${formatDate(app.toDate)}`}
                        {" · "}{app.totalDays} day{app.totalDays !== 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-xs">
                        {app.reason}
                      </p>
                    </div>

                    <p className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                      {new Date(app.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
