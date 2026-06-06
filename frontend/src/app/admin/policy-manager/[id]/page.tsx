"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Trash2,
  Plus,
  X,
  Pencil,
  Check,
  Users,
  ShieldCheck,
  AlertTriangle,
  UserPlus,
  Search,
  Save,
} from "lucide-react";
import api from "@/lib/api";
import type { LeavePolicy, PolicyRule } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
type EmployeeOption = {
  id: string;
  fullName: string;
  employeeId: string;
  leavePolicyId: string | null;
  leavePolicyName: string | null;
};

// ── Schemas ───────────────────────────────────────────────────────────────────
const basicSchema = z.object({
  name:             z.string().min(2, "At least 2 characters"),
  daysAllowed:      z.string().min(1, "Required"),
  probationRule:    z.enum(["NONE", "NO_LEAVES", "UNPAID_ALLOWED"]),
  approvalRequired: z.boolean(),
  halfDayAllowed:   z.boolean(),
  carryForward:     z.boolean(),
  noticeRequired:   z.boolean(),
  minNoticeDays:    z.string().optional(),
});
type BasicFormValues = z.infer<typeof basicSchema>;

const ruleSchema = z.object({
  operator:             z.enum(["GTE", "GT", "LTE", "LT", "EQ"]),
  minDays:              z.string().min(1, "Required"),
  approvalRequired:     z.boolean(),
  noticeRequired:       z.boolean(),
  minNoticeDays:        z.string().optional(),
  applicableLeaveTypes: z.array(z.string()),
});
type RuleFormValues = z.infer<typeof ruleSchema>;

