"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  RefreshCw,
  Pencil,
  SlidersHorizontal,
  AlertCircle,
  Users,
  CalendarDays,
  Home,
  TrendingUp,
} from "lucide-react";
import api from "@/lib/api";
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
interface AllowanceRow {
  id: string;
  fullName: string;
  email: string;
  mobile: string | null;
  leaveAllowance: number;
  consumedLeave: number;
  remainingLeave: number;
  wfhAllowance: number;
  consumedWfh: number;
  remainingWfh: number;
  hasLeaveBalance: boolean;
  hasWfhPolicy: boolean;
}

interface EditState {
  employee: AllowanceRow;
  leaveAllowance: string;
  wfhAllowance: string;
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4 flex items-start gap-3">
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", color)}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{label}</p>
        <p className="mt-0.5 text-xl font-bold text-slate-900 dark:text-white">{value}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Progress bar cell ─────────────────────────────────────────────────────────
function ProgressCell({
  used,
  total,
  noData,
  noDataLabel,
}: {
  used: number;
  total: number;
  noData: boolean;
  noDataLabel: string;
}) {
  if (noData) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
        <AlertCircle size={11} />
        {noDataLabel}
      </span>
    );
  }

  const remaining = Math.max(0, total - used);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const isExhausted = remaining === 0 && total > 0;
  const isLow = pct >= 70 && !isExhausted;

  const barColor = isExhausted
    ? "bg-red-500 dark:bg-red-500"
    : isLow
    ? "bg-amber-400 dark:bg-amber-400"
    : "bg-emerald-500 dark:bg-emerald-500";

  const remainColor = isExhausted
    ? "text-red-500 dark:text-red-400"
    : isLow
    ? "text-amber-600 dark:text-amber-400"
    : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="min-w-[110px]">
      {/* numbers */}
      <div className="flex items-baseline justify-between mb-1 gap-2">
        <span className={cn("text-sm font-semibold tabular-nums", remainColor)}>
          {remaining} left
        </span>
        <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
          {used}/{total} used
        </span>
      </div>
      {/* bar */}
      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Avatar initials ───────────────────────────────────────────────────────────
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
      {initials}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AllowanceManagerPage() {
  const [rows, setRows] = useState<AllowanceRow[]>([]);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/employees/allowances");
      setRows(data.data);
      setYear(data.year);
    } catch {
      toast.error("Failed to load allowance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.fullName.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      (r.mobile ?? "").includes(q)
    );
  });

  const openEdit = (row: AllowanceRow) => {
    setEditState({
      employee: row,
      leaveAllowance: String(row.leaveAllowance),
      wfhAllowance: String(row.wfhAllowance),
    });
  };

  const handleSave = async () => {
    if (!editState) return;
    setSaving(true);
    try {
      const body: Record<string, number> = {};
      const la = parseFloat(editState.leaveAllowance);
      const wa = parseFloat(editState.wfhAllowance);
      if (!isNaN(la) && la !== editState.employee.leaveAllowance) body.leaveAllowance = la;
      if (
        !isNaN(wa) &&
        wa !== editState.employee.wfhAllowance &&
        editState.employee.hasWfhPolicy
      )
        body.wfhAllowance = wa;

      if (Object.keys(body).length === 0) {
        toast.info("No changes to save");
        setEditState(null);
        return;
      }

      await api.patch(`/admin/employees/${editState.employee.id}/allowance`, body);
      toast.success("Allowance updated successfully");
      setEditState(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to update allowance");
    } finally {
      setSaving(false);
    }
  };

  const isEditDisabled = (row: AllowanceRow) =>
    row.remainingLeave <= 0 && row.remainingWfh <= 0;

  const totalLeave = rows.reduce((s, r) => s + r.leaveAllowance, 0);
  const totalConsumedLeave = rows.reduce((s, r) => s + r.consumedLeave, 0);
  const totalConsumedWfh = rows.reduce((s, r) => s + r.consumedWfh, 0);
  const activeCount = rows.length;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <SlidersHorizontal size={18} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">
              Allowance Manager
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Leave &amp; WFH allowances · {year}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="gap-1.5 shrink-0"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Employees"
          value={activeCount}
          sub="active"
          icon={Users}
          color="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <StatCard
          label="Leave Allowance"
          value={totalLeave}
          sub="total days"
          icon={CalendarDays}
          color="bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
        />
        <StatCard
          label="Leave Consumed"
          value={totalConsumedLeave}
          sub="days approved"
          icon={TrendingUp}
          color="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
        <StatCard
          label="WFH Consumed"
          value={totalConsumedWfh}
          sub="days approved"
          icon={Home}
          color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
      </div>

      {/* ── Table card ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <div className="relative flex-1">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email or mobile…"
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
            />
          </div>
          <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
            {filtered.length} / {rows.length}
          </span>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <WeaveSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <SlidersHorizontal size={30} className="opacity-25" />
            <p className="text-sm">No employees found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide w-[35%]">
                    Employee
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide w-[25%]">
                    Leave Balance
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide w-[25%]">
                    WFH Balance
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide w-[15%]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filtered.map((row) => {
                  const disabled = isEditDisabled(row);
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors"
                    >
                      {/* Employee — name + email + mobile stacked */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={row.fullName} />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate text-sm">
                              {row.fullName}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {row.email}
                            </p>
                            {row.mobile && (
                              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                                {row.mobile}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Leave balance with progress bar */}
                      <td className="px-4 py-3">
                        <ProgressCell
                          used={row.consumedLeave}
                          total={row.leaveAllowance}
                          noData={!row.hasLeaveBalance}
                          noDataLabel="No balance"
                        />
                      </td>

                      {/* WFH balance with progress bar */}
                      <td className="px-4 py-3">
                        <ProgressCell
                          used={row.consumedWfh}
                          total={row.wfhAllowance}
                          noData={!row.hasWfhPolicy}
                          noDataLabel="No policy"
                        />
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => !disabled && openEdit(row)}
                          disabled={disabled}
                          title={
                            disabled
                              ? "0 balance remaining — no changes allowed"
                              : "Edit allowances"
                          }
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                            disabled
                              ? "bg-slate-100 text-slate-400 dark:bg-slate-700/40 dark:text-slate-500 cursor-not-allowed opacity-60"
                              : "bg-primary/10 text-primary hover:bg-primary hover:text-white cursor-pointer"
                          )}
                        >
                          <Pencil size={11} />
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Edit dialog ──────────────────────────────────────────────────────── */}
      <Dialog
        open={!!editState}
        onOpenChange={(o) => {
          if (!o) setEditState(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editState && <Avatar name={editState.employee.fullName} />}
              Edit Allowances
            </DialogTitle>
            <DialogDescription>
              Adjusting allowances for{" "}
              <span className="font-semibold text-slate-900 dark:text-white">
                {editState?.employee.fullName}
              </span>
            </DialogDescription>
          </DialogHeader>

          {editState && (
            <div className="space-y-5 py-1">
              {/* Leave allowance */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-1.5">
                    <CalendarDays size={14} className="text-violet-500" />
                    Leave Allowance
                  </p>
                  <span className="text-xs text-slate-400">days / year</span>
                </div>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={editState.leaveAllowance}
                  onChange={(e) =>
                    setEditState((s) => (s ? { ...s, leaveAllowance: e.target.value } : s))
                  }
                  disabled={!editState.employee.hasLeaveBalance}
                  placeholder="e.g. 12"
                  className="h-9"
                />
                {editState.employee.hasLeaveBalance ? (
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Consumed:{" "}
                      <strong className="text-slate-700 dark:text-slate-300">
                        {editState.employee.consumedLeave}
                      </strong>{" "}
                      days
                    </span>
                    <span>
                      Remaining auto-updates
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle size={11} />
                    No leave balance record for this employee
                  </p>
                )}
              </div>

              {/* WFH allowance */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-1.5">
                    <Home size={14} className="text-emerald-500" />
                    WFH Allowance
                  </p>
                  <span className="text-xs text-slate-400">days / year</span>
                </div>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={editState.wfhAllowance}
                  onChange={(e) =>
                    setEditState((s) => (s ? { ...s, wfhAllowance: e.target.value } : s))
                  }
                  disabled={!editState.employee.hasWfhPolicy}
                  placeholder="e.g. 24"
                  className="h-9"
                />
                {editState.employee.hasWfhPolicy ? (
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Consumed:{" "}
                      <strong className="text-slate-700 dark:text-slate-300">
                        {editState.employee.consumedWfh}
                      </strong>{" "}
                      days
                    </span>
                    <span>Per-employee override</span>
                  </div>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle size={11} />
                    Assign a WFH policy to this employee first
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditState(null)}
              disabled={saving}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
