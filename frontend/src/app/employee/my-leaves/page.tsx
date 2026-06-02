"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  CalendarDays,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import api from "@/lib/api";
import {
  formatDate,
  formatDateShort,
  leaveStatusVariant,
  LEAVE_TYPE_LABELS,
} from "@/lib/utils";
import type { LeaveApplication, LeaveBalance } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

// ── Status badge ──────────────────────────────────────────────────────────────
type BadgeVariant = "success" | "warning" | "destructive" | "gray" | "default";
const variantMap: Record<BadgeVariant, string> = {
  success:     "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  warning:     "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  destructive: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  gray:        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  default:     "bg-primary/10 text-primary",
};

function StatusBadge({ status }: { status: string }) {
  const v = leaveStatusVariant(status as any) as BadgeVariant;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        variantMap[v]
      )}
    >
      {status}
    </span>
  );
}

// ── Balance card ──────────────────────────────────────────────────────────────
function BalanceCard({ balance }: { balance: LeaveBalance }) {
  const pct =
    balance.totalDays > 0
      ? (balance.remainingDays / balance.totalDays) * 100
      : 0;
  const barColor =
    pct > 50 ? "bg-green-500" : pct > 20 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {LEAVE_TYPE_LABELS[balance.leaveType] ?? balance.leaveType}
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
            {balance.remainingDays}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-1">
              / {balance.totalDays} days
            </span>
          </p>
        </div>
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <CalendarDays size={18} className="text-primary" />
        </div>
      </div>
      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1.5">
        <span>{balance.usedDays} used</span>
        <span>{balance.remainingDays} remaining</span>
      </div>
    </div>
  );
}

// ── Detail row ────────────────────────────────────────────────────────────────
function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <div className="text-sm font-medium text-slate-900 dark:text-white">
        {children}
      </div>
    </div>
  );
}

