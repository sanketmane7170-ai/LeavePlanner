"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import {
  BarChart2, ChevronLeft, ChevronRight, RefreshCw, TrendingUp,
  Users, CalendarOff, Home, AlertCircle,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";

const LEAVE_TYPE_COLORS: Record<string, string> = {
  SICK:               "#ef4444",
  TRANSPORT_WEATHER:  "#f59e0b",
  PERSONAL:           "#8b5cf6",
  GENERAL:            "#3b82f6",
};
const LEAVE_TYPE_LABELS: Record<string, string> = {
  SICK: "Sick", TRANSPORT_WEATHER: "Transport/Weather", PERSONAL: "Personal", GENERAL: "General",
};

const CHART_COLORS = ["#6366f1","#22c55e","#f59e0b","#ef4444","#14b8a6","#a855f7","#f97316","#0ea5e9"];

interface Overview {
  year: number;
  totalEmployees: number;
  totalLeaveApplications: number;
  totalLeaveDays: number;
  totalWfhApplications: number;
  totalWfhDays: number;
  unpaidLeaveApplications: number;
  pendingLeaves: number;
  pendingWfh: number;
}

interface TrendPoint {
  month: string;
  monthNum: number;
  leaveDays: number;
  leaveCount: number;
  wfhDays: number;
  wfhCount: number;
  unpaidDays: number;
}

interface DeptRow {
  department: string;
  leaveDays: number;
  wfhDays: number;
  unpaidDays: number;
  headcount: number;
  avgLeaveDaysPerEmployee: number;
}

interface TopLeaver {
  id: string;
  fullName: string;
  employeeId: string;
  department?: string;
  totalLeaveDays: number;
  totalWfhDays: number;
  unpaidDays: number;
  leaveCount: number;
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", color)}>
        <Icon size={18} className="text-white" />
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminReportsPage() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const currentYear = new Date().getFullYear();

  const [year,    setYear]    = useState(currentYear);
  const [tab,     setTab]     = useState<"trends"|"departments"|"top-leavers">("trends");
  const [loading, setLoading] = useState(true);

  const [overview,   setOverview]   = useState<Overview | null>(null);
  const [trend,      setTrend]      = useState<TrendPoint[]>([]);
  const [typeData,   setTypeData]   = useState<{ name: string; value: number; color: string }[]>([]);
  const [depts,      setDepts]      = useState<DeptRow[]>([]);
  const [topLeavers, setTopLeavers] = useState<TopLeaver[]>([]);

