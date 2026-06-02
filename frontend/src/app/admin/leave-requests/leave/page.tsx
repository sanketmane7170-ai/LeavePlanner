"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ShieldAlert,
  Users,
  AlertTriangle,
  Home,
} from "lucide-react";
import api from "@/lib/api";
import { formatDate, LEAVE_TYPE_LABELS, leaveStatusVariant } from "@/lib/utils";
import type { LeaveApplication } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
interface LeaveWithEmployee extends LeaveApplication {
  noticeViolation?: boolean;
  employee: {
    id: string;
    fullName: string;
    employeeId: string;
    department?: string;
    designation?: string;
    user: { email: string };
  };
}

interface EmployeeBalanceSummary {
  year: number;
  leaveBalance: { totalDays: number; usedDays: number; remainingDays: number } | null;
  wfhBalance: { allowedDays: number; usedDays: number; pendingDays: number; remainingDays: number } | null;
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
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", svClass[v])}>
      {status}
    </span>
  );
}

// ── Detail row ────────────────────────────────────────────────────────────────
function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">{value || "—"}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LeaveRequestsPage() {
  const currentYear = new Date().getFullYear();

  const [leaves, setLeaves] = useState<LeaveWithEmployee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  // Filters
  const [year, setYear] = useState(currentYear);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Detail sheet
  const [detailLeave, setDetailLeave] = useState<LeaveWithEmployee | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [employeeBalance, setEmployeeBalance] = useState<EmployeeBalanceSummary | null>(null);

  // Bulk reject modal
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectComment, setBulkRejectComment] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        page: String(page),
        limit: String(limit),
        ...(statusFilter && { status: statusFilter }),
        ...(typeFilter && { leaveType: typeFilter }),
        ...(search && { search }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
      });
      const res = await api.get(`/admin/leaves?${params}`);
      setLeaves(res.data.data);
      setTotal(res.data.total);
      setSelectedIds(new Set()); // clear selection on refresh
    } catch {
      toast.error("Failed to load leave requests");
    } finally {
      setLoading(false);
    }
  }, [year, page, statusFilter, typeFilter, search, dateFrom, dateTo]);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);
  useEffect(() => { setPage(1); }, [year, statusFilter, typeFilter, search, dateFrom, dateTo]);

  // Fetch employee balance when detail sheet opens
  useEffect(() => {
    if (!detailLeave) { setEmployeeBalance(null); return; }
    const yr = new Date(detailLeave.fromDate).getFullYear();
    api.get(`/admin/employees/${detailLeave.employee.id}/balance?year=${yr}`)
      .then((r) => setEmployeeBalance(r.data))
      .catch(() => setEmployeeBalance(null));
  }, [detailLeave]);

  // ── Selection ────────────────────────────────────────────────────────────
  const pendingLeaves = leaves.filter((l) => l.status === "PENDING");
  const allPendingSelected = pendingLeaves.length > 0 && pendingLeaves.every((l) => selectedIds.has(l.id));

  const toggleAll = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingLeaves.map((l) => l.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Approve single ────────────────────────────────────────────────────────
  const handleApprove = async (leave: LeaveWithEmployee) => {
    setActionLoading(true);
    try {
      await api.patch(`/admin/leaves/${leave.id}/approve`);
      toast.success(`Leave approved for ${leave.employee.fullName}`);
      setDetailLeave(null);
      fetchLeaves();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to approve leave");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Reject single ─────────────────────────────────────────────────────────
  const handleReject = async (leave: LeaveWithEmployee) => {
    if (!rejectComment.trim()) { toast.error("Comment is required for rejection"); return; }
    setActionLoading(true);
    try {
      await api.patch(`/admin/leaves/${leave.id}/reject`, { comment: rejectComment });
      toast.success(`Leave rejected`);
      setDetailLeave(null);
      setRejectComment("");
      fetchLeaves();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to reject leave");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Override absent ───────────────────────────────────────────────────────
  const handleOverrideAbsent = async (leave: LeaveWithEmployee) => {
    if (!confirm("Override this absence to Approved?")) return;
    setActionLoading(true);
    try {
      await api.patch(`/admin/leaves/${leave.id}/override-absent`);
      toast.success("Absence overridden to Approved");
      setDetailLeave(null);
      fetchLeaves();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to override");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Bulk approve ──────────────────────────────────────────────────────────
  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await api.post("/admin/leaves/bulk-approve", { ids: Array.from(selectedIds) });
      toast.success(res.data.message);
      setSelectedIds(new Set());
      fetchLeaves();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Bulk approve failed");
    } finally {
      setBulkLoading(false);
    }
  };

  // ── Bulk reject ───────────────────────────────────────────────────────────
  const handleBulkReject = async () => {
    if (!bulkRejectComment.trim()) { toast.error("Comment is required"); return; }
    setBulkLoading(true);
    try {
      const res = await api.post("/admin/leaves/bulk-reject", {
        ids: Array.from(selectedIds),
        comment: bulkRejectComment,
      });
      toast.success(res.data.message);
      setBulkRejectOpen(false);
      setBulkRejectComment("");
      setSelectedIds(new Set());
      fetchLeaves();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Bulk reject failed");
    } finally {
      setBulkLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const yearOpts = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-2xl font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarDays size={24} className="text-primary" />
            Leave Requests
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage leave applications from employees.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{total} total</p>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchLeaves} title="Refresh">
          <RefreshCw size={16} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
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
          <option value="ABSENT">Absent</option>
          <option value="CANCELLED">Cancelled</option>
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

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee…"
            className="h-9 pl-8 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 w-44"
          />
        </div>

        <div className="flex items-center gap-1">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <span className="text-slate-400 text-xs">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs px-1">✕</button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
          <span className="text-sm font-medium text-primary flex items-center gap-1.5">
            <Users size={14} />
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelectedIds(new Set())}
              className="h-8"
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleBulkApprove}
              disabled={bulkLoading}
              className="h-8 bg-green-600 hover:bg-green-700 text-white border-0"
            >
              {bulkLoading ? <WeaveSpinner className="animate-spin mr-1" size={13} /> : <CheckCircle2 size={13} className="mr-1" />}
              Approve All
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setBulkRejectOpen(true)}
              disabled={bulkLoading}
              className="h-8"
            >
              <XCircle size={13} className="mr-1" />
              Reject All
            </Button>
          </div>
        </div>
      )}

      {/* Table — desktop */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <WeaveSpinner className="animate-spin text-primary" size={24} />
          </div>
        ) : leaves.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <CalendarDays size={36} className="mb-3 opacity-40" />
            <p className="font-medium">No leave requests found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                <th className="px-4 py-3 w-10">
                  {pendingLeaves.length > 0 && (
                    <input
                      type="checkbox"
                      checked={allPendingSelected}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  )}
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Period</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Days</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Applied</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {leaves.map((leave) => {
                const isPending = leave.status === "PENDING";
                const isSelected = selectedIds.has(leave.id);
                return (
                  <tr
                    key={leave.id}
                    className={cn(
                      "hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer",
                      isSelected && "bg-primary/5 dark:bg-primary/10"
                    )}
                    onClick={() => { setDetailLeave(leave); setRejectComment(""); }}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {isPending && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(leave.id)}
                          className="rounded"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-900 dark:text-white">
                        {leave.employee.fullName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {leave.employee.employeeId}
                        {leave.employee.department && ` · ${leave.employee.department}`}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {LEAVE_TYPE_LABELS[leave.leaveType] ?? leave.leaveType}
                      </span>
                      {leave.isAdminEntry && (
                        <span className="ml-1.5 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full">Admin</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-slate-700 dark:text-slate-300">{formatDate(leave.fromDate)}</p>
                      {leave.fromDate !== leave.toDate && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">→ {formatDate(leave.toDate)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-slate-900 dark:text-white">{leave.totalDays}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusBadge status={leave.status} />
                        {leave.noticeViolation && (
                          <span
                            title="Applied without required notice period"
                            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          >
                            <AlertTriangle size={9} />
                            Late notice
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-xs">
                      {formatDate(leave.createdAt)}
                    </td>
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      {isPending && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleApprove(leave)}
                            className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                            title="Approve"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                          <button
                            onClick={() => { setDetailLeave(leave); setRejectComment(""); }}
                            className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            title="Review / Reject"
                          >
                            <XCircle size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Card list — mobile */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <WeaveSpinner className="animate-spin text-primary" size={24} />
          </div>
        ) : leaves.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <CalendarDays size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No leave requests found</p>
          </div>
        ) : (
          leaves.map((leave) => (
            <div
              key={leave.id}
              onClick={() => { setDetailLeave(leave); setRejectComment(""); }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 cursor-pointer active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">
                    {leave.employee.fullName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {leave.employee.employeeId} · {LEAVE_TYPE_LABELS[leave.leaveType] ?? leave.leaveType}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={leave.status} />
                  {leave.noticeViolation && (
                    <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <AlertTriangle size={9} />
                      Late notice
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>{formatDate(leave.fromDate)}{leave.fromDate !== leave.toDate ? ` → ${formatDate(leave.toDate)}` : ""}</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{leave.totalDays} day{leave.totalDays !== 1 ? "s" : ""}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={15} />
            </Button>
            <span className="text-xs font-medium">{page} / {totalPages}</span>
            <Button variant="outline" size="icon-sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Leave Detail Sheet ─────────────────────────────────────────────── */}
      <Sheet open={!!detailLeave} onOpenChange={(o) => !o && setDetailLeave(null)}>
        <SheetContent className="w-full max-w-lg">
          {detailLeave && (
            <>
              <SheetHeader className="pr-10">
                <SheetTitle>Leave Request Details</SheetTitle>
                <SheetDescription>
                  {detailLeave.employee.fullName} · {detailLeave.employee.employeeId}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-1">
                {/* Status row */}
                <div className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs text-slate-500">Status</span>
                  <StatusBadge status={detailLeave.status} />
                </div>

                <DetailRow label="Employee" value={`${detailLeave.employee.fullName} (${detailLeave.employee.employeeId})`} />
                <DetailRow label="Department" value={detailLeave.employee.department} />
                <DetailRow label="Email" value={detailLeave.employee.user.email} />
                <DetailRow label="Leave Type" value={LEAVE_TYPE_LABELS[detailLeave.leaveType] ?? detailLeave.leaveType} />
                <DetailRow
                  label="Period"
                  value={
                    detailLeave.fromDate === detailLeave.toDate
                      ? formatDate(detailLeave.fromDate) + (detailLeave.isHalfDay ? ` (${detailLeave.halfDaySlot === "FIRST_HALF" ? "First half" : "Second half"})` : "")
                      : `${formatDate(detailLeave.fromDate)} → ${formatDate(detailLeave.toDate)}`
                  }
                />
                <DetailRow label="Total Days" value={`${detailLeave.totalDays} day${detailLeave.totalDays !== 1 ? "s" : ""}`} />
                <DetailRow label="Reason" value={detailLeave.reason} />
                <DetailRow label="Applied On" value={formatDate(detailLeave.createdAt)} />

                {detailLeave.adminComment && (
                  <div className="mt-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Admin Comment</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{detailLeave.adminComment}</p>
                  </div>
                )}

                {/* Employee balance summary */}
                {employeeBalance && (
                  <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2.5">
                      Current Balance ({employeeBalance.year})
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {employeeBalance.leaveBalance && (
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                            <CalendarDays size={13} className="text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500 dark:text-slate-400">Leave</p>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {employeeBalance.leaveBalance.remainingDays}
                              <span className="text-xs font-normal text-slate-400 ml-0.5">
                                / {employeeBalance.leaveBalance.totalDays}d
                              </span>
                            </p>
                          </div>
                        </div>
                      )}
                      {employeeBalance.wfhBalance && (
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center shrink-0">
                            <Home size={13} className="text-teal-600 dark:text-teal-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500 dark:text-slate-400">WFH</p>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {employeeBalance.wfhBalance.remainingDays}
                              <span className="text-xs font-normal text-slate-400 ml-0.5">
                                / {employeeBalance.wfhBalance.allowedDays}d
                              </span>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Notice period violation alert */}
                {detailLeave.noticeViolation && (
                  <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                        Notice Period Not Met
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 leading-relaxed">
                        This application was submitted without the minimum advance notice required by the employee's leave policy. You may still approve or reject at your discretion.
                      </p>
                    </div>
                  </div>
                )}

                {/* Actions for PENDING */}
                {detailLeave.status === "PENDING" && (
                  <div className="mt-6 space-y-4">
                    {/* Approve */}
                    <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <p className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-1.5">
                        <CheckCircle2 size={15} />
                        Approve Leave
                      </p>
                      <Button
                        className="w-full bg-green-600 hover:bg-green-700 text-white border-0"
                        onClick={() => handleApprove(detailLeave)}
                        disabled={actionLoading}
                      >
                        {actionLoading ? <WeaveSpinner className="animate-spin mr-2" size={15} /> : <CheckCircle2 size={15} className="mr-2" />}
                        Approve
                      </Button>
                    </div>

                    {/* Reject */}
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5">
                        <XCircle size={15} />
                        Reject Leave
                      </p>
                      <textarea
                        value={rejectComment}
                        onChange={(e) => setRejectComment(e.target.value)}
                        rows={2}
                        placeholder="Rejection reason (required)…"
                        className="w-full px-3 py-2 rounded-xl border border-red-200 dark:border-red-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500/30 mb-2"
                      />
                      <Button
                        variant="destructive"
                        className="w-full"
                        onClick={() => handleReject(detailLeave)}
                        disabled={actionLoading || !rejectComment.trim()}
                      >
                        {actionLoading ? <WeaveSpinner className="animate-spin mr-2" size={15} /> : <XCircle size={15} className="mr-2" />}
                        Reject
                      </Button>
                    </div>
                  </div>
                )}

                {/* Override for ABSENT */}
                {detailLeave.status === "ABSENT" && (
                  <div className="mt-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                      <ShieldAlert size={15} />
                      Override Absence
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-500 mb-3">
                      This leave was auto-marked as absent. You can override it to Approved if the absence was justified.
                    </p>
                    <Button
                      variant="outline"
                      className="w-full border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                      onClick={() => handleOverrideAbsent(detailLeave)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? <WeaveSpinner className="animate-spin mr-2" size={15} /> : <ShieldAlert size={15} className="mr-2" />}
                      Override to Approved
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Bulk Reject Modal ──────────────────────────────────────────────── */}
      <Dialog open={bulkRejectOpen} onOpenChange={(o) => !o && setBulkRejectOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Reject {selectedIds.size} Leave(s)</DialogTitle>
            <DialogDescription>
              Enter a rejection reason. This comment will be applied to all selected leave applications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <textarea
              value={bulkRejectComment}
              onChange={(e) => setBulkRejectComment(e.target.value)}
              rows={3}
              placeholder="Rejection reason (required)…"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleBulkReject}
              disabled={bulkLoading || !bulkRejectComment.trim()}
            >
              {bulkLoading && <WeaveSpinner className="animate-spin mr-2" size={15} />}
              Reject {selectedIds.size} Leave(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
