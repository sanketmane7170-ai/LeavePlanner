"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Users,
  AlertTriangle,
  FileText,
  PlusCircle,
  X,
  UserPlus,
  ShieldCheck,
  Home,
} from "lucide-react";
import api from "@/lib/api";
import type { WfhPolicy, WfhPolicyRule, WfhPolicyException, PolicyRuleOperator } from "@/types";
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
  wfhPolicyId: string | null;
  wfhPolicyName: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const PROBATION_LABELS: Record<string, string> = {
  NONE: "No restriction",
  NO_LEAVES: "No WFH allowed during probation",
  UNPAID_ALLOWED: "Unpaid WFH (Allowed)",
};

const OPERATOR_SYMBOLS: Record<string, string> = {
  GTE: "≥",
  GT:  ">",
  LTE: "≤",
  LT:  "<",
  EQ:  "=",
};

// ── Schemas ───────────────────────────────────────────────────────────────────
const policySchema = z.object({
  name: z.string().min(2, "At least 2 characters"),
  daysAllowed: z.string().min(1, "Required"),
  approvalRequired: z.boolean(),
  noticeRequired: z.boolean(),
  minNoticeDays: z.string().optional(),
  halfDayAllowed: z.boolean(),
  probationRule: z.enum(["NONE", "NO_LEAVES", "UNPAID_ALLOWED"]),
});
type PolicyFormValues = z.infer<typeof policySchema>;

const exceptionSchema = z.object({
  employeeId: z.string().min(1, "Select an employee"),
  overrideDays: z.string().min(1, "Required"),
  blackoutFrom: z.string().min(1, "Required"),
  blackoutTo: z.string().min(1, "Required"),
});
type ExceptionFormValues = z.infer<typeof exceptionSchema>;

const ruleSchema = z.object({
  operator: z.enum(["GTE", "GT", "LTE", "LT", "EQ"]),
  minDays: z.string().min(1, "Required"),
  approvalRequired: z.boolean(),
  noticeRequired: z.boolean(),
  minNoticeDays: z.string().optional(),
  exception: z.string().optional(),
});
type RuleFormValues = z.infer<typeof ruleSchema>;

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </p>
        {description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40",
          checked ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

// ── Setting row helper ────────────────────────────────────────────────────────
function SettingRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          "w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
          on
            ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            : "bg-slate-100 text-slate-400 dark:bg-slate-800"
        )}
      >
        {on ? "✓" : "–"}
      </span>
      <span
        className={cn(
          "text-xs",
          on
            ? "text-slate-700 dark:text-slate-300"
            : "text-slate-400 dark:text-slate-500"
        )}
      >
        {label}
      </span>
    </div>
  );
}

