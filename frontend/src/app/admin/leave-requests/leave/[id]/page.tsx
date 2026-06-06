"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  TrendingUp,
  Info,
  AlertCircle,
  User,
  Home,
  Clock,
  BadgeCheck,
  CreditCard,
  Banknote,
} from "lucide-react";
import api from "@/lib/api";
import { cn, formatDate, LEAVE_TYPE_LABELS, leaveStatusVariant } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WeaveSpinner } from "@/components/ui/weave-spinner";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LeaveDetail {
  id: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  isHalfDay: boolean;
  halfDaySlot?: string | null;
  totalDays: number;
  reason: string;
  status: string;
  adminComment?: string | null;
  isAdminEntry: boolean;
  isUnpaid: boolean;
  paidDays?: number | null;
  unpaidDays?: number | null;
  noticeViolation: boolean;
  createdAt: string;
  employee: {
    id: string;
    fullName: string;
    employeeId: string;
    department?: string;
    designation?: string;
    userId: string;
    user: { email: string };
    leavePolicy?: {
      id: string;
      name: string;
      daysAllowed: number;
      approvalRequired: boolean;
      noticeRequired: boolean;
    } | null;
  };
}

interface PastLeave {
  id: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  totalDays: number;
  status: string;
  isHalfDay: boolean;
}

interface Suggestion {
  type: string;
  severity: "info" | "warning" | "error";
  message: string;
  suggestedPaidDays?: number;
  suggestedUnpaidDays?: number;
}

interface BalanceInfo {
  remainingDays: number;
  totalDays: number;
  usedDays: number;
}

