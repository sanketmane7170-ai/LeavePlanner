"use client";

import { useEffect, useState, useCallback } from "react";
import { format, parseISO } from "date-fns";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Download,
  Key,
  RotateCcw,
  Search,
  LogIn,
  LogOut,
  AlertCircle,
  Pencil,
  Settings,
} from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface AttRow {
  employeeId: string;
  empId: string;
  fullName: string;
  department: string | null;
  designation: string | null;
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  isLate: boolean;
  lateMinutes: number | null;
  earlyCheckout: boolean;
  workingHours: number | null;
  checkInAddress: string | null;
  record: { adminOverride?: boolean; adminNote?: string } | null;
}

interface Stats {
  total: number; checkedIn: number; checkedOut: number; late: number;
  absent: number; notCheckedIn: number; onLeave: number; onWfh: number;
}

const STATUS_COLORS: Record<string, string> = {
  CHECKED_IN:    "bg-green-100 text-green-700",
  CHECKED_OUT:   "bg-blue-100 text-blue-700",
  ABSENT:        "bg-red-100 text-red-700",
  ON_LEAVE:      "bg-purple-100 text-purple-700",
  ON_WFH:        "bg-cyan-100 text-cyan-700",
  NOT_CHECKED_IN:"bg-slate-100 text-slate-600",
};

const STATUS_LABEL: Record<string, string> = {
  CHECKED_IN:    "Checked In",
  CHECKED_OUT:   "Checked Out",
  ABSENT:        "Absent",
  ON_LEAVE:      "On Leave",
  ON_WFH:        "WFH",
  NOT_CHECKED_IN:"Not Checked In",
};

function fmt(dt: string | null) {
  if (!dt) return "—";
  return format(parseISO(dt), "hh:mm a");
}

