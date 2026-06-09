"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CalendarDays,
  User,
  Building2,
  Briefcase,
  FileText,
  RotateCcw,
  Calendar,
} from "lucide-react";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

interface SwapDayDetail {
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
    user?: { email: string };
  };
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SwapDayStatus, { label: string; icon: React.ElementType; cls: string; iconCls: string }> = {
  PENDING_COMPENSATION: {
    label: "Pending Compensation",
    icon: Clock,
    cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
    iconCls: "text-blue-500",
  },
  COMPENSATED: {
    label: "Compensated",
    icon: CheckCircle2,
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
    iconCls: "text-emerald-500",
  },
  DEFAULTED: {
    label: "Defaulted",
    icon: AlertTriangle,
    cls: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    iconCls: "text-slate-400",
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SwapDayDetailPage() {
  const params   = useParams();
  const router   = useRouter();
  const id       = params.id as string;

  const [swap,        setSwap]        = useState<SwapDayDetail | null>(null);
  const [loading,     setLoading]     = useState(true);

  const [compensating,  setCompensating]  = useState(false);
  const [defaulting,    setDefaulting]    = useState(false);
  const [settingComp,   setSettingComp]   = useState(false);
  const [compDate,      setCompDate]      = useState("");
  const [showCompModal, setShowCompModal] = useState(false);
  const [showDefModal,  setShowDefModal]  = useState(false);
  const [defNote,       setDefNote]       = useState("");

  const fetchSwap = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/swap-days/${id}`);
      setSwap(res.data);
    } catch (e: any) {
      if (e?.response?.status === 404) {
        toast.error("Swap day not found");
        router.replace("/admin/swap-days");
      } else {
        toast.error("Failed to load swap day");
      }
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchSwap(); }, [fetchSwap]);

  const handleMarkCompensated = async () => {
    setCompensating(true);
    try {
      await api.patch(`/admin/swap-days/${id}/compensated`);
      toast.success("Marked as compensated");
      fetchSwap();
      setShowCompModal(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to mark compensated");
    } finally { setCompensating(false); }
  };

  const handleMarkDefaulted = async () => {
    setDefaulting(true);
    try {
      await api.patch(`/admin/swap-days/${id}/defaulted`, { note: defNote.trim() || null });
      toast.success("Marked as defaulted");
      fetchSwap();
      setShowDefModal(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to mark defaulted");
    } finally { setDefaulting(false); }
  };

  const handleSetCompDate = async () => {
    if (!compDate) return;
    setSettingComp(true);
    try {
      await api.patch(`/admin/swap-days/${id}/set-compensation`, { compensationDate: compDate });
      toast.success("Compensation date set");
      fetchSwap();
      setCompDate("");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to set compensation date");
    } finally { setSettingComp(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <WeaveSpinner size={28} />
      </div>
    );
  }

  if (!swap) return null;

  const cfg = STATUS_CONFIG[swap.status];
  const StatusIcon = cfg.icon;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Back */}
      <button
        onClick={() => router.push("/admin/swap-days")}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
      >
        <ArrowLeft size={15} />
        Back to Swap Days
      </button>

      {/* Header card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <CalendarDays size={22} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Swap Day Record</h1>
              {(swap.isOverdue || swap.isDueSoon) && (
                <span className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded-full border",
                  swap.isOverdue
                    ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                    : "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                )}>
                  {swap.isOverdue ? "Overdue" : "Due Soon"}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">ID: {swap.id}</p>
          </div>

          {/* Status badge */}
          <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-semibold shrink-0", cfg.cls)}>
            <StatusIcon size={14} className={cfg.iconCls} />
            {cfg.label}
          </div>
        </div>
      </div>

      {/* Employee info */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Employee</p>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <User size={15} className="text-slate-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{swap.employee.fullName}</p>
              <p className="text-xs text-slate-500">{swap.employee.employeeId}</p>
            </div>
          </div>
          {swap.employee.department && (
            <div className="flex items-center gap-3">
              <Building2 size={15} className="text-slate-400 shrink-0" />
              <p className="text-sm text-slate-700 dark:text-slate-300">{swap.employee.department}</p>
            </div>
          )}
          {swap.employee.designation && (
            <div className="flex items-center gap-3">
              <Briefcase size={15} className="text-slate-400 shrink-0" />
              <p className="text-sm text-slate-700 dark:text-slate-300">{swap.employee.designation}</p>
            </div>
          )}
          {swap.employee.user?.email && (
            <p className="text-xs text-slate-500 ml-6">{swap.employee.user.email}</p>
          )}
        </div>
      </div>

      {/* Dates */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Dates</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-slate-500">Absent (Swap Day)</span>
            </div>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {formatDate(swap.absentDate)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shrink-0" />
              <span className="text-slate-500">Compensation Day</span>
            </div>
            {swap.compensationDate ? (
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {formatDate(swap.compensationDate)}
              </span>
            ) : (
              <span className="text-sm text-slate-400 italic">Not set</span>
            )}
          </div>

          {swap.deadline && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", swap.isOverdue ? "bg-red-400" : "bg-slate-300")} />
                <span className="text-slate-500">Deadline</span>
              </div>
              <span className={cn("text-sm font-semibold", swap.isOverdue ? "text-red-500" : "text-slate-900 dark:text-white")}>
                {formatDate(swap.deadline)}
              </span>
            </div>
          )}

          {swap.resolvedAt && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-slate-500">Resolved on</span>
              </div>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {formatDate(swap.resolvedAt)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0" />
              <span className="text-slate-500">Created on</span>
            </div>
            <span className="text-sm text-slate-500">
              {formatDate(swap.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Note */}
      {swap.note && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={14} className="text-slate-400" />
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Note</p>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300">{swap.note}</p>
        </div>
      )}

      {/* Set compensation date (only if PENDING and no comp date set) */}
      {swap.status === "PENDING_COMPENSATION" && !swap.compensationDate && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Set Compensation Date</p>
          <div className="flex gap-2">
            <input
              type="date"
              value={compDate}
              onChange={(e) => setCompDate(e.target.value)}
              className="flex-1 border rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <Button onClick={handleSetCompDate} disabled={!compDate || settingComp} size="sm">
              {settingComp ? <WeaveSpinner size={12} className="animate-spin mr-1.5" /> : <Calendar size={13} className="mr-1.5" />}
              Set Date
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      {swap.status === "PENDING_COMPENSATION" && (
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => setShowCompModal(true)}
            className="flex-1 gap-2"
          >
            <CheckCircle2 size={15} />
            Mark as Compensated
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowDefModal(true)}
            className="flex-1 gap-2 text-slate-600 border-slate-300 hover:bg-slate-50 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <AlertTriangle size={15} />
            Mark as Defaulted
          </Button>
        </div>
      )}

      {/* Confirm compensated dialog */}
      <Dialog open={showCompModal} onOpenChange={setShowCompModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Compensated?</DialogTitle>
            <DialogDescription>
              This will mark the swap day as fully compensated. The employee worked on{" "}
              {swap.compensationDate ? formatDate(swap.compensationDate) : "the designated compensation day"}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompModal(false)} disabled={compensating}>Cancel</Button>
            <Button onClick={handleMarkCompensated} disabled={compensating} className="gap-1.5">
              {compensating ? <WeaveSpinner size={12} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark defaulted dialog */}
      <Dialog open={showDefModal} onOpenChange={setShowDefModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Defaulted?</DialogTitle>
            <DialogDescription>
              The employee did not compensate for the swap day absent on {formatDate(swap.absentDate)}.
            </DialogDescription>
          </DialogHeader>
          <div className="px-1">
            <textarea
              value={defNote}
              onChange={(e) => setDefNote(e.target.value)}
              placeholder="Reason / note (optional)"
              rows={3}
              className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDefModal(false)} disabled={defaulting}>Cancel</Button>
            <Button
              onClick={handleMarkDefaulted}
              disabled={defaulting}
              variant="outline"
              className="gap-1.5 text-slate-600 border-slate-300"
            >
              {defaulting ? <WeaveSpinner size={12} className="animate-spin" /> : <RotateCcw size={13} />}
              Mark Defaulted
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