// ── Status icon ───────────────────────────────────────────────────────────────
function StatusIcon({ status }: { status: string }) {
  if (status === "APPROVED")
    return <CheckCircle2 size={16} className="text-green-500" />;
  if (status === "REJECTED")
    return <AlertTriangle size={16} className="text-red-500" />;
  if (status === "PENDING")
    return <Clock size={16} className="text-amber-500" />;
  return null;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MyLeavesPage() {
  const currentYear = new Date().getFullYear();

  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 15;
  const totalPages = Math.ceil(total / limit);

  const [year, setYear] = useState(currentYear);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [loadingBalances, setLoadingBalances] = useState(true);
  const [loadingLeaves, setLoadingLeaves] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Detail sheet
  const [selected, setSelected] = useState<LeaveApplication | null>(null);

  useEffect(() => {
    setLoadingBalances(true);
    api
      .get(`/employee/leaves/balances?year=${year}`)
      .then((r) => setBalances(r.data.balances ?? []))
      .catch(() => toast.error("Failed to load balances"))
      .finally(() => setLoadingBalances(false));
  }, [year]);

  const fetchLeaves = useCallback(async () => {
    setLoadingLeaves(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        page: String(page),
        limit: String(limit),
        ...(statusFilter && { status: statusFilter }),
        ...(typeFilter && { leaveType: typeFilter }),
      });
      const res = await api.get(`/employee/leaves?${params}`);
      setLeaves(res.data.data);
      setTotal(res.data.total);
    } catch {
      toast.error("Failed to load leave history");
    } finally {
      setLoadingLeaves(false);
    }
  }, [year, page, statusFilter, typeFilter]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  useEffect(() => {
    setPage(1);
  }, [year, statusFilter, typeFilter]);

  const handleCancel = async (leave: LeaveApplication) => {
    if (
      !confirm(
        `Cancel leave from ${formatDate(leave.fromDate)} to ${formatDate(leave.toDate)}?`
      )
    )
      return;
    setCancellingId(leave.id);
    try {
      await api.patch(`/employee/leaves/${leave.id}/cancel`);
      toast.success("Leave cancelled");
      setSelected(null);
      fetchLeaves();
      api
        .get(`/employee/leaves/balances?year=${year}`)
        .then((r) => setBalances(r.data.balances ?? []));
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to cancel leave");
    } finally {
      setCancellingId(null);
    }
  };

  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-heading font-bold text-slate-900 dark:text-white">
            My Leaves
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Track your leave balance and history
          </p>
        </div>
        <Link href="/employee/apply-leave">
          <Button size="sm">
            <Plus size={16} className="mr-1.5" />
            Apply Leave
          </Button>
        </Link>
      </div>

      {/* Balance cards */}
      {loadingBalances ? (
        <div className="flex items-center justify-center py-8">
          <WeaveSpinner className="animate-spin text-primary" size={24} />
        </div>
      ) : balances.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center text-slate-500">
          <p className="text-sm">
            No leave balance found for {year}. Apply for leave to initialize
            your balance.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {balances.map((b) => (
            <BalanceCard key={b.id} balance={b} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="ABSENT">Absent</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">All Types</option>
          <option value="SICK">Sick Leave</option>
          <option value="TRANSPORT_WEATHER">Transport / Weather</option>
          <option value="PERSONAL">Personal Leave</option>
        </select>

        <Button
          variant="ghost"
          size="icon"
          onClick={fetchLeaves}
          className="h-9 w-9"
        >
          <RefreshCw size={15} />
        </Button>
      </div>

      {/* Table — desktop */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        {loadingLeaves ? (
          <div className="flex items-center justify-center py-16">
            <WeaveSpinner className="animate-spin text-primary" size={24} />
          </div>
        ) : leaves.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
            <CalendarDays size={36} className="mb-3 opacity-40" />
            <p className="font-medium">No leave applications</p>
            <p className="text-sm mt-1">
              {statusFilter || typeFilter
                ? "Try adjusting your filters"
                : `No leaves recorded for ${year}`}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Dates
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Type
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Days
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Reason
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {leaves.map((leave) => (
                <tr
                  key={leave.id}
                  onClick={() => setSelected(leave)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900 dark:text-white">
                      {formatDate(leave.fromDate)}
                    </p>
                    {leave.fromDate !== leave.toDate && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        → {formatDate(leave.toDate)}
                      </p>
                    )}
                    {leave.isHalfDay && (
                      <span className="text-xs text-primary font-medium">
                        {leave.halfDaySlot === "FIRST_HALF" ? "First" : "Second"}{" "}
                        half
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400">
                    {LEAVE_TYPE_LABELS[leave.leaveType] ?? leave.leaveType}
                    {leave.isAdminEntry && (
                      <span className="ml-1.5 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full">
                        Admin
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {leave.totalDays}
                    </span>
                    <span className="text-xs text-slate-500 ml-1">
                      day{leave.totalDays !== 1 ? "s" : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 max-w-[200px]">
                    <p className="text-slate-600 dark:text-slate-400 truncate">
                      {leave.reason}
                    </p>
                    {leave.adminComment && (
                      <p className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400 mt-0.5 truncate">
                        <MessageSquare size={10} className="shrink-0" />
                        {leave.adminComment}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={leave.status} />
                  </td>
                  <td
                    className="px-4 py-3.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {leave.status === "PENDING" && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleCancel(leave)}
                        disabled={cancellingId === leave.id}
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Cancel leave"
                      >
                        {cancellingId === leave.id ? (
                          <WeaveSpinner className="animate-spin" size={14} />
                        ) : (
                          <X size={14} />
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Card list — mobile */}
      <div className="md:hidden space-y-3">
        {loadingLeaves ? (
          <div className="flex justify-center py-10">
            <WeaveSpinner className="animate-spin text-primary" size={24} />
          </div>
        ) : leaves.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <CalendarDays size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No leave applications for {year}</p>
          </div>
        ) : (
          leaves.map((leave) => (
            <div
              key={leave.id}
              onClick={() => setSelected(leave)}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 cursor-pointer active:scale-[0.99] transition-transform"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">
                    {formatDateShort(leave.fromDate)}
                    {leave.fromDate !== leave.toDate &&
                      ` → ${formatDateShort(leave.toDate)}`}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {LEAVE_TYPE_LABELS[leave.leaveType] ?? leave.leaveType}
                    {leave.isHalfDay &&
                      ` · ${leave.halfDaySlot === "FIRST_HALF" ? "First" : "Second"} half`}
                  </p>
                </div>
                <StatusBadge status={leave.status} />
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                {leave.reason}
              </p>
              {leave.adminComment && (
                <div className="mt-2 flex items-start gap-1.5 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-2 py-1.5">
                  <MessageSquare size={11} className="shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{leave.adminComment}</span>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span>{leave.totalDays} day{leave.totalDays !== 1 ? "s" : ""}</span>
                <span className="text-primary text-[11px]">Tap to view details →</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={15} />
            </Button>
            <span className="text-xs font-medium">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Leave Detail Sheet ──────────────────────────────────────────────── */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full max-w-md">
          {selected && (
            <>
              <SheetHeader className="pr-10">
                <SheetTitle className="flex items-center gap-2">
                  <StatusIcon status={selected.status} />
                  Leave Details
                </SheetTitle>
                <SheetDescription>
                  {LEAVE_TYPE_LABELS[selected.leaveType] ?? selected.leaveType}
                  {" · "}
                  {formatDate(selected.fromDate)}
                  {selected.fromDate !== selected.toDate &&
                    ` → ${formatDate(selected.toDate)}`}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 pb-6 scrollbar-thin space-y-1 mt-2">
                {/* Status */}
                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Status
                  </span>
                  <StatusBadge status={selected.status} />
                </div>

                <DetailRow label="Leave Type">
                  {LEAVE_TYPE_LABELS[selected.leaveType] ?? selected.leaveType}
                  {selected.isAdminEntry && (
                    <span className="ml-2 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full">
                      Admin entry
                    </span>
                  )}
                </DetailRow>

                <DetailRow label="Period">
                  {selected.fromDate === selected.toDate ? (
                    <>
                      {formatDate(selected.fromDate)}
                      {selected.isHalfDay && (
                        <span className="ml-2 text-xs text-primary font-medium">
                          {selected.halfDaySlot === "FIRST_HALF"
                            ? "First half"
                            : "Second half"}
                        </span>
                      )}
                    </>
                  ) : (
                    `${formatDate(selected.fromDate)} → ${formatDate(selected.toDate)}`
                  )}
                </DetailRow>

                <DetailRow label="Total Days">
                  {selected.totalDays} day{selected.totalDays !== 1 ? "s" : ""}
                  {selected.isUnpaid && (
                    <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
                      (Unpaid)
                    </span>
                  )}
                </DetailRow>

                {/* Reason — full text, no truncation */}
                <div className="py-3 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                    Your Reason
                  </p>
                  <p className="text-sm text-slate-900 dark:text-white leading-relaxed whitespace-pre-wrap">
                    {selected.reason}
                  </p>
                </div>

                {/* Admin comment — prominently shown */}
                {selected.adminComment && (
                  <div
                    className={cn(
                      "mt-2 p-4 rounded-xl border",
                      selected.status === "REJECTED"
                        ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                        : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                    )}
                  >
                    <p
                      className={cn(
                        "text-xs font-semibold flex items-center gap-1.5 mb-2",
                        selected.status === "REJECTED"
                          ? "text-red-600 dark:text-red-400"
                          : "text-slate-600 dark:text-slate-400"
                      )}
                    >
                      <MessageSquare size={13} />
                      {selected.status === "REJECTED"
                        ? "Rejection Reason from Admin"
                        : "Admin Comment"}
                    </p>
                    <p
                      className={cn(
                        "text-sm leading-relaxed whitespace-pre-wrap",
                        selected.status === "REJECTED"
                          ? "text-red-700 dark:text-red-300"
                          : "text-slate-700 dark:text-slate-300"
                      )}
                    >
                      {selected.adminComment}
                    </p>
                  </div>
                )}

                {/* Cancel action for PENDING */}
                {selected.status === "PENDING" && (
                  <div className="mt-6 pt-2">
                    <Button
                      variant="outline"
                      className="w-full border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => handleCancel(selected)}
                      disabled={cancellingId === selected.id}
                    >
                      {cancellingId === selected.id ? (
                        <WeaveSpinner className="animate-spin mr-2" size={15} />
                      ) : (
                        <X size={15} className="mr-2" />
                      )}
                      Cancel This Leave
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
