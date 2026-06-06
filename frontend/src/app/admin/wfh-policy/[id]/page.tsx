"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Trash2, Plus, X, Pencil, Check,
  Users, ShieldCheck, AlertTriangle, UserPlus, Search, Save, Home,
} from "lucide-react";
import api from "@/lib/api";
import type { WfhPolicy, WfhPolicyRule } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";

// ── Types ─────────────────────────────────────────────────────────────────────
type EmployeeOption = {
  id: string; fullName: string; employeeId: string;
  wfhPolicyId: string | null; wfhPolicyName: string | null;
};

// ── Schemas ───────────────────────────────────────────────────────────────────
const basicSchema = z.object({
  name:             z.string().min(2, "At least 2 characters"),
  daysAllowed:      z.string().min(1, "Required"),
  probationRule:    z.enum(["NONE", "NO_LEAVES", "UNPAID_ALLOWED"]),
  approvalRequired: z.boolean(),
  halfDayAllowed:   z.boolean(),
  noticeRequired:   z.boolean(),
  minNoticeDays:    z.string().optional(),
});
type BasicFormValues = z.infer<typeof basicSchema>;

const ruleSchema = z.object({
  operator:         z.enum(["GTE", "GT", "LTE", "LT", "EQ"]),
  minDays:          z.string().min(1, "Required"),
  approvalRequired: z.boolean(),
  noticeRequired:   z.boolean(),
  minNoticeDays:    z.string().optional(),
});
type RuleFormValues = z.infer<typeof ruleSchema>;