export default function AdminCheckInPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate]       = useState(today);
  const [search, setSearch]   = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [stats, setStats]     = useState<Stats | null>(null);
  const [rows, setRows]       = useState<AttRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [code, setCode]       = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideRow, setOverrideRow]   = useState<AttRow | null>(null);
  const [overrideForm, setOverrideForm] = useState({
    checkInTime: "", checkOutTime: "", status: "", adminNote: "",
  });

  const fetchCode = useCallback(async () => {
    try {
      const res = await api.get("/admin/checkin/code");
      setCode(res.data.code);
    } catch { /* ignore */ }
  }, []);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { date };
      if (search) params.search = search;
      if (statusFilter !== "ALL") params.status = statusFilter;
      const res = await api.get("/admin/checkin/attendance", { params });
      setRows(res.data.data);
      setStats(res.data.stats);
      setTotal(res.data.total);
    } catch {
      toast.error("Failed to load attendance data");
    } finally {
      setLoading(false);
    }
  }, [date, search, statusFilter]);

  useEffect(() => {
    fetchCode();
    fetchAttendance();
  }, [fetchCode, fetchAttendance]);

  const handleGenerateCode = async () => {
    setCodeLoading(true);
    try {
      const res = await api.post("/admin/checkin/code/generate");
      setCode(res.data.code);
      toast.success(`New code generated: ${res.data.code}`);
    } catch {
      toast.error("Failed to generate code");
    } finally {
      setCodeLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.get("/admin/checkin/export", {
        params: { date },
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement("a");
      a.href    = url;
      a.download = `attendance_${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  const openOverride = (row: AttRow) => {
    setOverrideRow(row);
    setOverrideForm({
      checkInTime:  row.checkInTime  ? format(parseISO(row.checkInTime),  "yyyy-MM-dd'T'HH:mm") : "",
      checkOutTime: row.checkOutTime ? format(parseISO(row.checkOutTime), "yyyy-MM-dd'T'HH:mm") : "",
      status:       row.status,
      adminNote:    row.record?.adminNote ?? "",
    });
    setOverrideOpen(true);
  };

  const handleOverrideSave = async () => {
    if (!overrideRow) return;
    try {
      await api.post("/admin/checkin/override", {
        employeeId:  overrideRow.employeeId,
        date,
        checkInTime:  overrideForm.checkInTime  || undefined,
        checkOutTime: overrideForm.checkOutTime || undefined,
        status:       overrideForm.status       || undefined,
        adminNote:    overrideForm.adminNote    || undefined,
      });
      toast.success("Override saved");
      setOverrideOpen(false);
      fetchAttendance();
    } catch {
      toast.error("Override failed");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Live Attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">Real-time check-in / check-out tracking</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/checkin/settings">
            <Button variant="outline" size="sm"><Settings size={14} className="mr-1.5" /> Settings</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={fetchAttendance}>
            <RefreshCw size={14} className="mr-1.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download size={14} className="mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Top row: code card + stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Daily Code */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-primary/20 p-4 shadow-sm col-span-2 md:col-span-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2">
            <Key size={12} /> Today&apos;s Code
          </div>
          <div className="text-4xl font-mono font-extrabold text-primary tracking-[0.2em] text-center py-1 mb-3">
            {code ?? "—"}
          </div>
          <Button size="sm" variant="outline" className="w-full text-xs" onClick={handleGenerateCode} disabled={codeLoading}>
            <RotateCcw size={12} className="mr-1.5" />
            {code ? "Regenerate" : "Generate Code"}
          </Button>
        </div>

        {/* Stats */}
        {[
          { label: "Total",    value: stats?.total ?? 0,  icon: Users,        color: "text-slate-700" },
          { label: "Present",  value: (stats?.checkedIn ?? 0) + (stats?.checkedOut ?? 0), icon: CheckCircle2, color: "text-green-600" },
          { label: "Late",     value: stats?.late ?? 0,   icon: Clock,        color: "text-amber-600" },
          { label: "Absent",   value: stats?.absent ?? 0, icon: XCircle,      color: "text-red-600"   },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">{s.label}</p>
                <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              </div>
              <div className={`p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 ${s.color}`}>
                <s.icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
        />
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search name or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 w-56 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
        >
          <option value="ALL">All Statuses</option>
          <option value="NOT_CHECKED_IN">Not Checked In</option>
          <option value="CHECKED_IN">Checked In</option>
          <option value="CHECKED_OUT">Checked Out</option>
          <option value="ABSENT">Absent</option>
          <option value="ON_LEAVE">On Leave</option>
          <option value="ON_WFH">WFH</option>
        </select>
        <span className="text-xs text-slate-500 ml-auto">{total} employees</span>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                {["Emp ID", "Name", "Department", "Status", "Check-In", "Check-Out", "Late", "Hrs", "Location", "Actions"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-12 text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-slate-400">No records found</td></tr>
              ) : rows.map(row => (
                <tr key={row.employeeId} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.empId}</td>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                    <div>{row.fullName}</div>
                    {row.designation && <div className="text-xs text-slate-400">{row.designation}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{row.department ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[row.status] ?? "")}>
                      {STATUS_LABEL[row.status] ?? row.status}
                      {row.record?.adminOverride && <span className="ml-1 text-[10px] opacity-70">(override)</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                      <LogIn size={12} className="text-green-500" />{fmt(row.checkInTime)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                      <LogOut size={12} className="text-blue-500" />{fmt(row.checkOutTime)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.isLate ? (
                      <span className="text-amber-600 font-medium text-xs flex items-center gap-1">
                        <AlertCircle size={12} /> +{row.lateMinutes}m
                      </span>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                    {row.workingHours != null ? `${row.workingHours}h` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate" title={row.checkInAddress ?? undefined}>
                    {row.checkInAddress ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openOverride(row)}>
                      <Pencil size={12} className="mr-1" /> Override
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Override Dialog */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Admin Override — {overrideRow?.fullName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Check-In Time</label>
              <input
                type="datetime-local"
                value={overrideForm.checkInTime}
                onChange={e => setOverrideForm(f => ({ ...f, checkInTime: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Check-Out Time</label>
              <input
                type="datetime-local"
                value={overrideForm.checkOutTime}
                onChange={e => setOverrideForm(f => ({ ...f, checkOutTime: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
              <select
                value={overrideForm.status}
                onChange={e => setOverrideForm(f => ({ ...f, status: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
              >
                {["CHECKED_IN","CHECKED_OUT","ABSENT","ON_LEAVE","ON_WFH","NOT_CHECKED_IN"].map(s => (
                  <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Admin Note</label>
              <Input
                placeholder="Reason for override…"
                value={overrideForm.adminNote}
                onChange={e => setOverrideForm(f => ({ ...f, adminNote: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>Cancel</Button>
            <Button onClick={handleOverrideSave}>Save Override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