// ── WFH Policy Card ───────────────────────────────────────────────────────────
function WfhPolicyCard({
  policy,
  onEdit,
  onDelete,
  onAddException,
  onDeleteException,
  onAssignEmployee,
  onManageEmployees,
  onAddRule,
  onEditRule,
  onDeleteRule,
}: {
  policy: WfhPolicy;
  onEdit: () => void;
  onDelete: () => void;
  onAddException: () => void;
  onDeleteException: (id: string) => void;
  onAssignEmployee: () => void;
  onManageEmployees: () => void;
  onAddRule: () => void;
  onEditRule: (rule: WfhPolicyRule) => void;
  onDeleteRule: (id: string) => void;
}) {
  const [showEx, setShowEx] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const empCount = policy.employees?.length ?? 0;
  const exCount = policy.exceptions?.length ?? 0;
  const ruleCount = policy.rules?.length ?? 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            WFH Policy
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={onEdit}>
              <Pencil size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>

        <h3 className="font-heading font-semibold text-slate-900 dark:text-white text-lg">
          {policy.name}
        </h3>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-3xl font-bold text-primary font-heading">
            {policy.daysAllowed}
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            days / year
          </span>
        </div>
      </div>

      {/* Settings grid */}
      <div className="px-5 pb-4 grid grid-cols-2 gap-x-4 gap-y-1.5">
        <SettingRow label="Approval Required" on={policy.approvalRequired} />
        <SettingRow label="Half Day Allowed" on={policy.halfDayAllowed} />
        <SettingRow label="Notice Required" on={policy.noticeRequired} />
        {policy.noticeRequired && policy.minNoticeDays > 0 && (
          <div className="col-span-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            ⚠ {policy.minNoticeDays} day{policy.minNoticeDays > 1 ? "s" : ""}{" "}
            advance notice
          </div>
        )}
        <div className="col-span-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
          Probation:{" "}
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {PROBATION_LABELS[policy.probationRule]}
          </span>
        </div>
      </div>

      {/* Footer: employee count + actions */}
      <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 flex items-center justify-between gap-2">
        <button
          onClick={onManageEmployees}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors flex-wrap"
          title={empCount > 0 ? "Click to manage assigned employees" : undefined}
        >
          <Users size={14} />
          <span className={empCount > 0 ? "underline underline-offset-2 decoration-dashed" : ""}>
            {empCount} employee{empCount !== 1 ? "s" : ""}
          </span>
          {exCount > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
              {exCount} exception{exCount !== 1 ? "s" : ""}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={onAssignEmployee}
            className="text-xs h-7 px-2 text-primary hover:text-primary hover:bg-primary/10"
          >
            <UserPlus size={13} className="mr-1" /> Assign
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onAddException}
            className="text-xs h-7 px-2"
          >
            <PlusCircle size={13} className="mr-1" /> Exception
          </Button>
          {exCount > 0 && (
            <button
              onClick={() => setShowEx((v) => !v)}
              className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center gap-0.5"
            >
              {showEx ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showEx ? "Hide" : "View"}
            </button>
          )}
        </div>
      </div>

      {/* Conditional rules bar */}
      <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-2 flex items-center justify-between">
        <button
          onClick={() => setShowRules((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
        >
          <ShieldCheck size={13} />
          <span>
            {ruleCount > 0
              ? `${ruleCount} conditional rule${ruleCount !== 1 ? "s" : ""}`
              : "No conditional rules"}
          </span>
          {showRules ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddRule}
          className="text-xs h-6 px-2"
        >
          <Plus size={12} className="mr-1" /> Add Rule
        </Button>
      </div>

      {/* Rules expanded */}
      {showRules && (
        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Conditional Rules
          </p>
          {ruleCount === 0 ? (
            <p className="text-xs text-slate-400 text-center py-2">
              No rules set yet. Use rules to conditionally enforce approval or
              notice requirements based on WFH duration.
            </p>
          ) : (
            policy.rules?.map((rule) => (
              <div
                key={rule.id}
                className="flex items-start justify-between bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    If{" "}
                    <strong>
                      {OPERATOR_SYMBOLS[rule.operator] ?? "≥"} {rule.minDays} day{rule.minDays !== 1 ? "s" : ""}
                    </strong>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Approval: {rule.approvalRequired ? "✓ Yes" : "✗ No"}
                    {rule.noticeRequired && (
                      <> · Notice: {rule.minNoticeDays}d</>
                    )}
                  </p>
                  {rule.exception && (
                    <p className="text-xs text-slate-400 mt-0.5 italic truncate">
                      Exception: {rule.exception}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => onEditRule(rule)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => onDeleteRule(rule.id)}
                    className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Exceptions expanded */}
      {showEx && exCount > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Exceptions
          </p>
          {policy.exceptions?.map((ex) => (
            <div
              key={ex.id}
              className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {ex.employee.fullName}
                  <span className="text-xs text-slate-400 ml-1.5">
                    ({ex.employee.employeeId})
                  </span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Override: <strong>{ex.overrideDays} days</strong> · Blackout:{" "}
                  {new Date(ex.blackoutFrom).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                  })}{" "}
                  –{" "}
                  {new Date(ex.blackoutTo).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <button
                onClick={() => onDeleteException(ex.id)}
                className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WfhPolicyPage() {
  const [policies, setPolicies] = useState<WfhPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  // Policy modal
  const [policyModal, setPolicyModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    policy?: WfhPolicy;
  }>({ open: false, mode: "create" });
  const [policyLoading, setPolicyLoading] = useState(false);

  // Exception modal
  const [exModal, setExModal] = useState<{ open: boolean; policyId: string }>({
    open: false,
    policyId: "",
  });
  const [exLoading, setExLoading] = useState(false);

  // Assign employee modal
  const [assignModal, setAssignModal] = useState<{
    open: boolean;
    policy: WfhPolicy | null;
  }>({ open: false, policy: null });
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);

  // Override confirmation dialog
  const [overrideConfirm, setOverrideConfirm] = useState<{
    open: boolean;
    policy: WfhPolicy | null;
    employee: EmployeeOption | null;
  }>({ open: false, policy: null, employee: null });

  // Rule modal
  const [ruleModal, setRuleModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    policyId: string;
    rule?: WfhPolicyRule;
  }>({ open: false, mode: "create", policyId: "" });
  const [ruleLoading, setRuleLoading] = useState(false);

  // Manage assigned employees modal
  const [manageEmpModal, setManageEmpModal] = useState<{
    open: boolean;
    policy: WfhPolicy | null;
  }>({ open: false, policy: null });
  const [unassignLoading, setUnassignLoading] = useState<string | null>(null);

  // Password Confirmation Dialog
  const [passwordConfirm, setPasswordConfirm] = useState<{
    open: boolean;
    action: "edit" | "delete";
    policyId: string;
    payload?: any;
  }>({ open: false, action: "delete", policyId: "" });
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [confirmPasswordLoading, setConfirmPasswordLoading] = useState(false);

  // Forms
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PolicyFormValues>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      approvalRequired: true,
      noticeRequired: false,
      halfDayAllowed: true,
      probationRule: "NONE",
    },
  });

  const {
    register: regEx,
    handleSubmit: handleExSubmit,
    reset: resetEx,
    formState: { errors: exErrors },
  } = useForm<ExceptionFormValues>({ resolver: zodResolver(exceptionSchema) });

  const {
    register: regRule,
    handleSubmit: handleRuleSubmit,
    reset: resetRule,
    watch: watchRule,
    setValue: setRuleValue,
    formState: { errors: ruleErrors },
  } = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      operator: "GTE",
      approvalRequired: true,
      noticeRequired: false,
      minNoticeDays: "0",
    },
  });

  const watchNotice = watch("noticeRequired");
  const watchApproval = watch("approvalRequired");
  const watchHalfDay = watch("halfDayAllowed");
  const watchRuleNotice = watchRule("noticeRequired");
  const watchRuleApproval = watchRule("approvalRequired");

  const fetchEmployees = useCallback(async () => {
    try {
      const r = await api.get("/admin/employees?limit=200");
      setEmployees(
        r.data.data.map((e: any) => ({
          id: e.id,
          fullName: e.fullName,
          employeeId: e.employeeId,
          wfhPolicyId: e.wfhPolicyId ?? null,
          wfhPolicyName: e.wfhPolicy?.name ?? null,
        }))
      );
    } catch {
      // silent
    }
  }, []);

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/policies/wfh");
      setPolicies(res.data);
    } catch {
      toast.error("Failed to load WFH policies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
    fetchEmployees();
  }, [fetchPolicies, fetchEmployees]);

  // ── Policy CRUD ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    reset({
      name: "",
      daysAllowed: "",
      approvalRequired: true,
      noticeRequired: false,
      minNoticeDays: "0",
      halfDayAllowed: true,
      probationRule: "NONE",
    });
    setPolicyModal({ open: true, mode: "create" });
  };

  const openEdit = (p: WfhPolicy) => {
    reset({
      name: p.name,
      daysAllowed: String(p.daysAllowed),
      approvalRequired: p.approvalRequired,
      noticeRequired: p.noticeRequired,
      minNoticeDays: String(p.minNoticeDays),
      halfDayAllowed: p.halfDayAllowed,
      probationRule: p.probationRule as any,
    });
    setPolicyModal({ open: true, mode: "edit", policy: p });
  };

  const onPolicySubmit = async (data: PolicyFormValues) => {
    setPolicyLoading(true);
    try {
      const payload = {
        ...data,
        daysAllowed: parseInt(data.daysAllowed, 10),
        minNoticeDays: data.minNoticeDays ? parseInt(data.minNoticeDays, 10) : 0,
      };
      if (policyModal.mode === "create") {
        await api.post("/admin/policies/wfh", payload);
        toast.success("WFH policy created");
        setPolicyModal((s) => ({ ...s, open: false }));
        fetchPolicies();
      } else if (policyModal.policy) {
        setPasswordConfirm({
          open: true,
          action: "edit",
          policyId: policyModal.policy.id,
          payload,
        });
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save policy");
    } finally {
      setPolicyLoading(false);
    }
  };

  const handleDelete = async (p: WfhPolicy) => {
    if ((p.employees?.length ?? 0) > 0) {
      toast.error(`Cannot delete — ${p.employees!.length} employee(s) assigned.`);
      return;
    }
    setPasswordConfirm({
      open: true,
      action: "delete",
      policyId: p.id,
    });
  };

  const handleConfirmPasswordAction = async () => {
    if (!confirmPasswordInput) {
      toast.error("Password is required");
      return;
    }
    setConfirmPasswordLoading(true);
    try {
      if (passwordConfirm.action === "delete") {
        await api.delete(`/admin/policies/wfh/${passwordConfirm.policyId}`, {
          data: { confirmPassword: confirmPasswordInput },
        });
        toast.success("WFH policy deleted");
      } else if (passwordConfirm.action === "edit" && passwordConfirm.payload) {
        await api.patch(`/admin/policies/wfh/${passwordConfirm.policyId}`, {
          ...passwordConfirm.payload,
          confirmPassword: confirmPasswordInput,
        });
        toast.success("WFH policy updated");
        setPolicyModal((s) => ({ ...s, open: false }));
      }
      setPasswordConfirm({ open: false, action: "delete", policyId: "" });
      setConfirmPasswordInput("");
      fetchPolicies();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Password verification failed.");
    } finally {
      setConfirmPasswordLoading(false);
    }
  };

  // ── Exception CRUD ───────────────────────────────────────────────────────────
  const onExceptionSubmit = async (data: ExceptionFormValues) => {
    setExLoading(true);
    try {
      await api.post(`/admin/policies/wfh/${exModal.policyId}/exceptions`, {
        ...data,
        overrideDays: parseFloat(data.overrideDays),
      });
      toast.success("Exception added");
      setExModal({ open: false, policyId: "" });
      resetEx();
      fetchPolicies();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add exception");
    } finally {
      setExLoading(false);
    }
  };

  const handleDeleteException = async (exId: string) => {
    if (!confirm("Remove this exception?")) return;
    try {
      await api.delete(`/admin/policies/wfh/exceptions/${exId}`);
      toast.success("Exception removed");
      fetchPolicies();
    } catch {
      toast.error("Failed to remove exception");
    }
  };

  // ── Assign Employee ──────────────────────────────────────────────────────────
  const selectedEmployee =
    employees.find((e) => e.id === assignEmployeeId) ?? null;

  const handleAssignEmployee = async () => {
    if (!assignModal.policy || !assignEmployeeId) return;
    if (selectedEmployee?.wfhPolicyId) {
      setOverrideConfirm({
        open: true,
        policy: assignModal.policy,
        employee: selectedEmployee,
      });
      return;
    }
    await doAssign(assignModal.policy.id, assignEmployeeId);
  };

  const doAssign = async (policyId: string, employeeId: string) => {
    setAssignLoading(true);
    try {
      await api.patch(`/admin/employees/${employeeId}`, {
        wfhPolicyId: policyId,
      });
      toast.success("Policy assigned successfully");
      setAssignModal({ open: false, policy: null });
      setAssignEmployeeId("");
      setOverrideConfirm({ open: false, policy: null, employee: null });
      await Promise.all([fetchPolicies(), fetchEmployees()]);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to assign policy");
    } finally {
      setAssignLoading(false);
    }
  };

  // ── Rule CRUD ────────────────────────────────────────────────────────────────
  const openAddRule = (policyId: string) => {
    resetRule({
      operator: "GTE",
      minDays: "",
      approvalRequired: true,
      noticeRequired: false,
      minNoticeDays: "0",
      exception: "",
    });
    setRuleModal({ open: true, mode: "create", policyId });
  };

  const openEditRule = (policyId: string, rule: WfhPolicyRule) => {
    resetRule({
      operator: rule.operator,
      minDays: String(rule.minDays),
      approvalRequired: rule.approvalRequired,
      noticeRequired: rule.noticeRequired,
      minNoticeDays: String(rule.minNoticeDays),
      exception: rule.exception ?? "",
    });
    setRuleModal({ open: true, mode: "edit", policyId, rule });
  };

  const onRuleSubmit = async (data: RuleFormValues) => {
    setRuleLoading(true);
    try {
      const payload = {
        operator: data.operator,
        minDays: parseFloat(data.minDays),
        approvalRequired: data.approvalRequired,
        noticeRequired: data.noticeRequired,
        minNoticeDays: data.minNoticeDays ? parseInt(data.minNoticeDays, 10) : 0,
        exception: data.exception || null,
      };
      if (ruleModal.mode === "create") {
        await api.post(
          `/admin/policies/wfh/${ruleModal.policyId}/rules`,
          payload
        );
        toast.success("Rule added");
      } else if (ruleModal.rule) {
        await api.patch(
          `/admin/policies/wfh/rules/${ruleModal.rule.id}`,
          payload
        );
        toast.success("Rule updated");
      }
      setRuleModal((s) => ({ ...s, open: false }));
      fetchPolicies();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save rule");
    } finally {
      setRuleLoading(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Delete this rule?")) return;
    try {
      await api.delete(`/admin/policies/wfh/rules/${ruleId}`);
      toast.success("Rule deleted");
      fetchPolicies();
    } catch {
      toast.error("Failed to delete rule");
    }
  };

  // ── Unassign Employee ────────────────────────────────────────────────────────
  const handleUnassign = async (employeeId: string) => {
    setUnassignLoading(employeeId);
    try {
      await api.patch(`/admin/employees/${employeeId}`, { wfhPolicyId: null });
      toast.success("Employee unassigned from policy");
      setManageEmpModal((s) => s.policy
        ? { ...s, policy: { ...s.policy, employees: s.policy.employees?.filter((e) => e.id !== employeeId) } }
        : s
      );
      await Promise.all([fetchPolicies(), fetchEmployees()]);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to unassign");
    } finally {
      setUnassignLoading(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-heading font-bold text-slate-900 dark:text-white">
            WFH Policy Manager
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {policies.length} policy / policies configured
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus size={16} className="mr-1.5" /> New WFH Policy
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <WeaveSpinner className="animate-spin text-primary" size={28} />
        </div>
      ) : policies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
          <Home size={40} className="mb-3 opacity-40" />
          <p className="font-medium">No WFH policies yet</p>
          <p className="text-sm mt-1">
            Create a work-from-home policy to assign to employees
          </p>
          <Button onClick={openCreate} size="sm" className="mt-4">
            <Plus size={15} className="mr-1.5" /> Create Policy
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 animate-in fade-in duration-300">
          {policies.map((p) => (
            <WfhPolicyCard
              key={p.id}
              policy={p}
              onEdit={() => openEdit(p)}
              onDelete={() => handleDelete(p)}
              onAddException={() => setExModal({ open: true, policyId: p.id })}
              onDeleteException={handleDeleteException}
              onAssignEmployee={() => setAssignModal({ open: true, policy: p })}
              onManageEmployees={() => setManageEmpModal({ open: true, policy: p })}
              onAddRule={() => openAddRule(p.id)}
              onEditRule={(rule) => openEditRule(p.id, rule)}
              onDeleteRule={handleDeleteRule}
            />
          ))}
        </div>
      )}

      {/* ── Policy Create/Edit Dialog ────────────────────────────────────────── */}
      <Dialog
        open={policyModal.open}
        onOpenChange={(o) => !o && setPolicyModal((s) => ({ ...s, open: false }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {policyModal.mode === "create" ? "Create WFH Policy" : "Edit WFH Policy"}
            </DialogTitle>
            <DialogDescription>
              Configure work-from-home limits, notices, and probation settings.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onPolicySubmit)}>
            <div className="space-y-4 py-2">
              <Input
                label="Policy Name *"
                placeholder="e.g. Standard WFH"
                error={errors.name?.message}
                {...register("name")}
              />
              <Input
                label="Total Days / Year *"
                type="number"
                min="0"
                placeholder="e.g. 24"
                error={errors.daysAllowed?.message}
                {...register("daysAllowed")}
              />

              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-1">
                <Toggle
                  label="Approval Required"
                  description="WFH requests must be approved by admin"
                  checked={watchApproval}
                  onChange={(v) => setValue("approvalRequired", v)}
                />
                <Toggle
                  label="Half Day Allowed"
                  description="Employees can request first/second half slot"
                  checked={watchHalfDay}
                  onChange={(v) => setValue("halfDayAllowed", v)}
                />
                <Toggle
                  label="Notice Required"
                  description="Require advance notice before requesting WFH"
                  checked={watchNotice}
                  onChange={(v) => setValue("noticeRequired", v)}
                />
              </div>

              {watchNotice && (
                <Input
                  label="Minimum Notice Days *"
                  type="number"
                  min="0"
                  placeholder="e.g. 2"
                  error={errors.minNoticeDays?.message}
                  {...register("minNoticeDays")}
                />
              )}

              <Select
                label="Probation Restriction *"
                error={errors.probationRule?.message}
                {...register("probationRule")}
              >
                <option value="NONE">No restrictions (Allowed)</option>
                <option value="NO_LEAVES">No WFH allowed during probation</option>
                <option value="UNPAID_ALLOWED">Allowed</option>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPolicyModal((s) => ({ ...s, open: false }))}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={policyLoading}>
                {policyLoading && (
                  <WeaveSpinner className="animate-spin mr-2" size={15} />
                )}
                {policyModal.mode === "create" ? "Create Policy" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Exception Add Dialog ────────────────────────────────────────────── */}
      <Dialog
        open={exModal.open}
        onOpenChange={(o) => !o && setExModal({ open: false, policyId: "" })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Employee Exception</DialogTitle>
            <DialogDescription>
              Assign a custom day limit or blackout dates for a specific employee.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleExSubmit(onExceptionSubmit)}>
            <div className="space-y-4 py-2">
              <Select label="Select Employee *" error={exErrors.employeeId?.message} {...regEx("employeeId")}>
                <option value="">-- Choose an employee --</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName} ({e.employeeId})
                  </option>
                ))}
              </Select>

              <Input
                label="Override Allowed Days *"
                type="number"
                min="0"
                placeholder="e.g. 15"
                error={exErrors.overrideDays?.message}
                {...regEx("overrideDays")}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Blackout From *"
                  type="date"
                  error={exErrors.blackoutFrom?.message}
                  {...regEx("blackoutFrom")}
                />
                <Input
                  label="Blackout To *"
                  type="date"
                  error={exErrors.blackoutTo?.message}
                  {...regEx("blackoutTo")}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setExModal({ open: false, policyId: "" });
                  resetEx();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={exLoading}>
                {exLoading && (
                  <WeaveSpinner className="animate-spin mr-2" size={15} />
                )}
                Add Exception
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Assign Employee Dialog ──────────────────────────────────────────── */}
      <Dialog
        open={assignModal.open}
        onOpenChange={(o) => !o && setAssignModal({ open: false, policy: null })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign WFH Policy</DialogTitle>
            <DialogDescription>
              Assign <strong className="text-slate-900 dark:text-white">{assignModal.policy?.name}</strong> to an employee. If the employee already has a policy it will be replaced.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <Select
              label="Select Employee *"
              value={assignEmployeeId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAssignEmployeeId(e.target.value)}
            >
              <option value="">-- Choose an employee --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.employeeId})
                </option>
              ))}
            </Select>

            {selectedEmployee && (
              <div
                className={cn(
                  "p-3 rounded-xl text-xs flex items-start gap-2",
                  selectedEmployee.wfhPolicyId
                    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                    : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                )}
              >
                {selectedEmployee.wfhPolicyId ? (
                  <>
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>
                      Currently on: <strong>{selectedEmployee.wfhPolicyName}</strong>. This will be replaced.
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-bold mt-0.5">✓</span>
                    <span>No WFH policy currently assigned.</span>
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAssignModal({ open: false, policy: null });
                setAssignEmployeeId("");
              }}
            >
              Cancel
            </Button>
            <Button disabled={!assignEmployeeId || assignLoading} onClick={handleAssignEmployee}>
              {assignLoading && (
                <WeaveSpinner className="animate-spin mr-2" size={15} />
              )}
              Assign Policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Override Confirmation Dialog ────────────────────────────────────── */}
      <Dialog
        open={overrideConfirm.open}
        onOpenChange={(o) => !o && setOverrideConfirm({ open: false, policy: null, employee: null })}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={20} /> Confirm Policy Change
            </DialogTitle>
            <DialogDescription>
              This employee is currently assigned to a WFH policy. If you reassign them, their settings will be overwritten immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
            <p>Employee: <strong className="text-slate-900 dark:text-white">{overrideConfirm.employee?.fullName}</strong></p>
            <p>Current Policy: <strong>{overrideConfirm.employee?.wfhPolicyName}</strong></p>
            <p>New Policy: <strong>{overrideConfirm.policy?.name}</strong></p>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 mt-4 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOverrideConfirm({ open: false, policy: null, employee: null })}
            >
              Cancel
            </Button>
            <Button
              disabled={assignLoading}
              onClick={() =>
                overrideConfirm.policy &&
                overrideConfirm.employee &&
                doAssign(overrideConfirm.policy.id, overrideConfirm.employee.id)
              }
            >
              {assignLoading && (
                <WeaveSpinner className="animate-spin mr-2" size={15} />
              )}
              Confirm Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Conditional Rule Add/Edit Dialog ────────────────────────────────── */}
      <Dialog
        open={ruleModal.open}
        onOpenChange={(o) => !o && setRuleModal((s) => ({ ...s, open: false }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {ruleModal.mode === "create" ? "Add Conditional Rule" : "Edit Conditional Rule"}
            </DialogTitle>
            <DialogDescription>
              Apply special approval/notice rules when the requested WFH days meet a threshold.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRuleSubmit(onRuleSubmit)}>
            <div className="space-y-4 py-2">
              {/* Operator + Days row */}
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Condition *
                </p>
                <div className="flex gap-3 items-start">
                  <div className="w-48 shrink-0">
                    <Select {...regRule("operator")}>
                      <option value="GTE">{"At least ≥"}</option>
                      <option value="GT">{"More than >"}</option>
                      <option value="LTE">{"At most ≤"}</option>
                      <option value="LT">{"Less than <"}</option>
                      <option value="EQ">{"Exactly ="}</option>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[80px]">
                    <Input
                      type="number"
                      step="0.5"
                      min="0.5"
                      placeholder="e.g. 3"
                      error={ruleErrors.minDays?.message}
                      {...regRule("minDays")}
                    />
                  </div>
                  <span className="text-sm text-slate-500 dark:text-slate-400 pt-2.5 shrink-0">days</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This rule is enforced when the requested WFH matches this condition.
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-1">
                <Toggle
                  label="Requires Approval"
                  description="Threshold triggers approval requirement"
                  checked={watchRuleApproval}
                  onChange={(v) => setRuleValue("approvalRequired", v)}
                />
                <Toggle
                  label="Notice Required"
                  description="Threshold triggers advance notice requirement"
                  checked={watchRuleNotice}
                  onChange={(v) => setRuleValue("noticeRequired", v)}
                />
              </div>

              {watchRuleNotice && (
                <Input
                  label="Notice Period (Days) *"
                  type="number"
                  min="0"
                  placeholder="e.g. 5"
                  error={ruleErrors.minNoticeDays?.message}
                  {...regRule("minNoticeDays")}
                />
              )}

              <Input
                label="Custom Alert / Explanation Note"
                placeholder="e.g. Requires Director sign-off"
                error={ruleErrors.exception?.message}
                {...regRule("exception")}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRuleModal((s) => ({ ...s, open: false }))}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={ruleLoading}>
                {ruleLoading && (
                  <WeaveSpinner className="animate-spin mr-2" size={15} />
                )}
                Save Rule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Manage Employees Dialog ─────────────────────────────────────────── */}
      <Dialog
        open={manageEmpModal.open}
        onOpenChange={(o) => !o && setManageEmpModal({ open: false, policy: null })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assigned Employees</DialogTitle>
            <DialogDescription>
              Employees enrolled under{" "}
              <strong className="text-slate-900 dark:text-white">
                {manageEmpModal.policy?.name}
              </strong>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 max-h-60 overflow-y-auto space-y-2 pr-1">
            {!manageEmpModal.policy?.employees?.length ? (
              <p className="text-sm text-slate-400 text-center py-6">
                No employees currently assigned to this policy.
              </p>
            ) : (
              manageEmpModal.policy.employees.map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {emp.fullName}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      ID: {emp.employeeId}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 text-xs shrink-0"
                    disabled={unassignLoading === emp.id}
                    onClick={() => handleUnassign(emp.id)}
                  >
                    {unassignLoading === emp.id ? (
                      <WeaveSpinner className="animate-spin mr-1" size={12} />
                    ) : (
                      "Unassign"
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => setManageEmpModal({ open: false, policy: null })}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Mutation Password Confirmation Dialog ───────────────────────────── */}
      <Dialog
        open={passwordConfirm.open}
        onOpenChange={(o) =>
          !o && setPasswordConfirm({ open: false, action: "delete", policyId: "" })
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={20} />
              Confirm Administrator Authorization
            </DialogTitle>
            <DialogDescription>
              {passwordConfirm.action === "delete"
                ? "Are you sure you want to delete this policy? This action cannot be undone."
                : "Are you sure you want to save changes to this policy?"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              To proceed, please enter your login password to confirm your identity.
            </p>
            <Input
              label="Enter Password *"
              type="password"
              placeholder="••••••••"
              value={confirmPasswordInput}
              onChange={(e) => setConfirmPasswordInput(e.target.value)}
            />
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 mt-4 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPasswordConfirm({ open: false, action: "delete", policyId: "" });
                setConfirmPasswordInput("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={confirmPasswordLoading || !confirmPasswordInput}
              onClick={handleConfirmPasswordAction}
            >
              {confirmPasswordLoading && (
                <WeaveSpinner className="animate-spin mr-2" size={15} />
              )}
              Confirm Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
