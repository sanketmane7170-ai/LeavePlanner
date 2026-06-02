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
} from "lucide-react";
import api from "@/lib/api";
import type { LeavePolicy, PolicyRule, PolicyRuleOperator } from "@/types";
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

// ── Constants ─────────────────────────────────────────────────────────────────
const LEAVE_TYPE_LABELS: Record<string, string> = {
  GENERAL: "All Leave Types",
  SICK: "Sick Leave",
  TRANSPORT_WEATHER: "Transport / Weather",
  PERSONAL: "Personal Leave",
};

const LEAVE_TYPE_COLORS: Record<string, string> = {
  GENERAL: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  SICK: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  TRANSPORT_WEATHER:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  PERSONAL:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const PROBATION_LABELS: Record<string, string> = {
  NONE: "No restriction",
  NO_LEAVES: "No leaves allowed",
  UNPAID_ALLOWED: "Unpaid leave (no balance deduction)",
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
  carryForward: z.boolean(),
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

// ── Policy Card ───────────────────────────────────────────────────────────────
function PolicyCard({
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
  policy: LeavePolicy;
  onEdit: () => void;
  onDelete: () => void;
  onAddException: () => void;
  onDeleteException: (id: string) => void;
  onAssignEmployee: () => void;
  onManageEmployees: () => void;
  onAddRule: () => void;
  onEditRule: (rule: PolicyRule) => void;
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
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
              LEAVE_TYPE_COLORS[policy.leaveType]
            )}
          >
            {LEAVE_TYPE_LABELS[policy.leaveType]}
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
          <span className="text-3xl font-bold text-primary">
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
        <SettingRow label="Carry Forward" on={policy.carryForward} />
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
              notice requirements based on leave duration.
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
export default function PolicyManagerPage() {
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  // Policy modal
  const [policyModal, setPolicyModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    policy?: LeavePolicy;
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
    policy: LeavePolicy | null;
  }>({ open: false, policy: null });
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);

  // Override confirmation dialog
  const [overrideConfirm, setOverrideConfirm] = useState<{
    open: boolean;
    policy: LeavePolicy | null;
    employee: EmployeeOption | null;
  }>({ open: false, policy: null, employee: null });

  // Rule modal
  const [ruleModal, setRuleModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    policyId: string;
    rule?: PolicyRule;
  }>({ open: false, mode: "create", policyId: "" });
  const [ruleLoading, setRuleLoading] = useState(false);

  // Manage assigned employees modal
  const [manageEmpModal, setManageEmpModal] = useState<{
    open: boolean;
    policy: LeavePolicy | null;
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
      carryForward: false,
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
  const watchCarry = watch("carryForward");
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
          leavePolicyId: e.leavePolicyId ?? null,
          leavePolicyName: e.leavePolicy?.name ?? null,
        }))
      );
    } catch {
      // silent
    }
  }, []);

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/policies/leave");
      setPolicies(res.data);
    } catch {
      toast.error("Failed to load leave policies");
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
      carryForward: false,
      probationRule: "NONE",
    });
    setPolicyModal({ open: true, mode: "create" });
  };

  const openEdit = (p: LeavePolicy) => {
    reset({
      name: p.name,
      daysAllowed: String(p.daysAllowed),
      approvalRequired: p.approvalRequired,
      noticeRequired: p.noticeRequired,
      minNoticeDays: String(p.minNoticeDays),
      halfDayAllowed: p.halfDayAllowed,
      carryForward: p.carryForward,
      probationRule: p.probationRule as any,
    });
    setPolicyModal({ open: true, mode: "edit", policy: p });
  };

  const onPolicySubmit = async (data: PolicyFormValues) => {
    setPolicyLoading(true);
    try {
      const payload = {
        ...data,
        daysAllowed: parseFloat(data.daysAllowed),
        minNoticeDays: data.minNoticeDays ? parseInt(data.minNoticeDays, 10) : 0,
      };
      if (policyModal.mode === "create") {
        await api.post("/admin/policies/leave", payload);
        toast.success("Leave policy created");
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

  const handleDelete = async (p: LeavePolicy) => {
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
        await api.delete(`/admin/policies/leave/${passwordConfirm.policyId}`, {
          data: { confirmPassword: confirmPasswordInput },
        });
        toast.success("Leave policy deleted");
      } else if (passwordConfirm.action === "edit" && passwordConfirm.payload) {
        await api.patch(`/admin/policies/leave/${passwordConfirm.policyId}`, {
          ...passwordConfirm.payload,
          confirmPassword: confirmPasswordInput,
        });
        toast.success("Leave policy updated");
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
      await api.post(`/admin/policies/leave/${exModal.policyId}/exceptions`, {
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
      await api.delete(`/admin/policies/leave/exceptions/${exId}`);
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
    if (selectedEmployee?.leavePolicyId) {
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
        leavePolicyId: policyId,
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

  const openEditRule = (policyId: string, rule: PolicyRule) => {
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

  // ── Unassign Employee ────────────────────────────────────────────────────────
  const handleUnassign = async (employeeId: string) => {
    setUnassignLoading(employeeId);
    try {
      await api.patch(`/admin/employees/${employeeId}`, { leavePolicyId: null });
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
          `/admin/policies/leave/${ruleModal.policyId}/rules`,
          payload
        );
        toast.success("Rule added");
      } else if (ruleModal.rule) {
        await api.patch(
          `/admin/policies/leave/rules/${ruleModal.rule.id}`,
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
      await api.delete(`/admin/policies/leave/rules/${ruleId}`);
      toast.success("Rule deleted");
      fetchPolicies();
    } catch {
      toast.error("Failed to delete rule");
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-heading font-bold text-slate-900 dark:text-white">
            Leave Policy Manager
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {policies.length} polic{policies.length !== 1 ? "ies" : "y"}{" "}
            configured
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus size={16} className="mr-1.5" />
          New Policy
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <WeaveSpinner className="animate-spin text-primary" size={28} />
        </div>
      ) : policies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
          <FileText size={40} className="mb-3 opacity-40" />
          <p className="font-medium">No leave policies yet</p>
          <p className="text-sm mt-1">
            Create your first policy to assign to employees
          </p>
          <Button onClick={openCreate} size="sm" className="mt-4">
            <Plus size={15} className="mr-1.5" />
            Create Policy
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {policies.map((p) => (
            <PolicyCard
              key={p.id}
              policy={p}
              onEdit={() => openEdit(p)}
              onDelete={() => handleDelete(p)}
              onAddException={() => {
                resetEx();
                setExModal({ open: true, policyId: p.id });
              }}
              onDeleteException={handleDeleteException}
              onAssignEmployee={() => {
                setAssignEmployeeId("");
                setAssignModal({ open: true, policy: p });
              }}
              onManageEmployees={() => setManageEmpModal({ open: true, policy: p })}
              onAddRule={() => openAddRule(p.id)}
              onEditRule={(rule) => openEditRule(p.id, rule)}
              onDeleteRule={handleDeleteRule}
            />
          ))}
        </div>
      )}

      {/* ── Create / Edit Policy Modal ─────────────────────────────────────── */}
      <Dialog
        open={policyModal.open}
        onOpenChange={(o) => !o && setPolicyModal((s) => ({ ...s, open: false }))}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {policyModal.mode === "create"
                ? "Create Leave Policy"
                : "Edit Leave Policy"}
            </DialogTitle>
            <DialogDescription>
              Configure rules for this leave type. Changes apply immediately to
              assigned employees.
            </DialogDescription>
          </DialogHeader>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <form onSubmit={handleSubmit(onPolicySubmit as any)}>
            <div className="space-y-4">
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
                placeholder="12"
                error={errors.daysAllowed?.message}
                {...register("daysAllowed")}
              />
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2">
                <span className="text-base">ℹ️</span>
                <span>
                  Days can be used across <strong>all leave types</strong> —
                  Sick, Personal, and Transport / Weather.
                </span>
              </div>
              <Select label="Probation Rule" {...register("probationRule")}>
                <option value="NONE">No restriction</option>
                <option value="NO_LEAVES">
                  No leaves allowed during probation
                </option>
                <option value="UNPAID_ALLOWED">
                  Allow leave but mark as unpaid (no balance deduction)
                </option>
              </Select>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-1">
                <Toggle
                  label="Approval Required"
                  description="Must be approved by admin"
                  checked={watchApproval}
                  onChange={(v) => setValue("approvalRequired", v)}
                />
                <Toggle
                  label="Half Day Allowed"
                  description="Employees can apply for half days"
                  checked={watchHalfDay}
                  onChange={(v) => setValue("halfDayAllowed", v)}
                />
                <Toggle
                  label="Carry Forward"
                  description="Unused days roll over to next year"
                  checked={watchCarry}
                  onChange={(v) => setValue("carryForward", v)}
                />
                <Toggle
                  label="Notice Required"
                  description="Minimum advance notice must be given"
                  checked={watchNotice}
                  onChange={(v) => setValue("noticeRequired", v)}
                />
              </div>
              {watchNotice && (
                <Input
                  label="Minimum Notice Days"
                  type="number"
                  min="1"
                  placeholder="3"
                  error={errors.minNoticeDays?.message}
                  {...register("minNoticeDays")}
                />
              )}
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
                {policyModal.mode === "create"
                  ? "Create Policy"
                  : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add Exception Modal ────────────────────────────────────────────── */}
      <Dialog
        open={exModal.open}
        onOpenChange={(o) => !o && setExModal((s) => ({ ...s, open: false }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Policy Exception</DialogTitle>
            <DialogDescription>
              Override the default allowance and set a blackout period for a
              specific employee.
            </DialogDescription>
          </DialogHeader>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <form onSubmit={handleExSubmit(onExceptionSubmit as any)}>
            <div className="space-y-4">
              <Select
                label="Employee *"
                placeholder="Select employee"
                error={exErrors.employeeId?.message}
                {...regEx("employeeId")}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName} ({e.employeeId})
                  </option>
                ))}
              </Select>
              <Input
                label="Override Days *"
                type="number"
                step="0.5"
                min="0"
                placeholder="8"
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
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  The blackout period blocks this leave type for the selected
                  employee during those dates.
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setExModal((s) => ({ ...s, open: false }))}
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

      {/* ── Assign Employee Modal ──────────────────────────────────────────── */}
      <Dialog
        open={assignModal.open}
        onOpenChange={(o) => {
          if (!o) {
            setAssignModal({ open: false, policy: null });
            setAssignEmployeeId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Employee to Policy</DialogTitle>
            <DialogDescription>
              Assign{" "}
              <strong className="text-slate-900 dark:text-white">
                {assignModal.policy?.name}
              </strong>{" "}
              to an employee. If the employee already has a policy it will be
              replaced.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <Select
              label="Select Employee *"
              value={assignEmployeeId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setAssignEmployeeId(e.target.value)
              }
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
                  selectedEmployee.leavePolicyId
                    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                    : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                )}
              >
                {selectedEmployee.leavePolicyId ? (
                  <>
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>
                      Currently on:{" "}
                      <strong>{selectedEmployee.leavePolicyName}</strong>. This
                      will be replaced.
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-bold mt-0.5">✓</span>
                    <span>No leave policy currently assigned.</span>
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
            <Button
              disabled={!assignEmployeeId || assignLoading}
              onClick={handleAssignEmployee}
            >
              {assignLoading && (
                <WeaveSpinner className="animate-spin mr-2" size={15} />
              )}
              Assign Policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Override Confirmation ──────────────────────────────────────────── */}
      <Dialog
        open={overrideConfirm.open}
        onOpenChange={(o) =>
          !o && setOverrideConfirm((s) => ({ ...s, open: false }))
        }
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Override Policy?</DialogTitle>
            <DialogDescription>
              <strong className="text-slate-900 dark:text-white">
                {overrideConfirm.employee?.leavePolicyName}
              </strong>{" "}
              is already assigned to{" "}
              <strong className="text-slate-900 dark:text-white">
                {overrideConfirm.employee?.fullName}
              </strong>
              . Do you want to replace it with{" "}
              <strong className="text-slate-900 dark:text-white">
                {overrideConfirm.policy?.name}
              </strong>
              ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setOverrideConfirm((s) => ({ ...s, open: false }))
              }
            >
              No
            </Button>
            <Button
              disabled={assignLoading}
              onClick={() => {
                if (overrideConfirm.policy && overrideConfirm.employee) {
                  doAssign(
                    overrideConfirm.policy.id,
                    overrideConfirm.employee.id
                  );
                }
              }}
            >
              {assignLoading && (
                <WeaveSpinner className="animate-spin mr-2" size={15} />
              )}
              Yes, Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit Rule Modal ──────────────────────────────────────────── */}
      <Dialog
        open={ruleModal.open}
        onOpenChange={(o) => !o && setRuleModal((s) => ({ ...s, open: false }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ruleModal.mode === "create"
                ? "Add Conditional Rule"
                : "Edit Rule"}
            </DialogTitle>
            <DialogDescription>
              Set conditions that trigger specific approval or notice
              requirements based on leave duration.
            </DialogDescription>
          </DialogHeader>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <form onSubmit={handleRuleSubmit(onRuleSubmit as any)}>
            <div className="space-y-4">
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
                      placeholder="e.g. 2"
                      error={ruleErrors.minDays?.message}
                      {...regRule("minDays")}
                    />
                  </div>
                  <span className="text-sm text-slate-500 dark:text-slate-400 pt-2.5 shrink-0">days</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This rule is enforced when the requested leave matches this condition.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-1">
                <Toggle
                  label="Approval Required"
                  description="Admin must approve the leave"
                  checked={watchRuleApproval}
                  onChange={(v) => setRuleValue("approvalRequired", v)}
                />
                <Toggle
                  label="Notice Required"
                  description="Minimum advance notice must be given"
                  checked={watchRuleNotice}
                  onChange={(v) => setRuleValue("noticeRequired", v)}
                />
              </div>
              {watchRuleNotice && (
                <Input
                  label="Minimum Notice Days"
                  type="number"
                  min="1"
                  placeholder="e.g. 3"
                  error={ruleErrors.minNoticeDays?.message}
                  {...regRule("minNoticeDays")}
                />
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Exception / Reason{" "}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  className="flex w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  rows={3}
                  placeholder="e.g. Emergency situations may be exempt from this notice requirement"
                  {...regRule("exception")}
                />
              </div>
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
                {ruleModal.mode === "create" ? "Add Rule" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Manage Assigned Employees Modal ───────────────────────────────── */}
      <Dialog
        open={manageEmpModal.open}
        onOpenChange={(o) => !o && setManageEmpModal({ open: false, policy: null })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assigned Employees</DialogTitle>
            <DialogDescription>
              Employees currently on{" "}
              <strong className="text-slate-900 dark:text-white">
                {manageEmpModal.policy?.name}
              </strong>
              . Click Unassign to remove an employee from this policy.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-2 py-1">
            {(manageEmpModal.policy?.employees?.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
                No employees assigned to this policy.
              </p>
            ) : (
              manageEmpModal.policy?.employees?.map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {emp.fullName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {emp.employeeId}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                    disabled={unassignLoading === emp.id}
                    onClick={() => handleUnassign(emp.id)}
                  >
                    {unassignLoading === emp.id ? (
                      <WeaveSpinner className="animate-spin" size={13} />
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
              variant="outline"
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