const LEAVE_TYPE_OPTIONS = [
  { value: "SICK",              label: "Sick Leave",           color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "TRANSPORT_WEATHER", label: "Transport / Weather",  color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { value: "PERSONAL",          label: "Personal Leave",       color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
] as const;

const exSchema = z.object({
  employeeId:        z.string().min(1, "Select an employee"),
  overrideDays:      z.string().min(1, "Required"),
  blackoutFrom:      z.string().min(1, "Required"),
  blackoutTo:        z.string().min(1, "Required"),
  allowedLeaveTypes: z.array(z.string()).min(1, "Select at least one leave type"),
});
type ExFormValues = z.infer<typeof exSchema>;

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors select-none"
    >
      <div className="min-w-0 pr-4">
        <p className="text-sm font-medium text-slate-800 dark:text-white">{label}</p>
        {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
      </div>
      <div className={cn(
        "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
      )}>
        <span className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0.5"
        )} />
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, description, action }: {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
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

const OPERATOR_LABELS: Record<string, string> = {
  GTE: "at least",
  GT:  "more than",
  LTE: "up to",
  LT:  "less than",
  EQ:  "exactly",
};

const OPERATOR_OPTIONS = [
  { value: "LTE", label: "Up to",      symbol: "≤" },
  { value: "GTE", label: "At least",   symbol: "≥" },
  { value: "EQ",  label: "Exactly",    symbol: "=" },
  { value: "LT",  label: "Less than",  symbol: "<" },
  { value: "GT",  label: "More than",  symbol: ">" },
] as const;

// ── Rule form (inline) ────────────────────────────────────────────────────────
function RuleForm({
  defaultValues,
  onSave,
  onCancel,
  saving,
  mode,
}: {
  defaultValues: Partial<RuleFormValues>;
  onSave: (data: RuleFormValues) => void;
  onCancel: () => void;
  saving: boolean;
  mode: "create" | "edit";
}) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      operator: "GTE",
      approvalRequired: true,
      noticeRequired: false,
      minNoticeDays: "0",
      applicableLeaveTypes: [],
      ...defaultValues,
    },
  });
  const watchNotice   = watch("noticeRequired");
  const watchApproval = watch("approvalRequired");
  const operator      = watch("operator");

  return (
    <form onSubmit={handleSubmit(onSave)}
      className="rounded-2xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-5 space-y-5">

      <p className="text-xs font-semibold text-primary uppercase tracking-widest">
        {mode === "create" ? "New Rule" : "Edit Rule"}
      </p>

      {/* Step 1: Duration condition */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          When the leave request is…
        </p>

        {/* Operator pill selector */}
        <div className="flex flex-wrap gap-2">
          {OPERATOR_OPTIONS.map((op) => (
            <button
              key={op.value}
              type="button"
              onClick={() => setValue("operator", op.value as any)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                operator === op.value
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 hover:border-primary/50 hover:text-primary"
              )}
            >
              {op.label} <span className="opacity-60 ml-0.5">{op.symbol}</span>
            </button>
          ))}
        </div>

        {/* Days input */}
        <div className="flex items-center gap-2">
          <div className="w-28">
            <Input
              type="number"
              step="0.5"
              min="0.5"
              placeholder="e.g. 3"
              error={errors.minDays?.message}
              {...register("minDays")}
            />
          </div>
          <span className="text-sm text-slate-500 dark:text-slate-400">days</span>
        </div>
      </div>

      <div className="border-t border-primary/10" />

      {/* Step 2: Leave type exception (optional) */}
      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Exception — limit to specific leave types
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Select leave types this rule applies to. Leave empty to apply to all types.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {LEAVE_TYPE_OPTIONS.map((lt) => {
            const selected = (watch("applicableLeaveTypes") ?? []).includes(lt.value);
            return (
              <button
                key={lt.value}
                type="button"
                onClick={() => {
                  const current = watch("applicableLeaveTypes") ?? [];
                  setValue(
                    "applicableLeaveTypes",
                    selected ? current.filter((v) => v !== lt.value) : [...current, lt.value]
                  );
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                  selected
                    ? `${lt.color} border-current`
                    : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 hover:border-slate-300"
                )}
              >
                <div className={cn(
                  "h-3 w-3 rounded-full border-2 flex items-center justify-center shrink-0",
                  selected ? "border-current bg-current" : "border-slate-300 dark:border-slate-600"
                )}>
                  {selected && <Check size={8} className="text-white" strokeWidth={3} />}
                </div>
                {lt.label}
              </button>
            );
          })}
        </div>
        {(watch("applicableLeaveTypes") ?? []).length > 0 && (
          <p className="text-xs text-primary/80 bg-primary/5 rounded-lg px-3 py-2">
            This rule will <strong>only</strong> trigger for the selected leave type(s) above.
          </p>
        )}
      </div>

      <div className="border-t border-primary/10" />

      {/* Step 3: Requirements */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Then require…
        </p>

        <Toggle
          label="Admin approval"
          description="The request must be reviewed and approved by an admin"
          checked={watchApproval}
          onChange={(v) => setValue("approvalRequired", v)}
        />

        <Toggle
          label="Advance notice"
          description="Employee must submit the request ahead of time"
          checked={watchNotice}
          onChange={(v) => setValue("noticeRequired", v)}
        />

        {watchNotice && (
          <div className="flex items-center gap-2 pl-2 pt-1">
            <div className="w-24">
              <Input
                type="number"
                min="1"
                placeholder="3"
                error={errors.minNoticeDays?.message}
                {...register("minNoticeDays")}
              />
            </div>
            <span className="text-sm text-slate-500 dark:text-slate-400">days in advance</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving} className="gap-1.5 min-w-[90px]">
          {saving && <WeaveSpinner size={12} className="animate-spin" />}
          {mode === "create" ? "Add Rule" : "Save Rule"}
        </Button>
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EditPolicyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [policy, setPolicy]     = useState<LeavePolicy | null>(null);
  const [loading, setLoading]   = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [basicSaving, setBasicSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Rules state
  const [showAddRule, setShowAddRule]   = useState(false);
  const [editingRule, setEditingRule]   = useState<PolicyRule | null>(null);
  const [ruleSaving, setRuleSaving]     = useState(false);

  // Employees state
  const [empSearch, setEmpSearch]         = useState("");
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [assigning, setAssigning]         = useState(false);
  const [unassignId, setUnassignId]       = useState<string | null>(null);

  // Exceptions state
  const [showAddEx, setShowAddEx] = useState(false);
  const [exSaving, setExSaving]   = useState(false);

  // Basic settings form
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<BasicFormValues>({
    resolver: zodResolver(basicSchema),
    defaultValues: {
      probationRule: "NO_LEAVES",
      approvalRequired: true, halfDayAllowed: true,
      carryForward: false, noticeRequired: false,
    },
  });
  const watchNotice   = watch("noticeRequired");
  const watchApproval = watch("approvalRequired");
  const watchHalfDay  = watch("halfDayAllowed");
  const watchCarry    = watch("carryForward");

  // Exception form
  const {
    register: regEx, handleSubmit: handleExSubmit, reset: resetEx,
    watch: watchEx, setValue: setExValue,
    formState: { errors: exErrors },
  } = useForm<ExFormValues>({
    resolver: zodResolver(exSchema),
    defaultValues: { allowedLeaveTypes: [] },
  });
  const watchedLeaveTypes = watchEx("allowedLeaveTypes") ?? [];

  // ── Load data ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [policiesRes, empsRes] = await Promise.all([
        api.get("/admin/policies/leave"),
        api.get("/admin/employees?limit=200"),
      ]);
      const found: LeavePolicy = policiesRes.data.find((p: LeavePolicy) => p.id === id);
      if (!found) { toast.error("Policy not found"); router.push("/admin/policy-manager"); return; }
      setPolicy(found);
      reset({
        name:             found.name,
        daysAllowed:      String(found.daysAllowed),
        probationRule:    found.probationRule as any,
        approvalRequired: found.approvalRequired,
        halfDayAllowed:   found.halfDayAllowed,
        carryForward:     found.carryForward,
        noticeRequired:   found.noticeRequired,
        minNoticeDays:    String(found.minNoticeDays),
      });
      setEmployees(empsRes.data.data.map((e: any) => ({
        id: e.id,
        fullName: e.fullName,
        employeeId: e.employeeId,
        leavePolicyId: e.leavePolicyId ?? null,
        leavePolicyName: e.leavePolicy?.name ?? null,
      })));
    } catch {
      toast.error("Failed to load policy");
    } finally {
      setLoading(false);
    }
  }, [id, router, reset]);

  useEffect(() => { load(); }, [load]);

  // ── Basic settings save ────────────────────────────────────────────────────
  const onBasicSave = async (data: BasicFormValues) => {
    setBasicSaving(true);
    try {
      await api.patch(`/admin/policies/leave/${id}`, {
        ...data,
        daysAllowed:   parseFloat(data.daysAllowed),
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

  // ── Delete policy ──────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if ((policy?.employees?.length ?? 0) > 0) {
      toast.error(`Cannot delete — ${policy!.employees!.length} employee(s) still assigned.`);
      setDeleteDialog(false);
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/admin/policies/leave/${id}`);
      toast.success("Policy deleted");
      router.push("/admin/policy-manager");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete policy");
    } finally {
      setDeleting(false);
      setDeleteDialog(false);
    }
  };

  // ── Rules ──────────────────────────────────────────────────────────────────
  const onRuleSave = async (data: RuleFormValues, ruleId?: string) => {
    setRuleSaving(true);
    try {
      const payload = {
        operator: data.operator,
        minDays: parseFloat(data.minDays),
        approvalRequired: data.approvalRequired,
        noticeRequired: data.noticeRequired,
        minNoticeDays: data.minNoticeDays ? parseInt(data.minNoticeDays, 10) : 0,
        applicableLeaveTypes: data.applicableLeaveTypes ?? [],
      };
      if (ruleId) {
        await api.patch(`/admin/policies/leave/rules/${ruleId}`, payload);
        toast.success("Rule updated");
      } else {
        await api.post(`/admin/policies/leave/${id}/rules`, payload);
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
      await api.delete(`/admin/policies/leave/rules/${ruleId}`);
      toast.success("Rule deleted");
      load();
    } catch {
      toast.error("Failed to delete rule");
    }
  };

  // ── Employee assign/unassign ───────────────────────────────────────────────
  const assignedIds = new Set(policy?.employees?.map((e) => e.id) ?? []);
  const filteredEmps = employees.filter((e) => {
    if (assignedIds.has(e.id)) return false;
    const q = empSearch.toLowerCase();
    return !q || e.fullName.toLowerCase().includes(q) || e.employeeId.toLowerCase().includes(q);
  });

  const handleAssign = async (empId: string) => {
    setAssigning(true);
    try {
      await api.patch(`/admin/employees/${empId}`, { leavePolicyId: id });
      toast.success("Employee assigned");
      setSelectedEmpId("");
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
      await api.patch(`/admin/employees/${empId}`, { leavePolicyId: null });
      toast.success("Employee unassigned");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to unassign");
    } finally {
      setUnassignId(null);
    }
  };

  // ── Exceptions ─────────────────────────────────────────────────────────────
  const onExSave = async (data: ExFormValues) => {
    setExSaving(true);
    try {
      await api.post(`/admin/policies/leave/${id}/exceptions`, {
        ...data,
        overrideDays: parseFloat(data.overrideDays),
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
      await api.delete(`/admin/policies/leave/exceptions/${exId}`);
      toast.success("Exception removed");
      load();
    } catch {
      toast.error("Failed to remove exception");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <WeaveSpinner size={28} />
      </div>
    );
  }

  if (!policy) return null;

  const empCount  = policy.employees?.length ?? 0;
  const ruleCount = policy.rules?.length ?? 0;
  const exCount   = policy.exceptions?.length ?? 0;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">{policy.name}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {empCount} employee{empCount !== 1 ? "s" : ""} · {ruleCount} rule{ruleCount !== 1 ? "s" : ""} · {exCount} exception{exCount !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeleteDialog(true)}
          className="text-red-500 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 gap-1.5 shrink-0"
        >
          <Trash2 size={13} />
          Delete Policy
        </Button>
      </div>

      {/* ── Settings: basic + behavior side by side ──────────────────────── */}
      <form onSubmit={handleSubmit(onBasicSave)}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Basic settings */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Basic Settings</h2>
            <Input
              label="Policy Name *"
              placeholder="e.g. Annual Leave Policy"
              error={errors.name?.message}
              {...register("name")}
            />
            <Input
              label="Days / Year *"
              type="number"
              step="0.5"
              min="0"
              error={errors.daysAllowed?.message}
              {...register("daysAllowed")}
            />
            <Select label="Probation Rule" {...register("probationRule")}>
              <option value="NONE">No restriction during probation</option>
              <option value="NO_LEAVES">No leaves allowed during probation</option>
              <option value="UNPAID_ALLOWED">Allow as unpaid (no balance deduction)</option>
            </Select>
          </div>

          {/* Behavior */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Behavior</h2>
            <Toggle label="Approval Required" description="Admin must approve all requests" checked={watchApproval} onChange={(v) => setValue("approvalRequired", v)} />
            <Toggle label="Half Day Allowed" description="Employees can apply for half days" checked={watchHalfDay} onChange={(v) => setValue("halfDayAllowed", v)} />
            <Toggle label="Carry Forward" description="Unused days roll over to next year" checked={watchCarry} onChange={(v) => setValue("carryForward", v)} />
            <Toggle label="Advance Notice Required" description="Must submit requests ahead of time" checked={watchNotice} onChange={(v) => setValue("noticeRequired", v)} />
            {watchNotice && (
              <div className="pl-2">
                <Input
                  label="Minimum Notice Days"
                  type="number"
                  min="1"
                  placeholder="e.g. 3"
                  error={errors.minNoticeDays?.message}
                  {...register("minNoticeDays")}
                />
              </div>
            )}
          </div>
        </div>

        {/* Save settings button */}
        <div className="flex justify-end mt-4">
          <Button type="submit" disabled={basicSaving} className="gap-2 min-w-[150px]">
            {basicSaving ? <WeaveSpinner size={14} className="animate-spin" /> : <Save size={14} />}
            {basicSaving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </form>

      {/* ── Conditional Rules ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        <SectionHeader
          icon={ShieldCheck}
          title="Rules"
          description="Set approval or notice requirements based on how many days are requested"
          action={
            !showAddRule && (
              <Button size="sm" variant="outline" onClick={() => { setShowAddRule(true); setEditingRule(null); }} className="gap-1.5">
                <Plus size={13} />
                Add Rule
              </Button>
            )
          }
        />

        {/* Existing rules */}
        {ruleCount > 0 && (
          <div className="space-y-2 mb-4">
            {policy.rules?.map((rule) => (
              editingRule?.id === rule.id ? (
                <RuleForm
                  key={rule.id}
                  mode="edit"
                  defaultValues={{
                    operator: rule.operator as any,
                    minDays: String(rule.minDays),
                    approvalRequired: rule.approvalRequired,
                    noticeRequired: rule.noticeRequired,
                    minNoticeDays: String(rule.minNoticeDays),
                    applicableLeaveTypes: (rule as any).applicableLeaveTypes ?? [],
                  }}
                  onSave={(data) => onRuleSave(data, rule.id)}
                  onCancel={() => setEditingRule(null)}
                  saving={ruleSaving}
                />
              ) : (
                <div key={rule.id} className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 px-4 py-3 gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Leave type badges (exception indicator) */}
                    {((rule as any).applicableLeaveTypes?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {((rule as any).applicableLeaveTypes as string[]).map((t) => {
                          const opt = LEAVE_TYPE_OPTIONS.find((o) => o.value === t);
                          return opt ? (
                            <span key={t} className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", opt.color)}>
                              {opt.label}
                            </span>
                          ) : null;
                        })}
                        <span className="inline-flex items-center text-[10px] text-slate-400 dark:text-slate-500 italic">
                          only
                        </span>
                      </div>
                    )}
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      If leave is{" "}
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {OPERATOR_LABELS[rule.operator]} {rule.minDays} day{rule.minDays !== 1 ? "s" : ""}
                      </span>
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className={cn(
                        "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                        rule.approvalRequired
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                      )}>
                        <Check size={10} strokeWidth={3} />
                        {rule.approvalRequired ? "Approval required" : "No approval needed"}
                      </span>
                      {rule.noticeRequired ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                          ⏰ {rule.minNoticeDays} day{rule.minNoticeDays !== 1 ? "s" : ""} notice
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs text-slate-400 dark:text-slate-500">
                          No notice required
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setEditingRule(rule); setShowAddRule(false); }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}

        {ruleCount === 0 && !showAddRule && (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">
            No rules yet. Add one to control approval or notice based on leave duration.
          </p>
        )}

        {/* Add rule inline form */}
        {showAddRule && (
          <RuleForm
            mode="create"
            defaultValues={{}}
            onSave={(data) => onRuleSave(data)}
            onCancel={() => setShowAddRule(false)}
            saving={ruleSaving}
          />
        )}
      </div>

      {/* ── Employees + Exceptions side by side ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Assigned Employees */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <SectionHeader
            icon={Users}
            title="Assigned Employees"
            description={`${empCount} employee${empCount !== 1 ? "s" : ""} on this policy`}
          />

          {/* Search filter */}
          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={empSearch}
              onChange={(e) => { setEmpSearch(e.target.value); setSelectedEmpId(""); }}
              placeholder="Search to filter list…"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Unassigned employees — always visible, filtered by search */}
          {filteredEmps.length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
                Available to assign
              </p>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-40 overflow-y-auto">
                {filteredEmps.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => handleAssign(e.id)}
                    disabled={assigning}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0 group"
                  >
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

          {/* Assigned list */}
          {empCount === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-2">
              No employees assigned yet.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {policy.employees?.map((emp) => (
                <div key={emp.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{emp.fullName}</p>
                    <p className="text-xs text-slate-400">{emp.employeeId}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                    disabled={unassignId === emp.id}
                    onClick={() => handleUnassign(emp.id)}
                  >
                    {unassignId === emp.id ? <WeaveSpinner size={11} className="animate-spin" /> : "Unassign"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Exceptions */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <SectionHeader
            icon={AlertTriangle}
            title="Per-Employee Exceptions"
            description="Override allowance or set blocked dates for specific employees"
            action={
              !showAddEx && (
                <Button size="sm" variant="outline" onClick={() => { setShowAddEx(true); resetEx(); }} className="gap-1.5">
                  <Plus size={13} />
                  Add
                </Button>
              )
            }
          />

          {/* Add exception inline form */}
          {showAddEx && (
            <form onSubmit={handleExSubmit(onExSave)} className="rounded-xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 space-y-3 mb-4">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">New Exception</p>

              <Select
                label="Employee *"
                error={exErrors.employeeId?.message}
                {...regEx("employeeId")}
              >
                <option value="">Select employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName} ({e.employeeId})</option>
                ))}
              </Select>

              <Input
                label="Override Days *"
                type="number"
                step="0.5"
                min="0"
                placeholder="e.g. 8"
                error={exErrors.overrideDays?.message}
                {...regEx("overrideDays")}
              />

              {/* Leave type selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Allowed Leave Types *
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Select which leave types this employee is allowed to use during the blocked period.
                </p>
                <div className="flex flex-wrap gap-2">
                  {LEAVE_TYPE_OPTIONS.map((lt) => {
                    const selected = watchedLeaveTypes.includes(lt.value);
                    return (
                      <button
                        key={lt.value}
                        type="button"
                        onClick={() => {
                          const current = watchedLeaveTypes;
                          setExValue(
                            "allowedLeaveTypes",
                            selected
                              ? current.filter((v) => v !== lt.value)
                              : [...current, lt.value]
                          );
                        }}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                          selected
                            ? `${lt.color} border-current`
                            : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300"
                        )}
                      >
                        <div className={cn("h-3.5 w-3.5 rounded border-2 flex items-center justify-center shrink-0", selected ? "border-current bg-current" : "border-slate-300")}>
                          {selected && <Check size={9} className="text-white" strokeWidth={3} />}
                        </div>
                        {lt.label}
                      </button>
                    );
                  })}
                </div>
                {exErrors.allowedLeaveTypes && (
                  <p className="text-xs text-red-500 mt-1">{exErrors.allowedLeaveTypes.message as string}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Blocked From *" type="date" error={exErrors.blackoutFrom?.message} {...regEx("blackoutFrom")} />
                <Input label="Blocked To *" type="date" error={exErrors.blackoutTo?.message} {...regEx("blackoutTo")} />
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                During the blocked period, only the selected leave types above are permitted.
              </p>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => { setShowAddEx(false); resetEx(); }}>Cancel</Button>
                <Button type="submit" size="sm" disabled={exSaving} className="gap-1.5">
                  {exSaving && <WeaveSpinner size={12} className="animate-spin" />}
                  Add Exception
                </Button>
              </div>
            </form>
          )}

          {/* Exceptions list */}
          {exCount === 0 && !showAddEx ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">
              No exceptions set.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {policy.exceptions?.map((ex) => {
                const types: string[] = (ex as any).allowedLeaveTypes ?? [];
                return (
                  <div key={ex.id} className="px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {ex.employee.fullName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Override: <strong>{ex.overrideDays}d</strong>
                          <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                          Blocked: {new Date(ex.blackoutFrom).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} –{" "}
                          {new Date(ex.blackoutTo).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteEx(ex.id)}
                        className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    {/* Allowed leave type badges */}
                    {types.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {types.map((t) => {
                          const opt = LEAVE_TYPE_OPTIONS.find((o) => o.value === t);
                          return opt ? (
                            <span key={t} className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", opt.color)}>
                              {opt.label}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Delete confirmation ────────────────────────────────────────────── */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <Trash2 size={18} />
              Delete Policy
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong className="text-slate-900 dark:text-white">{policy.name}</strong>?
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {empCount > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                {empCount} employee{empCount !== 1 ? "s are" : " is"} still assigned to this policy.
                Unassign them first before deleting.
              </span>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialog(false)} className="flex-1">Cancel</Button>
            <Button
              onClick={handleDelete}
              disabled={deleting || empCount > 0}
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