const exSchema = z.object({
  employeeId:   z.string().min(1, "Select an employee"),
  overrideDays: z.string().min(1, "Required"),
  blackoutFrom: z.string().min(1, "Required"),
  blackoutTo:   z.string().min(1, "Required"),
});
type ExFormValues = z.infer<typeof exSchema>;

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <div onClick={() => onChange(!checked)} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors select-none">
      <div className="min-w-0 pr-4">
        <p className="text-sm font-medium text-slate-800 dark:text-white">{label}</p>
        {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
      </div>
      <div className={cn("relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-slate-200 dark:bg-slate-700")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200", checked ? "translate-x-5" : "translate-x-0.5")} />
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description, action }: {
  icon: React.ElementType; title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon size={15} className="text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          {description && <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

const OPERATOR_LABELS: Record<string, string> = { GTE: "At least ≥", GT: "More than >", LTE: "At most ≤", LT: "Less than <", EQ: "Exactly =" };
const OPERATOR_SYMBOLS: Record<string, string> = { GTE: "≥", GT: ">", LTE: "≤", LT: "<", EQ: "=" };

// ── Rule form (inline) ────────────────────────────────────────────────────────
function RuleForm({ defaultValues, onSave, onCancel, saving, mode }: {
  defaultValues: Partial<RuleFormValues>;
  onSave: (data: RuleFormValues) => void;
  onCancel: () => void;
  saving: boolean;
  mode: "create" | "edit";
}) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { operator: "GTE", approvalRequired: true, noticeRequired: false, minNoticeDays: "0", ...defaultValues },
  });
  const watchNotice   = watch("noticeRequired");
  const watchApproval = watch("approvalRequired");

  return (
    <form onSubmit={handleSubmit(onSave)} className="rounded-xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 space-y-4">
      <p className="text-xs font-semibold text-primary uppercase tracking-wide">{mode === "create" ? "New Rule" : "Edit Rule"}</p>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Condition — if WFH request is…</label>
        <div className="grid grid-cols-2 gap-3 items-start">
          <Select {...register("operator")}>
            {Object.entries(OPERATOR_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <div className="flex items-center gap-2">
            <Input type="number" step="0.5" min="0.5" placeholder="e.g. 3" error={errors.minDays?.message} {...register("minDays")} />
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 shrink-0">days</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[
          { key: "approvalRequired" as const, label: "Approval Required", val: watchApproval },
          { key: "noticeRequired"   as const, label: "Notice Required",   val: watchNotice  },
        ].map(({ key, label, val }) => (
          <div key={key} onClick={() => setValue(key, !val)}
            className={cn("flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer select-none transition-colors text-sm",
              val ? "border-primary/40 bg-primary/5 text-primary" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300"
            )}>
            <div className={cn("h-4 w-4 rounded border-2 flex items-center justify-center shrink-0", val ? "border-primary bg-primary" : "border-slate-300")}>
              {val && <Check size={10} className="text-white" strokeWidth={3} />}
            </div>
            {label}
          </div>
        ))}
      </div>

      {watchNotice && (
        <Input label="Minimum Notice Days" type="number" min="1" placeholder="e.g. 2" error={errors.minNoticeDays?.message} {...register("minNoticeDays")} />
      )}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
          {saving && <WeaveSpinner size={12} className="animate-spin" />}
          {mode === "create" ? "Add Rule" : "Save Rule"}
        </Button>
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EditWfhPolicyPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [policy, setPolicy]     = useState<WfhPolicy | null>(null);
  const [loading, setLoading]   = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [basicSaving, setBasicSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showAddRule, setShowAddRule] = useState(false);
  const [editingRule, setEditingRule] = useState<WfhPolicyRule | null>(null);
  const [ruleSaving, setRuleSaving]   = useState(false);

  const [empSearch, setEmpSearch]         = useState("");
  const [assigning, setAssigning]         = useState(false);
  const [unassignId, setUnassignId]       = useState<string | null>(null);

  const [showAddEx, setShowAddEx] = useState(false);
  const [exSaving, setExSaving]   = useState(false);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<BasicFormValues>({
    resolver: zodResolver(basicSchema),
    defaultValues: { probationRule: "NO_LEAVES", approvalRequired: true, halfDayAllowed: true, noticeRequired: false },
  });
  const watchNotice   = watch("noticeRequired");
  const watchApproval = watch("approvalRequired");
  const watchHalfDay  = watch("halfDayAllowed");

  const { register: regEx, handleSubmit: handleExSubmit, reset: resetEx, formState: { errors: exErrors } } =
    useForm<ExFormValues>({ resolver: zodResolver(exSchema) });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [policiesRes, empsRes] = await Promise.all([
        api.get("/admin/policies/wfh"),
        api.get("/admin/employees?limit=200"),
      ]);
      const allPolicies: WfhPolicy[] = Array.isArray(policiesRes.data) ? policiesRes.data : [];
      const found: WfhPolicy | undefined = allPolicies.find((p: WfhPolicy) => p.id === id);
      if (!found) { toast.error("Policy not found"); router.push("/admin/wfh-policy"); return; }
      setPolicy(found);
      reset({
        name:             found.name,
        daysAllowed:      String(found.daysAllowed),
        probationRule:    found.probationRule as any,
        approvalRequired: found.approvalRequired,
        halfDayAllowed:   found.halfDayAllowed,
        noticeRequired:   found.noticeRequired,
        minNoticeDays:    String(found.minNoticeDays),
      });
      setEmployees(empsRes.data.data.map((e: any) => ({
        id: e.id, fullName: e.fullName, employeeId: e.employeeId,
        wfhPolicyId: e.wfhPolicyId ?? null, wfhPolicyName: e.wfhPolicy?.name ?? null,
      })));
    } catch {
      toast.error("Failed to load policy");
    } finally {
      setLoading(false);
    }
  }, [id, router, reset]);

  useEffect(() => { load(); }, [load]);

  const onBasicSave = async (data: BasicFormValues) => {
    setBasicSaving(true);
    try {
      await api.patch(`/admin/policies/wfh/${id}`, {
        ...data,
        daysAllowed:   parseInt(data.daysAllowed, 10),
        minNoticeDays: data.minNoticeDays ? parseInt(data.minNoticeDays, 10) : 0,
      });
      toast.success("Policy settings saved");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save settings");
    } finally {
      setBasicSaving(false);
    }
  };

  const handleDelete = async () => {
    if ((policy?.employees?.length ?? 0) > 0) {
      toast.error(`Cannot delete — ${policy!.employees!.length} employee(s) still assigned.`);
      setDeleteDialog(false);
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/admin/policies/wfh/${id}`);
      toast.success("WFH policy deleted");
      router.push("/admin/wfh-policy");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete policy");
    } finally {
      setDeleting(false);
      setDeleteDialog(false);
    }
  };

  const onRuleSave = async (data: RuleFormValues, ruleId?: string) => {
    setRuleSaving(true);
    try {
      const payload = {
        operator: data.operator,
        minDays: parseFloat(data.minDays),
        approvalRequired: data.approvalRequired,
        noticeRequired: data.noticeRequired,
        minNoticeDays: data.minNoticeDays ? parseInt(data.minNoticeDays, 10) : 0,
      };
      if (ruleId) {
        await api.patch(`/admin/policies/wfh/rules/${ruleId}`, payload);
        toast.success("Rule updated");
      } else {
        await api.post(`/admin/policies/wfh/${id}/rules`, payload);
        toast.success("Rule added");
      }
      setShowAddRule(false);
      setEditingRule(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save rule");
    } finally {
      setRuleSaving(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Delete this rule?")) return;
    try {
      await api.delete(`/admin/policies/wfh/rules/${ruleId}`);
      toast.success("Rule deleted");
      load();
    } catch { toast.error("Failed to delete rule"); }
  };

  const assignedIds = new Set(policy?.employees?.map((e) => e.id) ?? []);
  const filteredEmps = employees.filter((e) => {
    if (assignedIds.has(e.id)) return false;
    const q = empSearch.toLowerCase();
    return !q || e.fullName.toLowerCase().includes(q) || e.employeeId.toLowerCase().includes(q);
  });

  const handleAssign = async (empId: string) => {
    setAssigning(true);
    try {
      await api.patch(`/admin/employees/${empId}`, { wfhPolicyId: id });
      toast.success("Employee assigned");
      setEmpSearch("");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to assign");
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (empId: string) => {
    setUnassignId(empId);
    try {
      await api.patch(`/admin/employees/${empId}`, { wfhPolicyId: null });
      toast.success("Employee unassigned");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to unassign");
    } finally {
      setUnassignId(null);
    }
  };

  const onExSave = async (data: ExFormValues) => {
    setExSaving(true);
    try {
      await api.post(`/admin/policies/wfh/${id}/exceptions`, {
        ...data, overrideDays: parseFloat(data.overrideDays),
      });
      toast.success("Exception added");
      setShowAddEx(false);
      resetEx();
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add exception");
    } finally {
      setExSaving(false);
    }
  };

  const handleDeleteEx = async (exId: string) => {
    if (!confirm("Remove this exception?")) return;
    try {
      await api.delete(`/admin/policies/wfh/exceptions/${exId}`);
      toast.success("Exception removed");
      load();
    } catch { toast.error("Failed to remove exception"); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><WeaveSpinner size={28} /></div>;
  if (!policy) return null;

  const empCount  = policy.employees?.length ?? 0;
  const ruleCount = policy.rules?.length ?? 0;
  const exCount   = policy.exceptions?.length ?? 0;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">{policy.name}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {empCount} employee{empCount !== 1 ? "s" : ""} · {ruleCount} rule{ruleCount !== 1 ? "s" : ""} · {exCount} exception{exCount !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setDeleteDialog(true)}
          className="text-red-500 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 gap-1.5 shrink-0">
          <Trash2 size={13} /> Delete Policy
        </Button>
      </div>

      {/* Basic + Behavior */}
      <form onSubmit={handleSubmit(onBasicSave)}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Basic Settings</h2>
            <Input label="Policy Name *" placeholder="e.g. Standard WFH Policy" error={errors.name?.message} {...register("name")} />
            <Input label="Days / Year *" type="number" min="0" step="1" error={errors.daysAllowed?.message} {...register("daysAllowed")} />
            <Select label="Probation Rule" {...register("probationRule")}>
              <option value="NONE">No restriction during probation</option>
              <option value="NO_LEAVES">No WFH allowed during probation</option>
              <option value="UNPAID_ALLOWED">Allow as unpaid (no balance deduction)</option>
            </Select>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Behavior</h2>
            <Toggle label="Approval Required" description="Admin must approve all WFH requests" checked={watchApproval} onChange={(v) => setValue("approvalRequired", v)} />
            <Toggle label="Half Day Allowed" description="Employees can apply for half-day WFH" checked={watchHalfDay} onChange={(v) => setValue("halfDayAllowed", v)} />
            <Toggle label="Advance Notice Required" description="Must submit requests ahead of time" checked={watchNotice} onChange={(v) => setValue("noticeRequired", v)} />
            {watchNotice && (
              <div className="pl-2">
                <Input label="Minimum Notice Days" type="number" min="1" placeholder="e.g. 2" error={errors.minNoticeDays?.message} {...register("minNoticeDays")} />
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <Button type="submit" disabled={basicSaving} className="gap-2 min-w-[150px]">
            {basicSaving ? <WeaveSpinner size={14} className="animate-spin" /> : <Save size={14} />}
            {basicSaving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </form>

      {/* Conditional Rules */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        <SectionHeader
          icon={ShieldCheck}
          title="Conditional Rules"
          description="Enforce approval or notice requirements based on WFH duration"
          action={!showAddRule && (
            <Button size="sm" variant="outline" onClick={() => { setShowAddRule(true); setEditingRule(null); }} className="gap-1.5">
              <Plus size={13} /> Add Rule
            </Button>
          )}
        />

        {ruleCount > 0 && (
          <div className="space-y-2 mb-4">
            {policy.rules?.map((rule) =>
              editingRule?.id === rule.id ? (
                <RuleForm key={rule.id} mode="edit"
                  defaultValues={{ operator: rule.operator as any, minDays: String(rule.minDays), approvalRequired: rule.approvalRequired, noticeRequired: rule.noticeRequired, minNoticeDays: String(rule.minNoticeDays) }}
                  onSave={(data) => onRuleSave(data, rule.id)}
                  onCancel={() => setEditingRule(null)}
                  saving={ruleSaving}
                />
              ) : (
                <div key={rule.id} className="flex items-start justify-between bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-100 dark:border-slate-800 px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      If WFH is <span className="text-primary font-semibold">{OPERATOR_SYMBOLS[rule.operator]} {rule.minDays} day{rule.minDays !== 1 ? "s" : ""}</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className={rule.approvalRequired ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}>{rule.approvalRequired ? "✓" : "✗"} Approval</span>
                      {rule.noticeRequired && <span className="text-amber-600 dark:text-amber-400">⚠ {rule.minNoticeDays}d notice</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { setEditingRule(rule); setShowAddRule(false); }} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => handleDeleteRule(rule.id)} className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><X size={13} /></button>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {ruleCount === 0 && !showAddRule && (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">No rules yet.</p>
        )}

        {showAddRule && (
          <RuleForm mode="create" defaultValues={{}} onSave={(data) => onRuleSave(data)} onCancel={() => setShowAddRule(false)} saving={ruleSaving} />
        )}
      </div>

      {/* Employees + Exceptions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Assigned Employees */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <SectionHeader icon={Users} title="Assigned Employees" description={`${empCount} employee${empCount !== 1 ? "s" : ""} on this policy`} />

          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="Search to filter list…"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>

          {filteredEmps.length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">Available to assign</p>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-40 overflow-y-auto">
                {filteredEmps.map((e) => (
                  <button key={e.id} type="button" onClick={() => handleAssign(e.id)} disabled={assigning}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0 group">
                    <div className="text-left">
                      <span className="font-medium text-slate-900 dark:text-white block">{e.fullName}</span>
                      <span className="text-xs text-slate-400">{e.employeeId}</span>
                    </div>
                    <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0 ml-2">
                      <UserPlus size={12} /> Assign
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredEmps.length === 0 && empSearch && (
            <p className="text-xs text-slate-400 mb-3 text-center">No unassigned employees match your search.</p>
          )}

          {empCount === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-2">No employees assigned yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {policy.employees?.map((emp) => (
                <div key={emp.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{emp.fullName}</p>
                    <p className="text-xs text-slate-400">{emp.employeeId}</p>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                    disabled={unassignId === emp.id} onClick={() => handleUnassign(emp.id)}>
                    {unassignId === emp.id ? <WeaveSpinner size={11} className="animate-spin" /> : "Unassign"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Exceptions */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <SectionHeader icon={AlertTriangle} title="Per-Employee Exceptions"
            description="Override allowance or set blocked dates for specific employees"
            action={!showAddEx && (
              <Button size="sm" variant="outline" onClick={() => { setShowAddEx(true); resetEx(); }} className="gap-1.5">
                <Plus size={13} /> Add
              </Button>
            )}
          />

          {showAddEx && (
            <form onSubmit={handleExSubmit(onExSave)} className="rounded-xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 space-y-3 mb-4">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">New Exception</p>
              <Select label="Employee *" error={exErrors.employeeId?.message} {...regEx("employeeId")}>
                <option value="">Select employee…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeId})</option>)}
              </Select>
              <Input label="Override Days *" type="number" step="0.5" min="0" placeholder="e.g. 15" error={exErrors.overrideDays?.message} {...regEx("overrideDays")} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Blocked From *" type="date" error={exErrors.blackoutFrom?.message} {...regEx("blackoutFrom")} />
                <Input label="Blocked To *"   type="date" error={exErrors.blackoutTo?.message}   {...regEx("blackoutTo")} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">The employee cannot request WFH between those dates.</p>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => { setShowAddEx(false); resetEx(); }}>Cancel</Button>
                <Button type="submit" size="sm" disabled={exSaving} className="gap-1.5">
                  {exSaving && <WeaveSpinner size={12} className="animate-spin" />} Add Exception
                </Button>
              </div>
            </form>
          )}

          {exCount === 0 && !showAddEx ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">No exceptions set.</p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {policy.exceptions?.map((ex) => (
                <div key={ex.id} className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{ex.employee.fullName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Override: <strong>{ex.overrideDays}d</strong>
                      <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                      Blocked: {new Date(ex.blackoutFrom).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} –{" "}
                      {new Date(ex.blackoutTo).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <button onClick={() => handleDeleteEx(ex.id)} className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400"><Trash2 size={18} /> Delete WFH Policy</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong className="text-slate-900 dark:text-white">{policy.name}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {empCount > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{empCount} employee{empCount !== 1 ? "s are" : " is"} still assigned. Unassign them first.</span>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialog(false)} className="flex-1">Cancel</Button>
            <Button onClick={handleDelete} disabled={deleting || empCount > 0} className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0 gap-1.5">
              {deleting && <WeaveSpinner size={13} className="animate-spin" />}
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