  const axisColor   = dark ? "#94a3b8" : "#64748b";
  const gridColor   = dark ? "#1e293b" : "#f1f5f9";
  const tooltipBg   = dark ? "#1e293b" : "#ffffff";
  const tooltipBorder = dark ? "#334155" : "#e2e8f0";

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, tr, ds, tl] = await Promise.all([
        api.get(`/admin/reports/overview?year=${year}`),
        api.get(`/admin/reports/leave-trends?year=${year}`),
        api.get(`/admin/reports/department-summary?year=${year}`),
        api.get(`/admin/reports/top-leavers?year=${year}&limit=10`),
      ]);
      setOverview(ov.data);
      setTrend(tr.data.trend ?? []);
      const breakdown: Record<string,number> = tr.data.typeBreakdown ?? {};
      setTypeData(Object.entries(breakdown).map(([k, v]) => ({
        name: LEAVE_TYPE_LABELS[k] ?? k,
        value: v as number,
        color: LEAVE_TYPE_COLORS[k] ?? "#6366f1",
      })));
      setDepts(ds.data.departments ?? []);
      setTopLeavers(tl.data.employees ?? []);
    } catch {
      toast.error("Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: tooltipBg, border: `1px solid ${tooltipBorder}` }} className="rounded-xl p-3 text-xs shadow-lg">
        <p className="font-semibold text-slate-800 dark:text-white mb-1">{label}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-slate-500 dark:text-slate-400">{p.name}:</span>
            <span className="font-medium text-slate-800 dark:text-white">{p.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart2 size={20} className="text-primary" />
            Analytics & Reports
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Leave, WFH, and attendance insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading} className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </Button>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            <button onClick={() => setYear(y => y - 1)} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="px-3 text-sm font-semibold text-slate-900 dark:text-white min-w-[52px] text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32"><WeaveSpinner size={32} /></div>
      ) : (
        <>
          {/* KPI Cards */}
          {overview && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              <StatCard label="Active Employees"  value={overview.totalEmployees}          icon={Users}       color="bg-blue-500"   />
              <StatCard label="Leave Applications" value={overview.totalLeaveApplications} icon={CalendarOff} color="bg-red-500"    sub={`${overview.totalLeaveDays} days`} />
              <StatCard label="WFH Applications"  value={overview.totalWfhApplications}    icon={Home}        color="bg-emerald-500" sub={`${overview.totalWfhDays} days`} />
              <StatCard label="Unpaid Leaves"      value={overview.unpaidLeaveApplications} icon={AlertCircle} color="bg-amber-500"  />
              <StatCard label="Pending (all)"      value={overview.pendingLeaves + overview.pendingWfh} icon={TrendingUp} color="bg-violet-500" sub={`${overview.pendingLeaves}L + ${overview.pendingWfh}W`} />
            </div>
          )}

          {/* Trends + Pie side by side */}
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Monthly Leave & WFH Days</h3>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="leaveGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="wfhGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="month" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="leaveDays" name="Leave Days" stroke="#ef4444" fill="url(#leaveGrad)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="wfhDays"   name="WFH Days"   stroke="#6366f1" fill="url(#wfhGrad)"   strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Leave by Type</h3>
              {typeData.length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={typeData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                      {typeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={({ active, payload }) => active && payload?.length ? (
                      <div style={{ background: tooltipBg, border: `1px solid ${tooltipBorder}` }} className="rounded-xl p-2 text-xs shadow-lg">
                        <p className="font-medium text-slate-800 dark:text-white">{payload[0]!.name}</p>
                        <p className="text-slate-500">{payload[0]!.value} days</p>
                      </div>
                    ) : null} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="space-y-1.5 mt-2">
                {typeData.map((t) => (
                  <div key={t.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.color }} />
                      <span className="text-slate-600 dark:text-slate-300">{t.name}</span>
                    </div>
                    <span className="font-semibold text-slate-900 dark:text-white">{t.value}d</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Monthly count bar chart */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Monthly Application Count</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="month" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="leaveCount" name="Leave Applications" fill="#ef4444" radius={[4,4,0,0]} />
                <Bar dataKey="wfhCount"   name="WFH Applications"   fill="#6366f1" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabs: Departments | Top Leavers */}
          <div>
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit mb-4">
              {(["trends","departments","top-leavers"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} className={cn(
                  "px-4 py-1.5 text-sm font-medium rounded-lg transition-all",
                  tab === t ? "bg-white dark:bg-slate-700 text-primary shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}>
                  {t === "trends" ? "Trends" : t === "departments" ? "By Department" : "Top Leavers"}
                </button>
              ))}
            </div>

            {tab === "trends" && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Unpaid Leave Trend</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="month" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="unpaidDays" name="Unpaid Days" fill="#f59e0b" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {tab === "departments" && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {["Department","Headcount","Leave Days","WFH Days","Unpaid Days","Avg Leave/Person"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {depts.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No data</td></tr>
                    ) : depts.map((d) => (
                      <tr key={d.department} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{d.department}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{d.headcount}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-red-600 dark:text-red-400">{d.leaveDays}</span>
                            <div className="flex-1 max-w-[80px] bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                              <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${Math.min(100, (d.leaveDays / (depts[0]?.leaveDays||1)) * 100)}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-indigo-600 dark:text-indigo-400">{d.wfhDays}</td>
                        <td className="px-4 py-3 font-semibold text-amber-600 dark:text-amber-400">{d.unpaidDays}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{d.avgLeaveDaysPerEmployee}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "top-leavers" && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {["#","Employee","Department","Leave Days","WFH Days","Unpaid Days","Applications"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {topLeavers.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No data</td></tr>
                    ) : topLeavers.map((e, i) => (
                      <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 text-slate-400 font-medium">{i + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 dark:text-white">{e.fullName}</p>
                          <p className="text-xs text-slate-400">{e.employeeId}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{e.department || "—"}</td>
                        <td className="px-4 py-3 font-bold text-red-600 dark:text-red-400">{e.totalLeaveDays}</td>
                        <td className="px-4 py-3 font-bold text-indigo-600 dark:text-indigo-400">{e.totalWfhDays}</td>
                        <td className="px-4 py-3 font-bold text-amber-600 dark:text-amber-400">{e.unpaidDays}</td>
                        <td className="px-4 py-3 text-slate-500">{e.leaveCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