interface Context {
  thisMonthLeaves: PastLeave[];
  lastMonthLeaves: PastLeave[];
  thisMonthTotal: number;
  thisMonthApproved: number;
  lastMonthTotal: number;
  monthlyLimit: number | null;
  monthlyLimitEnabled: boolean;
  balance: BalanceInfo | null;
  suggestions: Suggestion[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayName(dateStr: string) {
  const d = new Date(dateStr);
  return DAY_NAMES[d.getDay()];
}
function monthLabel(dateStr: string) {
  const d = new Date(dateStr);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

type SV = "success" | "warning" | "destructive" | "gray" | "default";
const svClass: Record<SV, string> = {
  success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  destructive: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  gray: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  default: "bg-primary/10 text-primary",
};

function StatusBadge({ status }: { status: string }) {
  const v = leaveStatusVariant(status as any) as SV;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", svClass[v])}>
      {status}
    </span>
  );
}

function SuggestionCard({ s }: { s: Suggestion }) {
  const configs = {
    info:    { bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",    text: "text-blue-700 dark:text-blue-400",    icon: <Info size={15} /> },
    warning: { bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-400",  icon: <AlertTriangle size={15} /> },
    error:   { bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",         text: "text-red-600 dark:text-red-400",      icon: <AlertCircle size={15} /> },
  };
  const c = configs[s.severity];
  return (
    <div className={cn("flex items-start gap-3 p-3.5 rounded-xl border", c.bg)}>
      <span className={cn("mt-0.5 shrink-0", c.text)}>{c.icon}</span>
      <p className={cn("text-sm leading-relaxed", c.text)}>{s.message}</p>
    </div>
  );
}

// ── Past leaves mini-list ─────────────────────────────────────────────────────
function PastLeaveRow({ l }: { l: PastLeave }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex flex-col items-center w-10 shrink-0">
        <span className="text-[10px] text-slate-400 font-medium uppercase">{dayName(l.fromDate)}</span>
        <span className="text-sm font-bold text-slate-900 dark:text-white">
          {new Date(l.fromDate).getDate()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
            {LEAVE_TYPE_LABELS[l.leaveType] ?? l.leaveType}
          </span>
          {l.fromDate !== l.toDate && (
            <span className="text-xs text-slate-400">
              → {new Date(l.toDate).getDate()} {MONTH_NAMES[new Date(l.toDate).getMonth()]}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">
          {l.totalDays} day{l.totalDays !== 1 ? "s" : ""}
          {l.isHalfDay ? " (half)" : ""}
        </span>
      </div>
      <StatusBadge status={l.status} />
    </div>
  );
}

// ── Balance bar ───────────────────────────────────────────────────────────────
function BalanceBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all", pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LeaveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<{ leave: LeaveDetail; context: Context } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Paid/unpaid split inputs
  const [paidDays, setPaidDays]     = useState<number>(0);
  const [unpaidDays, setUnpaidDays] = useState<number>(0);
  const [rejectComment, setRejectComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/leaves/${id}`);
      setData(res.data);
      const leave = res.data.leave as LeaveDetail;
      // Default split: all paid
      setPaidDays(leave.totalDays);
      setUnpaidDays(0);

      // If suggestions say partial, pre-fill
      const partialSuggestion = (res.data.context.suggestions as Suggestion[]).find(
        (s) => s.suggestedPaidDays !== undefined
      );
      if (partialSuggestion) {
        setPaidDays(partialSuggestion.suggestedPaidDays ?? leave.totalDays);
        setUnpaidDays(partialSuggestion.suggestedUnpaidDays ?? 0);
      }
    } catch {
      toast.error("Failed to load leave details");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Keep paid/unpaid clamped to totalDays
  const totalDays = data?.leave.totalDays ?? 0;

  const handlePaidChange = (val: number) => {
    const clamped = Math.min(Math.max(0, val), totalDays);
    setPaidDays(clamped);
    setUnpaidDays(+(totalDays - clamped).toFixed(1));
  };
  const handleUnpaidChange = (val: number) => {
    const clamped = Math.min(Math.max(0, val), totalDays);
    setUnpaidDays(clamped);
    setPaidDays(+(totalDays - clamped).toFixed(1));
  };

  const handleApprove = async () => {
    if (!data) return;
    setActionLoading(true);
    try {
      const res = await api.patch(`/admin/leaves/${id}/approve`, {
        paidDays,
        unpaidDays,
      });
      toast.success(res.data.message || "Leave approved");
      router.push("/admin/leave-requests/leave");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to approve leave");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectComment.trim()) { toast.error("Rejection reason is required"); return; }
    setActionLoading(true);
    try {
      await api.patch(`/admin/leaves/${id}/reject`, { comment: rejectComment });
      toast.success("Leave rejected");
      router.push("/admin/leave-requests/leave");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to reject leave");
    } finally {
      setActionLoading(false);
    }
  };

  const handleOverride = async () => {
    setActionLoading(true);
    try {
      await api.patch(`/admin/leaves/${id}/override-absent`);
      toast.success("Absence overridden to Approved");
      router.push("/admin/leave-requests/leave");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to override");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <WeaveSpinner className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-slate-400">
        <CalendarDays size={40} className="mx-auto mb-3 opacity-30" />
        <p className="font-medium">Leave not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  const { leave, context } = data;
  const now = new Date();
  const thisMonthName = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  const lastMonthName = `${MONTH_NAMES[now.getMonth() === 0 ? 11 : now.getMonth() - 1]} ${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}`;

  const isPending = leave.status === "PENDING";
  const isAbsent  = leave.status === "ABSENT";

  const splitValid = Math.abs(paidDays + unpaidDays - totalDays) < 0.01;

  const limitUsedAfter = context.thisMonthApproved + (isPending ? paidDays : 0);
  const limitPct = context.monthlyLimit ? Math.min(100, (limitUsedAfter / context.monthlyLimit) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-12">
      {/* ── Breadcrumb ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.push("/admin/leave-requests/leave")}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition-colors"
        >
          <ArrowLeft size={15} />
          Leave Requests
        </button>
        <span className="text-slate-300 dark:text-slate-700">/</span>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {leave.employee.fullName} · {leave.employee.employeeId}
        </span>
        <StatusBadge status={leave.status} />
      </div>

      {/* ── Two-column layout ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
        {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Employee & leave info */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            {/* Employee header */}
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <User size={20} className="text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{leave.employee.fullName}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {leave.employee.employeeId}
                  {leave.employee.department && ` · ${leave.employee.department}`}
                  {leave.employee.designation && ` · ${leave.employee.designation}`}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{leave.employee.user.email}</p>
              </div>
            </div>

            <div className="h-px bg-slate-100 dark:bg-slate-800" />

            {/* Leave details grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Leave Type</p>
                <p className="text-sm font-medium text-slate-800 dark:text-white">
                  {LEAVE_TYPE_LABELS[leave.leaveType] ?? leave.leaveType}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Period</p>
                <p className="text-sm font-medium text-slate-800 dark:text-white">
                  {formatDate(leave.fromDate)}
                  {leave.fromDate !== leave.toDate && (
                    <span className="text-slate-400"> → {formatDate(leave.toDate)}</span>
                  )}
                </p>
                {leave.isHalfDay && (
                  <p className="text-xs text-slate-400">
                    {leave.halfDaySlot === "FIRST_HALF" ? "First half" : "Second half"}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Duration</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">
                  {leave.totalDays} day{leave.totalDays !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Reason</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{leave.reason}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Applied On</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {formatDate(leave.createdAt)} ({dayName(leave.createdAt)})
                </p>
              </div>
              {leave.adminComment && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Admin Comment</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2">
                    {leave.adminComment}
                  </p>
                </div>
              )}
              {/* Paid/unpaid breakdown if already resolved */}
              {!isPending && leave.paidDays !== null && leave.paidDays !== undefined && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Leave Breakdown</p>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1.5 rounded-lg">
                      <CreditCard size={13} />
                      {leave.paidDays}d Paid
                    </span>
                    {(leave.unpaidDays ?? 0) > 0 && (
                      <span className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-lg">
                        <Banknote size={13} />
                        {leave.unpaidDays}d Unpaid
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Past leaves — this month ──────────────────────────────── */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CalendarDays size={14} className="text-primary" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {thisMonthName} — Leaves
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                {context.thisMonthTotal}d total
              </span>
            </div>

            {context.thisMonthLeaves.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No other leaves this month</p>
            ) : (
              <div>
                {context.thisMonthLeaves.map((l) => <PastLeaveRow key={l.id} l={l} />)}
              </div>
            )}

            {/* Current leave highlighted */}
            {isPending && (
              <div className="mt-2 flex items-center gap-3 py-2.5 rounded-lg bg-primary/5 px-3">
                <div className="flex flex-col items-center w-10 shrink-0">
                  <span className="text-[10px] text-primary font-medium uppercase">{dayName(leave.fromDate)}</span>
                  <span className="text-sm font-bold text-primary">{new Date(leave.fromDate).getDate()}</span>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-primary">{LEAVE_TYPE_LABELS[leave.leaveType] ?? leave.leaveType}</p>
                  <p className="text-xs text-primary/70">{leave.totalDays}d · <em>This request</em></p>
                </div>
                <span className="text-xs font-semibold text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">PENDING</span>
              </div>
            )}
          </div>

          {/* ── Past leaves — last month ──────────────────────────────── */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CalendarDays size={14} className="text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {lastMonthName} — Leaves
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                {context.lastMonthTotal}d total
              </span>
            </div>
            {context.lastMonthLeaves.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No leaves last month</p>
            ) : (
              <div>
                {context.lastMonthLeaves.map((l) => <PastLeaveRow key={l.id} l={l} />)}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN ─────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Balance card */}
          {context.balance && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Home size={14} className="text-teal-500" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Annual Leave Balance</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {context.balance.remainingDays}
                      <span className="text-sm font-normal text-slate-400 ml-1">/ {context.balance.totalDays}d</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{context.balance.usedDays}d used this year</p>
                  </div>
                  <span className={cn(
                    "text-xs font-semibold px-2 py-1 rounded-lg",
                    context.balance.remainingDays <= 0 ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
                    context.balance.remainingDays < leave.totalDays ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" :
                    "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                  )}>
                    {context.balance.remainingDays <= 0 ? "No balance" :
                     context.balance.remainingDays < leave.totalDays ? "Short" : "Sufficient"}
                  </span>
                </div>
                <BalanceBar used={context.balance.usedDays} total={context.balance.totalDays} />
              </div>
            </div>
          )}

          {/* Monthly hard limit */}
          {context.monthlyLimitEnabled && context.monthlyLimit && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-blue-500" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Monthly Limit</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {limitUsedAfter.toFixed(1)}
                      <span className="text-sm font-normal text-slate-400 ml-1">/ {context.monthlyLimit}d</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {context.thisMonthApproved}d already approved this month
                    </p>
                  </div>
                  <span className={cn(
                    "text-xs font-semibold px-2 py-1 rounded-lg",
                    limitPct > 100 ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
                    limitPct >= 80  ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" :
                    "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                  )}>
                    {limitPct > 100 ? "Over limit" : `${Math.round(limitPct)}%`}
                  </span>
                </div>
                <BalanceBar used={limitUsedAfter} total={context.monthlyLimit} />
              </div>
            </div>
          )}

          {/* Smart suggestions */}
          {context.suggestions.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <BadgeCheck size={14} className="text-primary" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Admin Insights</h3>
              </div>
              {context.suggestions.map((s, i) => <SuggestionCard key={i} s={s} />)}
            </div>
          )}

          {/* ── Decision panel (PENDING) ──────────────────────────────── */}
          {isPending && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Decision</h3>
              </div>

              {/* Paid / Unpaid split */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Paid / Unpaid Split
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
                      Paid Days
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handlePaidChange(+(paidDays - 0.5).toFixed(1))}
                        className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >−</button>
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={totalDays}
                        value={paidDays}
                        onChange={(e) => handlePaidChange(Number(e.target.value))}
                        className="flex-1 h-8 text-center text-sm font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <button
                        onClick={() => handlePaidChange(+(paidDays + 0.5).toFixed(1))}
                        className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >+</button>
                    </div>
                    <p className="text-[10px] text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                      <CreditCard size={9} /> Deducted from balance
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
                      Unpaid Days
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleUnpaidChange(+(unpaidDays - 0.5).toFixed(1))}
                        className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >−</button>
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={totalDays}
                        value={unpaidDays}
                        onChange={(e) => handleUnpaidChange(Number(e.target.value))}
                        className="flex-1 h-8 text-center text-sm font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <button
                        onClick={() => handleUnpaidChange(+(unpaidDays + 0.5).toFixed(1))}
                        className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >+</button>
                    </div>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <Banknote size={9} /> No balance deduction
                    </p>
                  </div>
                </div>
                {/* Total summary */}
                <div className={cn(
                  "flex items-center justify-between text-xs px-3 py-2 rounded-lg",
                  splitValid ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                )}>
                  <span>{paidDays}d paid + {unpaidDays}d unpaid</span>
                  <span className="font-semibold">
                    {splitValid ? `= ${totalDays}d ✓` : `≠ ${totalDays}d ✗`}
                  </span>
                </div>
              </div>

              {/* Approve button */}
              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 space-y-2.5">
                <p className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-1.5">
                  <CheckCircle2 size={14} />
                  Approve Leave
                </p>
                {unpaidDays > 0 && (
                  <p className="text-xs text-green-600 dark:text-green-500">
                    {paidDays}d will be deducted from balance. {unpaidDays}d marked as unpaid.
                  </p>
                )}
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white border-0"
                  onClick={handleApprove}
                  disabled={actionLoading || !splitValid}
                >
                  {actionLoading ? (
                    <WeaveSpinner className="animate-spin mr-2" size={14} />
                  ) : (
                    <CheckCircle2 size={14} className="mr-2" />
                  )}
                  {unpaidDays > 0
                    ? `Approve (${paidDays}d paid + ${unpaidDays}d unpaid)`
                    : `Approve (${totalDays}d paid)`}
                </Button>
              </div>

              {/* Reject */}
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 space-y-2.5">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <XCircle size={14} />
                  Reject Leave
                </p>
                <textarea
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  rows={2}
                  placeholder="Rejection reason (required)…"
                  className="w-full px-3 py-2 rounded-xl border border-red-200 dark:border-red-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500/30"
                />
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={handleReject}
                  disabled={actionLoading || !rejectComment.trim()}
                >
                  {actionLoading ? <WeaveSpinner className="animate-spin mr-2" size={14} /> : <XCircle size={14} className="mr-2" />}
                  Reject
                </Button>
              </div>
            </div>
          )}

          {/* Override for ABSENT */}
          {isAbsent && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 space-y-3">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <ShieldAlert size={14} />
                  Override Absence
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-500 leading-relaxed">
                  This leave was auto-marked as absent. Override to Approved if the absence was justified.
                </p>
                <Button
                  variant="outline"
                  className="w-full border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                  onClick={handleOverride}
                  disabled={actionLoading}
                >
                  {actionLoading ? <WeaveSpinner className="animate-spin mr-2" size={14} /> : <ShieldAlert size={14} className="mr-2" />}
                  Override to Approved
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
