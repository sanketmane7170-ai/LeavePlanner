"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Users,
  ArrowRightLeft,
} from "lucide-react";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";

// ── Types ─────────────────────────────────────────────────────────────────────

type SwapDayStatus = "PENDING_COMPENSATION" | "COMPENSATED" | "DEFAULTED";

interface SwapDay {
  id: string;
  employeeId: string;
  absentDate: string;
  compensationDate: string | null;
  deadline: string | null;
  status: SwapDayStatus;
  absentMarked: boolean;
  note: string | null;
  createdById: string;
  resolvedAt: string | null;
  createdAt: string;
  isOverdue: boolean;
  isDueSoon: boolean;
  employee: {
    id: string;
    fullName: string;
    employeeId: string;
    department: string | null;
    designation: string | null;
  };
}

interface Employee {
  id: string;
  fullName: string;
  employeeId: string;
  department: string | null;
}

interface Stats {
  pending: number;
  overdue: number;
  compensated: number;
  defaulted: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SwapDayStatus, { label: string; cls: string }> = {
  PENDING_COMPENSATION: { label: "Pending", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  COMPENSATED:          { label: "Compensated", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  DEFAULTED:            { label: "Defaulted", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

function StatusBadge({ row }: { row: SwapDay }) {
  if (row.status === "PENDING_COMPENSATION" && row.isOverdue) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <AlertTriangle className="h-3 w-3" /> Overdue
      </span>
    );
  }
  if (row.status === "PENDING_COMPENSATION" && row.isDueSoon) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        <Clock className="h-3 w-3" /> Due Soon
      </span>
    );
  }
  const cfg = STATUS_CONFIG[row.status];
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SwapDaysPage() {
  const [rows, setRows] = useState<SwapDay[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // create modal
  const [showCreate, setShowCreate] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [form, setForm] = useState({ employeeId: "", absentDate: "", compensationDate: "", note: "" });
  const [creating, setCreating] = useState(false);

  // action confirm
  const [confirmRow, setConfirmRow] = useState<SwapDay | null>(null);
  const [confirmAction, setConfirmAction] = useState<"compensated" | "defaulted" | null>(null);
  const [acting, setActing] = useState(false);

  // inline set compensation date
  const [setCompRow, setSetCompRow] = useState<SwapDay | null>(null);
  const [setCompDate, setSetCompDate] = useState("");
  const [settingComp, setSettingComp] = useState(false);

  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
        ...(search && { search }),
        ...(statusFilter !== "ALL" && { status: statusFilter }),
      });
      const [listRes, statsRes] = await Promise.all([
        api.get(`/admin/swap-days?${params}`),
        api.get("/admin/swap-days/stats"),
      ]);
      setRows(listRes.data.data);
      setTotal(listRes.data.total);
      setStats(statsRes.data);
    } catch {
      toast.error("Failed to load swap days");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setPage(1), 400);
    return () => clearTimeout(t);
  }, [search]);

  // ── Employee list for create modal ──
  // Load all employees immediately when modal opens; re-filter on search
  useEffect(() => {
    if (!showCreate) return;
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/admin/employees?search=${encodeURIComponent(empSearch)}&limit=50`);
        setEmployees(res.data.employees ?? res.data.data ?? []);
      } catch { /* silent */ }
    }, empSearch ? 300 : 0);
    return () => clearTimeout(t);
  }, [empSearch, showCreate]);

  // ── Create ────────────────────────────
  const handleCreate = async () => {
    if (!form.employeeId || !form.absentDate) {
      toast.error("Employee and absent date are required");
      return;
    }
    setCreating(true);
    try {
      await api.post("/admin/swap-days", form);
      toast.success("Swap day created");
      setShowCreate(false);
      setForm({ employeeId: "", absentDate: "", compensationDate: "", note: "" });
      setEmpSearch("");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to create swap day");
    } finally {
      setCreating(false);
    }
  };

  // ── Confirm action ────────────────────
  const handleAction = async () => {
    if (!confirmRow || !confirmAction) return;
    setActing(true);
    try {
      await api.patch(`/admin/swap-days/${confirmRow.id}/${confirmAction}`);
      toast.success(confirmAction === "compensated" ? "Marked as compensated" : "Absent recorded for salary");
      setConfirmRow(null);
      setConfirmAction(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Action failed");
    } finally {
      setActing(false);
    }
  };

  const handleSetCompDate = async () => {
    if (!setCompRow || !setCompDate) return;
    setSettingComp(true);
    try {
      await api.patch(`/admin/swap-days/${setCompRow.id}/set-compensation`, { compensationDate: setCompDate });
      toast.success("Compensation date set");
      setSetCompRow(null);
      setSetCompDate("");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to set compensation date");
    } finally {
      setSettingComp(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const selectedEmployee = employees.find((e) => e.id === form.employeeId);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowRightLeft className="h-6 w-6 text-blue-600" />
            Swap Days
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Track employees who missed work and owe a compensation day
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add Swap Day
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Pending", value: stats.pending, cls: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400", icon: Clock },
            { label: "Overdue", value: stats.overdue, cls: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400", icon: AlertTriangle },
            { label: "Compensated", value: stats.compensated, cls: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400", icon: CheckCircle2 },
            { label: "Defaulted", value: stats.defaulted, cls: "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400", icon: Users },
          ].map(({ label, value, cls, icon: Icon }) => (
            <div key={label} className={cn("rounded-xl p-4 flex items-center gap-3", cls)}>
              <Icon className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs font-medium opacity-80">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-slate-700 dark:text-slate-300 dark:bg-slate-900 dark:border-slate-700"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="ALL">All Statuses</option>
          <option value="PENDING_COMPENSATION">Pending</option>
          <option value="COMPENSATED">Compensated</option>
          <option value="DEFAULTED">Defaulted</option>
        </select>
        <Button variant="outline" size="icon" onClick={load} title="Refresh">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><WeaveSpinner /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <ArrowRightLeft className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No swap days found</p>
          <p className="text-sm mt-1">Add one using the button above</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {["Employee", "Absent Date", "Comp Date", "Deadline", "Status", "Note", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{row.employee.fullName}</p>
                      <p className="text-xs text-slate-500">{row.employee.employeeId} · {row.employee.department ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                        <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                        {formatDate(row.absentDate)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                      {row.compensationDate ? (
                        formatDate(row.compensationDate)
                      ) : row.status === "PENDING_COMPENSATION" ? (
                        <button
                          onClick={() => { setSetCompRow(row); setSetCompDate(""); }}
                          className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700"
                        >
                          Not set — click to set
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={cn(
                        "text-xs font-medium",
                        row.isOverdue ? "text-red-600 dark:text-red-400 font-semibold" :
                        row.isDueSoon ? "text-amber-600 dark:text-amber-400" :
                        "text-slate-500"
                      )}>
                        {row.deadline ? formatDate(row.deadline) : <span className="text-slate-400">—</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge row={row} />
                    </td>
                    <td className="px-4 py-3 max-w-[160px]">
                      <span className="text-xs text-slate-500 truncate block" title={row.note ?? ""}>
                        {row.note ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.status === "PENDING_COMPENSATION" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400"
                            onClick={() => { setConfirmRow(row); setConfirmAction("compensated"); }}
                          >
                            <CheckCircle2 className="h-3 w-3" /> Compensated
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                            onClick={() => { setConfirmRow(row); setConfirmAction("defaulted"); }}
                          >
                            <AlertTriangle className="h-3 w-3" /> Mark Absent
                          </Button>
                        </div>
                      )}
                      {row.status === "COMPENSATED" && (
                        <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Cleared
                        </span>
                      )}
                      {row.status === "DEFAULTED" && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" /> Absent recorded
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
              <p className="text-sm text-slate-500">
                Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Create Modal ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-blue-600" />
              Add Swap Day
            </DialogTitle>
            <DialogDescription>
              Record an employee&apos;s absent day and assign a compensation date. Deadline is auto-set to 30 days from the absent date.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Employee picker */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Employee *</label>

              {form.employeeId && selectedEmployee ? (
                /* Selected state */
                <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-md px-3 py-2.5 border border-blue-200 dark:border-blue-700">
                  <div className="h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {selectedEmployee.fullName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 truncate">{selectedEmployee.fullName}</p>
                    <p className="text-xs text-blue-500 dark:text-blue-400">{selectedEmployee.employeeId} · {selectedEmployee.department ?? "—"}</p>
                  </div>
                  <button
                    className="text-xs text-slate-400 hover:text-red-500 shrink-0 px-1"
                    onClick={() => { setForm((f) => ({ ...f, employeeId: "" })); setEmpSearch(""); }}
                  >
                    ✕ Change
                  </button>
                </div>
              ) : (
                /* Search + list state */
                <div className="flex flex-col gap-0 border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden">
                  {/* Search bar */}
                  <div className="relative border-b border-slate-200 dark:border-slate-700">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none"
                      placeholder="Search by name or ID..."
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {/* Employee list */}
                  <div className="max-h-44 overflow-y-auto">
                    {employees.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-slate-400">
                        {empSearch ? "No employees found" : "Loading..."}
                      </div>
                    ) : (
                      employees.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800/60 last:border-0 flex items-center gap-2.5"
                          onClick={() => { setForm((f) => ({ ...f, employeeId: e.id })); }}
                        >
                          <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs font-bold shrink-0">
                            {e.fullName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{e.fullName}</p>
                            <p className="text-xs text-slate-500">{e.employeeId}{e.department ? ` · ${e.department}` : ""}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Absent date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Absent Date *</label>
              <Input
                type="date"
                value={form.absentDate}
                onChange={(e) => setForm((f) => ({ ...f, absentDate: e.target.value }))}
              />
            </div>

            {/* Compensation date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Compensation Date
                <span className="ml-1.5 text-xs font-normal text-slate-400">(optional — can be set later)</span>
              </label>
              <Input
                type="date"
                value={form.compensationDate}
                min={form.absentDate || undefined}
                onChange={(e) => setForm((f) => ({ ...f, compensationDate: e.target.value }))}
              />
              {form.absentDate && form.compensationDate && (
                <p className="text-xs text-slate-500">
                  Deadline will be: {new Date(new Date(form.absentDate).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              )}
            </div>

            {/* Note */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Note (optional)</label>
              <Input
                placeholder="e.g. Verbal approval by manager"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="gap-2">
              {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create Swap Day
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Action Modal ── */}
      <Dialog open={!!confirmRow} onOpenChange={(o) => { if (!o) { setConfirmRow(null); setConfirmAction(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className={cn(
              "flex items-center gap-2",
              confirmAction === "compensated" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
            )}>
              {confirmAction === "compensated"
                ? <><CheckCircle2 className="h-5 w-5" /> Mark as Compensated</>
                : <><AlertTriangle className="h-5 w-5" /> Mark as Absent</>
              }
            </DialogTitle>
            <DialogDescription className="pt-1">
              {confirmAction === "compensated"
                ? `Confirm that ${confirmRow?.employee.fullName} worked on the compensation day (${formatDate(confirmRow?.compensationDate)}). The swap day will be closed with no salary impact.`
                : `Mark ${confirmRow?.employee.fullName} as absent for ${formatDate(confirmRow?.absentDate)}. This will be recorded in attendance for salary calculation.`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmRow(null); setConfirmAction(null); }}>Cancel</Button>
            <Button
              onClick={handleAction}
              disabled={acting}
              className={cn(
                "gap-2",
                confirmAction === "compensated"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
              )}
            >
              {acting && <RefreshCw className="h-4 w-4 animate-spin" />}
              {confirmAction === "compensated" ? "Confirm Compensated" : "Record Absent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Set Compensation Date Modal ── */}
      <Dialog open={!!setCompRow} onOpenChange={(o) => { if (!o) { setSetCompRow(null); setSetCompDate(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <CalendarDays className="h-5 w-5" /> Set Compensation Date
            </DialogTitle>
            <DialogDescription className="pt-1">
              Set the day {setCompRow?.employee.fullName} will compensate for being absent on{" "}
              <strong>{formatDate(setCompRow?.absentDate ?? "")}</strong>.
              The deadline will be automatically set to 30 days from the absent date.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              type="date"
              value={setCompDate}
              min={setCompRow?.absentDate ? new Date(new Date(setCompRow.absentDate).getTime() + 86400000).toISOString().split("T")[0] : undefined}
              onChange={(e) => setSetCompDate(e.target.value)}
            />
            {setCompDate && setCompRow && (
              <p className="mt-2 text-xs text-slate-500">
                Deadline: {new Date(new Date(setCompRow.absentDate).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSetCompRow(null); setSetCompDate(""); }}>Cancel</Button>
            <Button onClick={handleSetCompDate} disabled={settingComp || !setCompDate} className="gap-2">
              {settingComp && <RefreshCw className="h-4 w-4 animate-spin" />}
              Save Date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
