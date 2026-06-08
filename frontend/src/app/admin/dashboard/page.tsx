"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { toast } from "sonner";
import {
  Users, Clock, CalendarOff, Monitor, AlertCircle, CheckCircle2, ChevronRight,
  Key, RotateCcw, Copy,
} from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import { formatDate, LEAVE_TYPE_LABELS, leaveStatusVariant } from "@/lib/utils";
import type { LeaveApplication } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";



// ── Types ─────────────────────────────────────────────────────────────────────
interface DashboardStats {
  totalEmployees: number;
  pendingLeaves: number;
  onLeaveToday: number;
  onWfhToday: number;
  absentToday: number;
}

interface MonthlyData {
  month: string;
  days: number;
  count: number;
}

interface TypeData {
  leaveType: string;
  days: number;
  count: number;
}

interface LeaveWithEmployee extends LeaveApplication {
  employee: { id: string; fullName: string; employeeId: string; department?: string };
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center mb-3", color)}>
        <Icon size={20} />
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
    </div>
  );
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
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", svClass[v])}>
      {status}
    </span>
  );
}

// ── Leave type colors ─────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  SICK: "#3b82f6",
  TRANSPORT_WEATHER: "#f59e0b",
  PERSONAL: "#8b5cf6",
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const year = new Date().getFullYear();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveWithEmployee[]>([]);
  const [upcomingLeaves, setUpcomingLeaves] = useState<LeaveWithEmployee[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [typeData, setTypeData] = useState<TypeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Check-in code state
  const [checkInCode, setCheckInCode]         = useState<string | null>(null);
  const [checkInEnabled, setCheckInEnabled]   = useState(false);
  const [codeGenerating, setCodeGenerating]   = useState(false);
  const [codeCopied, setCodeCopied]           = useState(false);

  useEffect(() => {
    api.get("/admin/checkin/code").then(r => {
      setCheckInCode(r.data.code);
    }).catch(() => {});
    api.get("/admin/checkin/settings").then(r => {
      setCheckInEnabled(r.data.checkInEnabled);
    }).catch(() => {});
  }, []);

  const handleGenerateCode = async () => {
    setCodeGenerating(true);
    try {
      const res = await api.post("/admin/checkin/code/generate");
      setCheckInCode(res.data.code);
      toast.success(`Code generated: ${res.data.code}`);
    } catch {
      toast.error("Failed to generate code");
    } finally {
      setCodeGenerating(false);
    }
  };

  const handleCopyCode = () => {
    if (!checkInCode) return;
    navigator.clipboard.writeText(checkInCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  // Chart theme
  const gridColor  = isDark ? "#1e293b" : "#f1f5f9";
  const axisColor  = isDark ? "#64748b" : "#94a3b8";
  const tooltipBg  = isDark ? "#1e293b" : "#ffffff";
  const tooltipBdr = isDark ? "#334155" : "#e2e8f0";

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, monthlyRes, typeRes] = await Promise.all([
        api.get("/admin/dashboard/stats"),
        api.get(`/admin/dashboard/reports/monthly?year=${year}`),
        api.get(`/admin/dashboard/reports/type?year=${year}`),
      ]);
      setStats(statsRes.data.stats);
      setPendingLeaves(statsRes.data.pendingLeaves ?? []);
      setUpcomingLeaves(statsRes.data.upcomingLeaves ?? []);
      setMonthlyData(monthlyRes.data ?? []);
      setTypeData(typeRes.data ?? []);
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleQuickApprove = async (leave: LeaveWithEmployee) => {
    setApprovingId(leave.id);
    try {
      await api.patch(`/admin/leaves/${leave.id}/approve`);
      toast.success(`Approved leave for ${leave.employee.fullName}`);
      fetchAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to approve");
    } finally {
      setApprovingId(null);
    }
  };

  const pieDataFormatted = typeData.map((t) => ({
    name: LEAVE_TYPE_LABELS[t.leaveType] ?? t.leaveType,
    value: t.days,
    color: TYPE_COLORS[t.leaveType] ?? "#94a3b8",
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <WeaveSpinner className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-heading font-bold text-slate-900 dark:text-white">
            Admin Dashboard
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
        <select
          defaultValue={year}
          className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none"
          disabled
        >
          <option>{year}</option>
        </select>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Total Employees" value={stats?.totalEmployees ?? "—"} icon={Users} color="text-blue-600 bg-blue-50 dark:bg-blue-900/20" />
        <StatCard label="Pending Requests" value={stats?.pendingLeaves ?? "—"} icon={Clock} color="text-amber-600 bg-amber-50 dark:bg-amber-900/20" />
        <StatCard label="On Leave Today" value={stats?.onLeaveToday ?? "—"} icon={CalendarOff} color="text-red-500 bg-red-50 dark:bg-red-900/20" />
        <StatCard label="On WFH Today" value={stats?.onWfhToday ?? "—"} icon={Monitor} color="text-green-600 bg-green-50 dark:bg-green-900/20" />
        <StatCard label="Absent Today" value={stats?.absentToday ?? "—"} icon={AlertCircle} color="text-slate-500 bg-slate-100 dark:bg-slate-800" />
      </div>

      {/* Daily Check-In Code banner — shown when check-in module is enabled */}
      {checkInEnabled && (
        <div className="flex flex-wrap items-center gap-5 p-5 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 shadow-sm">
          {/* Icon + label */}
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Key size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Today&apos;s Check-In Code</p>
              <p className="text-xs text-slate-400 mt-0.5">Share this with your team every morning</p>
            </div>
          </div>

          {/* The code */}
          <div className="flex items-center gap-3">
            <span className="text-4xl font-mono font-extrabold tracking-[0.25em] text-primary select-all">
              {checkInCode ?? "—"}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {checkInCode && (
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
              >
                <Copy size={13} />
                {codeCopied ? "Copied!" : "Copy Code"}
              </button>
            )}
            <button
              onClick={handleGenerateCode}
              disabled={codeGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <RotateCcw size={13} className={codeGenerating ? "animate-spin" : ""} />
              {checkInCode ? "Regenerate" : "Generate Code"}
            </button>
            <Link href="/admin/checkin" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              View Attendance <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Bar chart: Leave by month */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          <h3 className="font-heading font-semibold text-slate-900 dark:text-white mb-5">
            Leave Days by Month — {year}
          </h3>
          {monthlyData.some((m) => m.days > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="month" tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBdr}`, borderRadius: "12px", fontSize: "12px" }}
                  formatter={(v: any) => [`${v} days`, "Leave"]}
                />
                <Bar dataKey="days" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">
              No approved leave data for {year}
            </div>
          )}
        </div>

        {/* Pie chart: Leave by type */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          <h3 className="font-heading font-semibold text-slate-900 dark:text-white mb-5">
            By Leave Type
          </h3>
          {pieDataFormatted.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieDataFormatted}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieDataFormatted.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBdr}`, borderRadius: "12px", fontSize: "12px" }}
                  formatter={(v: any, name: any) => [`${v} days`, String(name)]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                  formatter={(value) => <span style={{ color: axisColor }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">
              No data yet
            </div>
          )}
        </div>
      </div>

      {/* Pending requests quick-list */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-heading font-semibold text-slate-900 dark:text-white">
            Pending Requests
            {pendingLeaves.length > 0 && (
              <span className="ml-2 text-xs font-normal text-slate-500">({pendingLeaves.length} shown)</span>
            )}
          </h3>
          <Link href="/admin/leave-requests">
            <Button variant="ghost" size="sm" className="text-xs h-7">
              View All <ChevronRight size={13} className="ml-0.5" />
            </Button>
          </Link>
        </div>

        {pendingLeaves.length === 0 ? (
          <div className="text-center py-10 text-slate-400 dark:text-slate-500">
            <CheckCircle2 size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No pending requests — all clear!</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pendingLeaves.map((leave) => (
              <div key={leave.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                  {leave.employee.fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {leave.employee.fullName}
                    <span className="text-xs text-slate-500 ml-1.5">({leave.employee.employeeId})</span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {LEAVE_TYPE_LABELS[leave.leaveType] ?? leave.leaveType} ·{" "}
                    {formatDate(leave.fromDate)}
                    {leave.fromDate !== leave.toDate && ` → ${formatDate(leave.toDate)}`} ·{" "}
                    {leave.totalDays}d
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={leave.status} />
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white border-0"
                    onClick={() => handleQuickApprove(leave)}
                    disabled={approvingId === leave.id}
                  >
                    {approvingId === leave.id
                      ? <WeaveSpinner className="animate-spin" size={12} />
                      : <CheckCircle2 size={12} className="mr-1" />
                    }
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming leaves this week */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-heading font-semibold text-slate-900 dark:text-white">
            Upcoming Leaves This Week
          </h3>
        </div>

        {upcomingLeaves.length === 0 ? (
          <div className="text-center py-10 text-slate-400 dark:text-slate-500">
            <CalendarOff size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No approved leaves starting this week</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {upcomingLeaves.map((leave) => (
              <div key={leave.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center text-xs font-bold shrink-0">
                  {leave.employee.fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {leave.employee.fullName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {LEAVE_TYPE_LABELS[leave.leaveType] ?? leave.leaveType} ·{" "}
                    {formatDate(leave.fromDate)}
                    {leave.fromDate !== leave.toDate && ` → ${formatDate(leave.toDate)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500">{leave.totalDays}d</span>
                  <StatusBadge status={leave.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
