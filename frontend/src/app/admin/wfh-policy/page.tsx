"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Home,
  Users,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Trash2,
} from "lucide-react";
import api from "@/lib/api";
import type { WfhPolicy } from "@/types";
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

const PROBATION_SHORT: Record<string, string> = {
  NONE:           "No restriction",
  NO_LEAVES:      "No WFH during probation",
  UNPAID_ALLOWED: "Unpaid allowed",
};

function Chip({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
      on
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
        : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 line-through"
    )}>
      {on ? "✓" : "–"} {label}
    </span>
  );
}

function WfhCard({ policy, onEdit, onDelete }: {
  policy: WfhPolicy;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const empCount  = policy.employees?.length ?? 0;
  const exCount   = policy.exceptions?.length ?? 0;
  const ruleCount = policy.rules?.length ?? 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow flex flex-col border-t-4 border-t-emerald-400">
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            WFH Policy
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete policy"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <h3 className="font-semibold text-slate-900 dark:text-white text-base mb-1 truncate">{policy.name}</h3>
        <div className="flex items-baseline gap-1.5 mb-4">
          <span className="text-3xl font-bold text-primary tabular-nums">{policy.daysAllowed}</span>
          <span className="text-sm text-slate-400">days / year</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Chip label="Approval" on={policy.approvalRequired} />
          <Chip label="Half Day" on={policy.halfDayAllowed} />
          <Chip label="Notice"   on={policy.noticeRequired} />
        </div>

        {policy.noticeRequired && policy.minNoticeDays > 0 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            ⚠ {policy.minNoticeDays} day{policy.minNoticeDays > 1 ? "s" : ""} advance notice
          </p>
        )}

        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Probation: <span className="text-slate-600 dark:text-slate-300">{PROBATION_SHORT[policy.probationRule]}</span>
        </p>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1"><Users size={12} />{empCount} employee{empCount !== 1 ? "s" : ""}</span>
        <span className="flex items-center gap-1"><ShieldCheck size={12} />{ruleCount} rule{ruleCount !== 1 ? "s" : ""}</span>
        {exCount > 0 && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertTriangle size={12} />{exCount} exception{exCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="px-5 pb-5">
        <Button onClick={onEdit} className="w-full gap-2 justify-center" size="sm">
          Manage Policy <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
}

export default function WfhPolicyPage() {
  const router = useRouter();
  const [policies, setPolicies]     = useState<WfhPolicy[]>([]);
  const [loading, setLoading]       = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<WfhPolicy | null>(null);
  const [deleting, setDeleting]     = useState(false);

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/policies/wfh");
      setPolicies(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error("Failed to load WFH policies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const empCount = deleteTarget.employees?.length ?? 0;
    if (empCount > 0) {
      toast.error(`Cannot delete — ${empCount} employee${empCount !== 1 ? "s" : ""} still assigned.`);
      setDeleteTarget(null);
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/admin/policies/wfh/${deleteTarget.id}`);
      toast.success("WFH policy deleted");
      setDeleteTarget(null);
      fetchPolicies();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete policy");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">WFH Policies</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {policies.length} polic{policies.length !== 1 ? "ies" : "y"} configured
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchPolicies} disabled={loading} className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => router.push("/admin/wfh-policy/new")} className="gap-1.5">
            <Plus size={15} /> New Policy
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><WeaveSpinner size={28} /></div>
      ) : policies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
          <Home size={40} className="mb-3 opacity-30" />
          <p className="font-medium text-slate-600 dark:text-slate-300">No WFH policies yet</p>
          <p className="text-sm mt-1">Create a work-from-home policy to assign to employees</p>
          <Button onClick={() => router.push("/admin/wfh-policy/new")} size="sm" className="mt-4 gap-1.5">
            <Plus size={14} /> Create Policy
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {policies.map((p) => (
            <WfhCard
              key={p.id}
              policy={p}
              onEdit={() => router.push(`/admin/wfh-policy/${p.id}`)}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <Trash2 size={17} /> Delete WFH Policy
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong className="text-slate-900 dark:text-white">{deleteTarget?.name}</strong>?
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {(deleteTarget?.employees?.length ?? 0) > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{deleteTarget!.employees!.length} employee{deleteTarget!.employees!.length !== 1 ? "s are" : " is"} still assigned. Unassign them first.</span>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting} className="flex-1">Cancel</Button>
            <Button
              onClick={handleDelete}
              disabled={deleting || (deleteTarget?.employees?.length ?? 0) > 0}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0 gap-1.5"
            >
              {deleting && <WeaveSpinner size={13} className="animate-spin" />}
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
