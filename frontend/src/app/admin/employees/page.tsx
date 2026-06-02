"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Plus,
  Search,
  RefreshCw,
  KeyRound,
  Pencil,
  UserX,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Calendar,
  Shield,
  Users,
} from "lucide-react";
import api from "@/lib/api";
import { Employee, LeavePolicy, WfhPolicy } from "@/types";
import { WorkingScheduleTab } from "@/components/admin/WorkingScheduleTab";
import { EmployeeLeavesTab } from "@/components/admin/EmployeeLeavesTab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";



// ── Schema ────────────────────────────────────────────────────────────────────
const createSchema = z.object({
  fullName: z.string().min(2, "At least 2 characters"),
  email: z.string().email("Invalid email"),
  personalEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  mobile: z.string().optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
  dateOfJoining: z.string().optional(),
  probationMonths: z.string().optional(),
  reportingManagerId: z.string().optional(),
  canViewTeamCalendar: z.boolean(),
});

type CreateFormValues = z.infer<typeof createSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Tabs (employee detail) ────────────────────────────────────────────────────
type TabId = "info" | "leaves" | "wfh" | "schedule";

function Tabs({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
}) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "info", label: "Info" },
    { id: "leaves", label: "Leaves" },
    { id: "wfh", label: "WFH" },
    { id: "schedule", label: "Schedule" },
  ];
  return (
    <div className="flex border-b border-slate-200 dark:border-slate-800 px-6">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px",
            active === t.id
              ? "border-primary text-primary"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Info row helper ───────────────────────────────────────────────────────────
function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
        <Icon size={15} className="text-slate-500 dark:text-slate-400" />
      </div>
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 15;
  const totalPages = Math.ceil(total / limit);

  const router = useRouter();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [settingsDepts, setSettingsDepts] = useState<{ id: string; name: string }[]>([]);
  const [settingsRoles, setSettingsRoles] = useState<{ id: string; name: string }[]>([]);
  const [managers, setManagers] = useState<Pick<Employee, "id" | "fullName" | "employeeId">[]>([]);
  const [leavePolicies, setLeavePolicies] = useState<Pick<LeavePolicy, "id" | "name" | "leaveType">[]>([]);
  const [wfhPolicies, setWfhPolicies] = useState<Pick<WfhPolicy, "id" | "name">[]>([]);

  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [sheetTab, setSheetTab] = useState<TabId>("info");
  const [editMode, setEditMode] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { probationMonths: "6", canViewTeamCalendar: false },
  });

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        ...(search && { search }),
        ...(deptFilter && { department: deptFilter }),
        ...(statusFilter !== "" && { isActive: statusFilter }),
      });
      const res = await api.get(`/admin/employees?${params}`);
      setEmployees(res.data.data);
      setTotal(res.data.total);
    } catch {
      toast.error("Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, [page, search, deptFilter, statusFilter]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    api.get("/admin/employees/departments").then((r) => setDepartments(r.data)).catch(() => {});
    api.get("/admin/settings/departments").then((r) => setSettingsDepts(r.data)).catch(() => {});
    api.get("/admin/settings/roles").then((r) => setSettingsRoles(r.data)).catch(() => {});
    api.get("/admin/employees?limit=100").then((r) =>
      setManagers(r.data.data.map((e: Employee) => ({ id: e.id, fullName: e.fullName, employeeId: e.employeeId })))
    ).catch(() => {});
    api.get("/admin/policies/leave").then((r) =>
      setLeavePolicies(r.data.map((p: LeavePolicy) => ({ id: p.id, name: p.name, leaveType: p.leaveType })))
    ).catch(() => {});
    api.get("/admin/policies/wfh").then((r) =>
      setWfhPolicies(r.data.map((p: WfhPolicy) => ({ id: p.id, name: p.name })))
    ).catch(() => {});
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, deptFilter, statusFilter]);

  const onCreateSubmit = async (data: CreateFormValues) => {
    setCreateLoading(true);
    try {
      await api.post("/admin/employees", {
        ...data,
        probationMonths: data.probationMonths ? parseInt(data.probationMonths, 10) : 6,
      });
      toast.success("Employee created! Welcome email sent.");
      setCreateOpen(false);
      reset();
      fetchEmployees();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create employee");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleResetPassword = async (emp: Employee) => {
    if (!confirm(`Reset password for ${emp.fullName}? A new temp password will be emailed.`))
      return;
    try {
      await api.post(`/admin/employees/${emp.id}/reset-password`);
      toast.success("Password reset. Email sent.");
    } catch {
      toast.error("Failed to reset password");
    }
  };

  const handleToggleActive = async (emp: Employee) => {
    const action = emp.isActive ? "deactivate" : "activate";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${emp.fullName}?`)) return;
    try {
      await api.patch(`/admin/employees/${emp.id}`, { isActive: !emp.isActive });
      toast.success(`Employee ${action}d`);
      fetchEmployees();
      if (selectedEmployee?.id === emp.id) {
        setSelectedEmployee({ ...selectedEmployee, isActive: !emp.isActive });
      }
    } catch {
      toast.error(`Failed to ${action} employee`);
    }
  };

  // ── Employee Detail Save ───────────────────────────────────────────────────
  const [editForm, setEditForm] = useState<Partial<Employee>>({});

  const openDetail = (emp: Employee) => {
    setSelectedEmployee(emp);
    setEditForm(emp);
    setSheetTab("info");
    setEditMode(false);
  };

  const saveEdit = async () => {
    if (!selectedEmployee) return;
    setEditLoading(true);
    try {
      const res = await api.patch(`/admin/employees/${selectedEmployee.id}`, {
        fullName: editForm.fullName,
        personalEmail: editForm.personalEmail,
        mobile: editForm.mobile,
        department: editForm.department,
        designation: editForm.designation,
        dateOfJoining: editForm.dateOfJoining,
        probationMonths: editForm.probationMonths,
        reportingManagerId: editForm.reportingManagerId,
        leavePolicyId: editForm.leavePolicyId ?? null,
        wfhPolicyId: editForm.wfhPolicyId ?? null,
        canViewTeamCalendar: editForm.canViewTeamCalendar,
      });
      toast.success("Employee updated");
      setSelectedEmployee(res.data.employee);
      setEditMode(false);
      fetchEmployees();
    } catch {
      toast.error("Failed to update employee");
    } finally {
      setEditLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-blue-400/5 to-transparent border border-primary/10 dark:border-primary/20 p-5">
        <div className="relative flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Users className="text-primary" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-heading font-bold text-slate-900 dark:text-white leading-tight">Employees</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {loading ? "Loading…" : `${total} total member${total !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm shadow-primary/30 hover:bg-primary/90 transition-all shrink-0"
          >
            <Plus size={16} />
            Add Employee
          </button>
        </div>
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID, email…"
              className="w-full pl-9 pr-4 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
            />
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>

          <button
            onClick={fetchEmployees}
            title="Refresh"
            className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <RefreshCw size={15} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Table — desktop */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_1.2fr_1fr_100px_120px] px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 gap-4">
          {["Employee", "Department", "Joined", "Status", ""].map((h, i) => (
            <span key={i} className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</span>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <WeaveSpinner className="animate-spin text-primary" size={28} />
            <p className="text-sm text-slate-500">Loading employees…</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
            <div className="h-14 w-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <Users size={24} className="opacity-50" />
            </div>
            <p className="font-medium text-slate-600 dark:text-slate-300">No employees found</p>
            <p className="text-sm mt-1 text-slate-400">Try adjusting your filters or add a new employee</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {employees.map((emp) => (
              <div
                key={emp.id}
                onClick={() => openDetail(emp)}
                className="grid grid-cols-[2fr_1.2fr_1fr_100px_120px] px-5 py-4 gap-4 items-center hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
              >
                {/* Employee */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {getInitials(emp.fullName)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">{emp.fullName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{emp.employeeId} · {emp.user?.email}</p>
                  </div>
                </div>

                {/* Department */}
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{emp.department || "—"}</p>
                  {emp.designation && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{emp.designation}</p>
                  )}
                </div>

                {/* Joined */}
                <span className="text-sm text-slate-600 dark:text-slate-400">{formatDate(emp.dateOfJoining)}</span>

                {/* Status */}
                <div>
                  <span className={cn(
                    "inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full",
                    emp.isActive
                      ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full mr-1.5", emp.isActive ? "bg-green-500" : "bg-slate-400")} />
                    {emp.isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Inline actions — always visible, no dropdown clipping issue */}
                <div
                  className="flex items-center gap-1 justify-end"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => openDetail(emp)}
                    title="View / Edit"
                    className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleResetPassword(emp)}
                    title="Reset Password"
                    className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                  >
                    <KeyRound size={14} />
                  </button>
                  <button
                    onClick={() => handleToggleActive(emp)}
                    title={emp.isActive ? "Deactivate" : "Activate"}
                    className={cn(
                      "h-8 w-8 flex items-center justify-center rounded-xl transition-colors",
                      emp.isActive
                        ? "text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        : "text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                    )}
                  >
                    {emp.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Card list — mobile */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <WeaveSpinner className="animate-spin text-primary" size={28} />
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <Users size={36} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No employees found</p>
          </div>
        ) : (
          employees.map((emp) => (
            <div
              key={emp.id}
              onClick={() => openDetail(emp)}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 cursor-pointer active:scale-[0.99] transition-transform"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                    {getInitials(emp.fullName)}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {emp.fullName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {emp.employeeId}
                    </p>
                  </div>
                </div>
                <Badge variant={emp.isActive ? "success" : "gray"} className="shrink-0">
                  {emp.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                {emp.department && (
                  <span className="flex items-center gap-1">
                    <Building2 size={11} />
                    {emp.department}
                  </span>
                )}
                {emp.designation && (
                  <span className="flex items-center gap-1">
                    <Briefcase size={11} />
                    {emp.designation}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} employees
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 min-w-[60px] text-center">
              {page} / {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Create Employee Modal ───────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Employee</DialogTitle>
            <DialogDescription>
              A temporary password will be auto-generated and emailed to the employee.
            </DialogDescription>
          </DialogHeader>

          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <form onSubmit={handleSubmit(onCreateSubmit as any)}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Full Name *"
                placeholder="John Doe"
                error={errors.fullName?.message}
                {...register("fullName")}
              />
              <Input
                label="Work Email *"
                type="email"
                placeholder="john@innovizia.com"
                error={errors.email?.message}
                {...register("email")}
              />
              <Input
                label="Personal Email"
                type="email"
                placeholder="john@gmail.com"
                error={errors.personalEmail?.message}
                {...register("personalEmail")}
              />
              <Input
                label="Mobile"
                placeholder="+91 98765 43210"
                {...register("mobile")}
              />
              {/* Department dropdown */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Department</label>
                {settingsDepts.length === 0 ? (
                  <div className="flex items-center justify-between h-10 px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900">
                    <span className="text-xs text-slate-400 dark:text-slate-500">No departments configured.</span>
                    <button
                      type="button"
                      onClick={() => router.push("/admin/settings")}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Add in Settings →
                    </button>
                  </div>
                ) : (
                  <select
                    {...register("department")}
                    className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">— Select department —</option>
                    {settingsDepts.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Designation dropdown */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Designation</label>
                {settingsRoles.length === 0 ? (
                  <div className="flex items-center justify-between h-10 px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900">
                    <span className="text-xs text-slate-400 dark:text-slate-500">No roles configured.</span>
                    <button
                      type="button"
                      onClick={() => router.push("/admin/settings")}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Add in Settings →
                    </button>
                  </div>
                ) : (
                  <select
                    {...register("designation")}
                    className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">— Select designation —</option>
                    {settingsRoles.map((r) => (
                      <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <Input
                label="Date of Joining"
                type="date"
                {...register("dateOfJoining")}
              />
              <Input
                label="Probation (months)"
                type="number"
                min={0}
                max={24}
                error={errors.probationMonths?.message}
                {...register("probationMonths")}
              />

              <div className="sm:col-span-2">
                <Select
                  label="Reporting Manager"
                  placeholder="Select reporting manager"
                  {...register("reportingManagerId")}
                >
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName} ({m.employeeId})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="sm:col-span-2 flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="canViewTeamCalendar"
                  className="w-4 h-4 text-primary rounded border-slate-300"
                  checked={watch("canViewTeamCalendar")}
                  onChange={(e) => setValue("canViewTeamCalendar", e.target.checked)}
                />
                <label htmlFor="canViewTeamCalendar" className="text-sm text-slate-700 dark:text-slate-300">
                  Allow employee to view the Team Calendar
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateOpen(false);
                  reset();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createLoading}>
                {createLoading && <WeaveSpinner className="animate-spin mr-2" size={15} />}
                Create Employee
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Employee Detail Sheet ──────────────────────────────────────────── */}
      <Sheet open={!!selectedEmployee} onOpenChange={(o) => !o && setSelectedEmployee(null)}>
        <SheetContent>
          {selectedEmployee && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-4 pr-8">
                  <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-base font-bold shrink-0">
                    {getInitials(selectedEmployee.fullName)}
                  </div>
                  <div className="min-w-0">
                    <SheetTitle>{selectedEmployee.fullName}</SheetTitle>
                    <SheetDescription>
                      {selectedEmployee.employeeId} ·{" "}
                      {selectedEmployee.designation || "Employee"}
                    </SheetDescription>
                  </div>
                  <Badge
                    variant={selectedEmployee.isActive ? "success" : "gray"}
                    className="ml-auto shrink-0"
                  >
                    {selectedEmployee.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </SheetHeader>

              <Tabs active={sheetTab} onChange={(t) => { setSheetTab(t); setEditMode(false); }} />

              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                {sheetTab === "info" && (
                  <div className="space-y-1">
                    {editMode ? (
                      <EditInfoForm
                        form={editForm}
                        onChange={setEditForm}
                        managers={managers}
                        leavePolicies={leavePolicies}
                        wfhPolicies={wfhPolicies}
                        currentId={selectedEmployee.id}
                      />
                    ) : (
                      <>
                        <InfoRow icon={Mail} label="Work Email" value={selectedEmployee.user?.email} />
                        <InfoRow icon={Mail} label="Personal Email" value={selectedEmployee.personalEmail} />
                        <InfoRow icon={Phone} label="Mobile" value={selectedEmployee.mobile} />
                        <InfoRow icon={Building2} label="Department" value={selectedEmployee.department} />
                        <InfoRow icon={Briefcase} label="Designation" value={selectedEmployee.designation} />
                        <InfoRow icon={Calendar} label="Date of Joining" value={formatDate(selectedEmployee.dateOfJoining)} />
                        <InfoRow icon={Shield} label="Probation Period" value={`${selectedEmployee.probationMonths} months`} />
                        <InfoRow
                          icon={Users}
                          label="Reporting Manager"
                          value={selectedEmployee.reportingManager?.fullName}
                        />
                        {selectedEmployee.leavePolicy && (
                          <InfoRow
                            icon={Calendar}
                            label="Leave Policy"
                            value={selectedEmployee.leavePolicy.name}
                          />
                        )}
                        {selectedEmployee.wfhPolicy && (
                          <InfoRow
                            icon={Calendar}
                            label="WFH Policy"
                            value={selectedEmployee.wfhPolicy.name}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}

                {sheetTab === "leaves" && (
                  <EmployeeLeavesTab employeeId={selectedEmployee.id} />
                )}

                {sheetTab === "wfh" && (
                  <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                    <Briefcase size={36} className="mx-auto mb-3 opacity-40" />
                    <p className="font-medium">WFH history available in Phase 7</p>
                  </div>
                )}

                {sheetTab === "schedule" && (
                  <WorkingScheduleTab employeeId={selectedEmployee.id} />
                )}
              </div>

              {/* Sheet footer actions */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                {sheetTab === "info" && (
                  editMode ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditMode(false)}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={saveEdit}
                        disabled={editLoading}
                        className="flex-1"
                      >
                        {editLoading && <WeaveSpinner className="animate-spin mr-1" size={13} />}
                        Save
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditMode(true)}
                      className="flex-1"
                    >
                      <Pencil size={13} className="mr-1.5" />
                      Edit Info
                    </Button>
                  )
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleResetPassword(selectedEmployee)}
                  className="flex-1"
                >
                  <KeyRound size={13} className="mr-1.5" />
                  Reset Password
                </Button>
                <Button
                  variant={selectedEmployee.isActive ? "destructive" : "secondary"}
                  size="sm"
                  onClick={() => handleToggleActive(selectedEmployee)}
                  className="flex-1"
                >
                  {selectedEmployee.isActive ? (
                    <>
                      <UserX size={13} className="mr-1.5" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <UserCheck size={13} className="mr-1.5" />
                      Activate
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Action menu removed — replaced by inline icon buttons in the table row ──────

// ── Edit Info Form ────────────────────────────────────────────────────────────
function EditInfoForm({
  form,
  onChange,
  managers,
  leavePolicies,
  wfhPolicies,
  currentId,
}: {
  form: Partial<Employee>;
  onChange: (f: Partial<Employee>) => void;
  managers: Pick<Employee, "id" | "fullName" | "employeeId">[];
  leavePolicies: Pick<LeavePolicy, "id" | "name" | "leaveType">[];
  wfhPolicies: Pick<WfhPolicy, "id" | "name">[];
  currentId: string;
}) {
  const field = (key: keyof Employee) => ({
    value: (form[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...form, [key]: e.target.value }),
  });

  const LEAVE_TYPE_LABELS: Record<string, string> = {
    SICK: "Sick Leave",
    TRANSPORT_WEATHER: "Transport / Weather",
    PERSONAL: "Personal Leave",
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <Input label="Full Name" {...field("fullName")} />
      <Input label="Personal Email" type="email" {...field("personalEmail")} />
      <Input label="Mobile" {...field("mobile")} />
      <Input label="Department" {...field("department")} />
      <Input label="Designation" {...field("designation")} />
      <Input
        label="Date of Joining"
        type="date"
        value={form.dateOfJoining ? form.dateOfJoining.split("T")[0] : ""}
        onChange={(e) => onChange({ ...form, dateOfJoining: e.target.value })}
      />
      <Input
        label="Probation (months)"
        type="number"
        min={0}
        max={24}
        value={String(form.probationMonths ?? 6)}
        onChange={(e) => onChange({ ...form, probationMonths: Number(e.target.value) })}
      />
      <Select
        label="Reporting Manager"
        value={form.reportingManagerId ?? ""}
        onChange={(e) => onChange({ ...form, reportingManagerId: e.target.value })}
        placeholder="No manager"
      >
        {managers.filter((m) => m.id !== currentId).map((m) => (
          <option key={m.id} value={m.id}>{m.fullName} ({m.employeeId})</option>
        ))}
      </Select>

      {leavePolicies.length > 0 && (
        <Select
          label="Leave Policy"
          value={form.leavePolicyId ?? ""}
          onChange={(e) => onChange({ ...form, leavePolicyId: e.target.value || undefined })}
          placeholder="No policy assigned"
        >
          {leavePolicies.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {LEAVE_TYPE_LABELS[p.leaveType] ?? p.leaveType}
            </option>
          ))}
        </Select>
      )}

      {wfhPolicies.length > 0 && (
        <Select
          label="WFH Policy"
          value={form.wfhPolicyId ?? ""}
          onChange={(e) => onChange({ ...form, wfhPolicyId: e.target.value || undefined })}
          placeholder="No WFH policy assigned"
        >
          {wfhPolicies.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      )}

      <div className="flex items-center gap-2 mt-2">
        <input
          type="checkbox"
          id="editCanViewTeamCalendar"
          className="w-4 h-4 text-primary rounded border-slate-300"
          checked={form.canViewTeamCalendar ?? false}
          onChange={(e) => onChange({ ...form, canViewTeamCalendar: e.target.checked })}
        />
        <label htmlFor="editCanViewTeamCalendar" className="text-sm text-slate-700 dark:text-slate-300">
          Allow employee to view the Team Calendar
        </label>
      </div>
    </div>
  );
}
