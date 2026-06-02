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
  Home,
} from "lucide-react";
import api from "@/lib/api";
import { formatDate, wfhStatusVariant } from "@/lib/utils";
import type { WfhApplication } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";



// ── Types ─────────────────────────────────────────────────────────────────────
interface WfhWithEmployee extends WfhApplication {
  employee: {
    id: string;
    fullName: string;
    employeeId: string;
    department?: string;
    user: { email: string };
  };
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
  const v = wfhStatusVariant(status as any) as SV;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", svClass[v])}>
      {status}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">{value || "—"}</p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function WfhRequestsTab() {
  const currentYear = new Date().getFullYear();

  const [wfhList, setWfhList] = useState<WfhWithEmployee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const [year, setYear] = useState(currentYear);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [loading, setLoading] = useState(true);
  const [detailWfh, setDetailWfh] = useState<WfhWithEmployee | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchWfh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        page: String(page),
        limit: String(limit),
        ...(statusFilter && { status: statusFilter }),
        ...(search && { search }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
      });
      const res = await api.get(`/admin/wfh?${params}`);
      setWfhList(res.data.data);
      setTotal(res.data.total);
    } catch {
      toast.error("Failed to load WFH requests");
    } finally {
      setLoading(false);
    }
  }, [year, page, statusFilter, search, dateFrom, dateTo]);

  useEffect(() => { fetchWfh(); }, [fetchWfh]);
  useEffect(() => { setPage(1); }, [year, statusFilter, search, dateFrom, dateTo]);

  const handleApprove = async (wfh: WfhWithEmployee) => {
    setActionLoading(true);
    try {
      await api.patch(`/admin/wfh/${wfh.id}/approve`);
      toast.success(`WFH approved for ${wfh.employee.fullName}`);
      setDetailWfh(null);
      fetchWfh();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to approve WFH");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (wfh: WfhWithEmployee) => {
    if (!rejectComment.trim()) { toast.error("Comment is required for rejection"); return; }
    setActionLoading(true);
    try {
      await api.patch(`/admin/wfh/${wfh.id}/reject`, { comment: rejectComment });
      toast.success("WFH application rejected");
      setDetailWfh(null);
      setRejectComment("");
      fetchWfh();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to reject WFH");
    } finally {
      setActionLoading(false);
    }
  };

  const yearOpts = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <div className="space-y-5">
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
          <option value="CANCELLED">Cancelled</option>
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
            type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <span className="text-slate-400 text-xs">–</span>
          <input
            type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="h-9 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-slate-400 text-xs px-1">✕</button>
          )}
        </div>

        <Button variant="ghost" size="icon" onClick={fetchWfh} title="Refresh">
          <RefreshCw size={15} />
        </Button>
      </div>

      {/* Table — desktop */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <WeaveSpinner className="animate-spin text-primary" size={24} />
          </div>
        ) : wfhList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Home size={36} className="mb-3 opacity-40" />
            <p className="font-medium">No WFH requests found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Days</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Applied</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {wfhList.map((wfh) => (
                <tr
                  key={wfh.id}
                  onClick={() => { setDetailWfh(wfh); setRejectComment(""); }}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900 dark:text-white">{wfh.employee.fullName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {wfh.employee.employeeId}{wfh.employee.department && ` · ${wfh.employee.department}`}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-slate-700 dark:text-slate-300">{formatDate(wfh.date)}</p>
                    {wfh.toDate && wfh.date !== wfh.toDate && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">→ {formatDate(wfh.toDate)}</p>
                    )}
                    {wfh.isHalfDay && (
                      <span className="text-xs text-primary font-medium">
                        {wfh.halfDaySlot === "FIRST_HALF" ? "First half" : "Second half"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-semibold text-slate-900 dark:text-white">{wfh.totalDays}</span>
                  </td>
                  <td className="px-4 py-3.5"><StatusBadge status={wfh.status} /></td>
                  <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-xs">{formatDate(wfh.createdAt)}</td>
                  <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                    {wfh.status === "PENDING" && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleApprove(wfh)}
                          className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30"
                          title="Approve"
                        >
                          <CheckCircle2 size={14} />
                        </button>
                        <button
                          onClick={() => { setDetailWfh(wfh); setRejectComment(""); }}
                          className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
                          title="Reject"
                        >
                          <XCircle size={14} />
                        </button>
                      </div>
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
        {loading ? (
          <div className="flex justify-center py-10"><WeaveSpinner className="animate-spin text-primary" size={24} /></div>
        ) : wfhList.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <Home size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No WFH requests found</p>
          </div>
        ) : (
          wfhList.map((wfh) => (
            <div
              key={wfh.id}
              onClick={() => { setDetailWfh(wfh); setRejectComment(""); }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">{wfh.employee.fullName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{wfh.employee.employeeId}</p>
                </div>
                <StatusBadge status={wfh.status} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {formatDate(wfh.date)}
                  {wfh.toDate && wfh.date !== wfh.toDate ? ` → ${formatDate(wfh.toDate)}` : ""}
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{wfh.totalDays} day{wfh.totalDays !== 1 ? "s" : ""}</span>
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
            <Button variant="outline" size="icon-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={15} /></Button>
            <span className="text-xs font-medium">{page} / {totalPages}</span>
            <Button variant="outline" size="icon-sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={15} /></Button>
          </div>
        </div>
      )}

      {/* WFH Detail Sheet */}
      <Sheet open={!!detailWfh} onOpenChange={(o) => !o && setDetailWfh(null)}>
        <SheetContent className="w-full max-w-lg">
          {detailWfh && (
            <>
              <SheetHeader className="pr-10">
                <SheetTitle>WFH Request Details</SheetTitle>
                <SheetDescription>
                  {detailWfh.employee.fullName} · {detailWfh.employee.employeeId}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-1">
                <div className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs text-slate-500">Status</span>
                  <StatusBadge status={detailWfh.status} />
                </div>

                <DetailRow label="Employee" value={`${detailWfh.employee.fullName} (${detailWfh.employee.employeeId})`} />
                <DetailRow label="Department" value={detailWfh.employee.department} />
                <DetailRow label="Email" value={detailWfh.employee.user.email} />
                <DetailRow
                  label="WFH Date(s)"
                  value={
                    detailWfh.toDate && detailWfh.date !== detailWfh.toDate
                      ? `${formatDate(detailWfh.date)} → ${formatDate(detailWfh.toDate)}`
                      : formatDate(detailWfh.date)
                  }
                />
                {detailWfh.isHalfDay && (
                  <DetailRow
                    label="Half Day"
                    value={detailWfh.halfDaySlot === "FIRST_HALF" ? "First half" : "Second half"}
                  />
                )}
                <DetailRow label="Total Days" value={`${detailWfh.totalDays} day${detailWfh.totalDays !== 1 ? "s" : ""}`} />
                <DetailRow label="Reason" value={detailWfh.reason} />
                <DetailRow label="Applied On" value={formatDate(detailWfh.createdAt)} />

                {detailWfh.adminComment && (
                  <div className="mt-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <p className="text-xs text-slate-500 mb-1">Admin Comment</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{detailWfh.adminComment}</p>
                  </div>
                )}

                {detailWfh.status === "PENDING" && (
                  <div className="mt-6 space-y-4">
                    <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <p className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-1.5">
                        <CheckCircle2 size={15} /> Approve WFH
                      </p>
                      <Button
                        className="w-full bg-green-600 hover:bg-green-700 text-white border-0"
                        onClick={() => handleApprove(detailWfh)}
                        disabled={actionLoading}
                      >
                        {actionLoading ? <WeaveSpinner className="animate-spin mr-2" size={15} /> : <CheckCircle2 size={15} className="mr-2" />}
                        Approve
                      </Button>
                    </div>

                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5">
                        <XCircle size={15} /> Reject WFH
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
                        onClick={() => handleReject(detailWfh)}
                        disabled={actionLoading || !rejectComment.trim()}
                      >
                        {actionLoading ? <WeaveSpinner className="animate-spin mr-2" size={15} /> : <XCircle size={15} className="mr-2" />}
                        Reject
                      </Button>
                    </div>
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
