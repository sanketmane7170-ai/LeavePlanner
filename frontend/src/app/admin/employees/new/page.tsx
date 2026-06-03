"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  UserPlus, Mail, Briefcase, Calendar, Shield, Users, Settings, CalendarDays,
} from "lucide-react";
import api from "@/lib/api";
import type { Employee, LeavePolicy, WfhPolicy, SaturdayRule } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import { cn } from "@/lib/utils";

// ── Schema ────────────────────────────────────────────────────────────────────
const schema = z.object({
  fullName:            z.string().min(2, "At least 2 characters"),
  email:               z.string().email("Invalid email"),
  personalEmail:       z.string().email("Invalid email").optional().or(z.literal("")),
  mobile:              z.string().optional(),
  department:          z.string().optional(),
  designation:         z.string().optional(),
  dateOfJoining:       z.string().optional(),
  birthday:            z.string().optional(),
  probationMonths:     z.string().optional(),
  reportingManagerId:  z.string().optional(),
  leavePolicyId:       z.string().optional(),
  wfhPolicyId:         z.string().optional(),
  canViewTeamCalendar: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

// ── Schedule state ────────────────────────────────────────────────────────────
interface ScheduleState {
  workingDays:   string[];
  saturdayRule:  SaturdayRule;
  monthlyTarget: number | "";
}

const DEFAULT_SCHEDULE: ScheduleState = {
  workingDays:   ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  saturdayRule:  "NONE",
  monthlyTarget: "",
};

const WEEKDAYS = [
  { key: "MONDAY",    short: "Mon" },
  { key: "TUESDAY",   short: "Tue" },
  { key: "WEDNESDAY", short: "Wed" },
  { key: "THURSDAY",  short: "Thu" },
  { key: "FRIDAY",    short: "Fri" },
  { key: "SUNDAY",    short: "Sun" },
] as const;

const SATURDAY_RULES: { value: SaturdayRule; label: string; description: string }[] = [
  { value: "NONE",          label: "No Saturday",  description: "Always off" },
  { value: "ALL",           label: "All",          description: "Every Saturday" },
  { value: "FIRST",         label: "1st",          description: "1st Saturday only" },
  { value: "SECOND",        label: "2nd",          description: "2nd Saturday only" },
  { value: "THIRD",         label: "3rd",          description: "3rd Saturday only" },
  { value: "FOURTH",        label: "4th",          description: "4th Saturday only" },
  { value: "FIRST_THIRD",   label: "1st & 3rd",    description: "1st & 3rd Saturdays" },
  { value: "SECOND_FOURTH", label: "2nd & 4th",    description: "2nd & 4th Saturdays" },
];

const LEAVE_TYPE_LABELS: Record<string, string> = {
  SICK: "Sick Leave", TRANSPORT_WEATHER: "Transport / Weather",
  PERSONAL: "Personal Leave", GENERAL: "All Types",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, subtitle, children }: {
  icon: React.ElementType; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
      <div className="flex items-start gap-2.5">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Icon size={14} className="text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function EmptyPlaceholder({ msg, linkLabel, onClick }: {
  msg: string; linkLabel: string; onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between h-10 px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900">
      <span className="text-xs text-slate-400">{msg}</span>
      <button type="button" onClick={onClick} className="text-xs text-primary hover:underline font-medium flex items-center gap-1">
        <Settings size={11} /> {linkLabel}
      </button>
    </div>
  );
}

function NativeSelect({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      <select {...props} className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50">
        {children}
      </select>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NewEmployeePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [settingsDepts, setSettingsDepts] = useState<{ id: string; name: string }[]>([]);
  const [settingsRoles, setSettingsRoles] = useState<{ id: string; name: string }[]>([]);
  const [managers, setManagers]           = useState<Pick<Employee, "id" | "fullName" | "employeeId">[]>([]);
  const [leavePolicies, setLeavePolicies] = useState<Pick<LeavePolicy, "id" | "name" | "leaveType">[]>([]);
  const [wfhPolicies, setWfhPolicies]     = useState<Pick<WfhPolicy, "id" | "name">[]>([]);

  // Schedule state (managed separately since it's submitted after employee creation)
  const [schedule, setSchedule] = useState<ScheduleState>(DEFAULT_SCHEDULE);

  useEffect(() => {
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

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { probationMonths: "6", canViewTeamCalendar: false },
  });

  const canViewTeamCalendar = watch("canViewTeamCalendar");

  const toggleDay = (day: string) => {
    setSchedule((s) => ({
      ...s,
      workingDays: s.workingDays.includes(day)
        ? s.workingDays.filter((d) => d !== day)
        : [...s.workingDays, day],
    }));
  };

  const workingDayCount = schedule.workingDays.length + (schedule.saturdayRule !== "NONE" ? 1 : 0);

  const onSubmit = async (data: FormValues) => {
    setSaving(true);
    try {
      // 1. Create employee (includes policies now)
      const res = await api.post("/admin/employees", {
        ...data,
        probationMonths: data.probationMonths ? parseInt(data.probationMonths, 10) : 6,
        leavePolicyId:   data.leavePolicyId   || undefined,
        wfhPolicyId:     data.wfhPolicyId     || undefined,
      });

      const newEmployeeId: string = res.data.employee.id;

      // 2. Save working schedule
      try {
        await api.post(`/admin/schedules/${newEmployeeId}`, {
          workingDays:   schedule.workingDays,
          saturdayRule:  schedule.saturdayRule,
          monthlyTarget: schedule.monthlyTarget !== "" ? Number(schedule.monthlyTarget) : undefined,
        });
      } catch {
        // Schedule saving is non-critical — employee was created, just show a warning
        toast.warning("Employee created but working schedule could not be saved. Set it from the employee detail.");
        router.push("/admin/employees");
        return;
      }

      toast.success("Employee created! Welcome email sent.");
      router.push("/admin/employees");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create employee");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <UserPlus size={18} className="text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Add New Employee</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            A temporary password will be auto-generated and emailed to the employee
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* ── 1. Identity ─────────────────────────────────────────────────────── */}
        <Section icon={Mail} title="Identity">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Full Name *" placeholder="John Doe" error={errors.fullName?.message} {...register("fullName")} />
            <Input label="Work Email *" type="email" placeholder="john@company.com" error={errors.email?.message} {...register("email")} />
            <Input label="Personal Email" type="email" placeholder="john@gmail.com" error={errors.personalEmail?.message} {...register("personalEmail")} />
            <Input label="Mobile" placeholder="+91 98765 43210" {...register("mobile")} />
          </div>
        </Section>

        {/* ── 2. Role & Department ─────────────────────────────────────────────── */}
        <Section icon={Briefcase} title="Role & Department">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Department</label>
              {settingsDepts.length === 0 ? (
                <EmptyPlaceholder msg="No departments configured." linkLabel="Add in Settings" onClick={() => router.push("/admin/settings/departments")} />
              ) : (
                <select {...register("department")} className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">— Select department —</option>
                  {settingsDepts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Designation</label>
              {settingsRoles.length === 0 ? (
                <EmptyPlaceholder msg="No roles configured." linkLabel="Add in Settings" onClick={() => router.push("/admin/settings/roles")} />
              ) : (
                <select {...register("designation")} className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">— Select designation —</option>
                  {settingsRoles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
              )}
            </div>

            <div className="sm:col-span-2">
              <Select label="Reporting Manager" placeholder="No manager" {...register("reportingManagerId")}>
                <option value="">— No manager —</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.fullName} ({m.employeeId})</option>)}
              </Select>
            </div>
          </div>
        </Section>

        {/* ── 3. Dates & Probation ─────────────────────────────────────────────── */}
        <Section icon={Calendar} title="Dates & Probation">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Date of Joining" type="date" {...register("dateOfJoining")} />
            <Input label="Date of Birth" type="date" {...register("birthday")} />
            <Input label="Probation (months)" type="number" min={0} max={24} error={errors.probationMonths?.message} {...register("probationMonths")} />
          </div>
        </Section>

        {/* ── 4. Policies ─────────────────────────────────────────────────────── */}
        <Section icon={Shield} title="Policies" subtitle="Assign leave and WFH policies right away">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Leave Policy</label>
              {leavePolicies.length === 0 ? (
                <EmptyPlaceholder msg="No leave policies yet." linkLabel="Create policy" onClick={() => router.push("/admin/policy-manager")} />
              ) : (
                <select {...register("leavePolicyId")} className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">— No policy —</option>
                  {leavePolicies.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — {LEAVE_TYPE_LABELS[p.leaveType] ?? p.leaveType}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">WFH Policy</label>
              {wfhPolicies.length === 0 ? (
                <EmptyPlaceholder msg="No WFH policies yet." linkLabel="Create policy" onClick={() => router.push("/admin/wfh-policy")} />
              ) : (
                <select {...register("wfhPolicyId")} className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">— No WFH policy —</option>
                  {wfhPolicies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
          </div>
        </Section>

        {/* ── 5. Working Schedule ──────────────────────────────────────────────── */}
        <Section icon={CalendarDays} title="Working Schedule" subtitle="Set which days and Saturdays this employee works">
          {/* Working days counter */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/20 mb-4">
            <CalendarDays size={14} className="text-primary shrink-0" />
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-primary">{workingDayCount}</span>{" "}
              working day{workingDayCount !== 1 ? "s" : ""} per week
            </p>
          </div>

          {/* Weekday toggles (Mon–Fri + Sun) */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Working Days</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {WEEKDAYS.map(({ key, short }) => {
                const active = schedule.workingDays.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleDay(key)}
                    className={cn(
                      "py-2.5 rounded-xl border-2 text-sm font-semibold transition-all",
                      active
                        ? "border-primary bg-primary text-white shadow-sm shadow-primary/30"
                        : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300"
                    )}
                  >
                    {short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Saturday rule */}
          <div className="space-y-3 mt-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Saturday Rule</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SATURDAY_RULES.map(({ value, label, description }) => {
                const active = schedule.saturdayRule === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSchedule((s) => ({ ...s, saturdayRule: value }))}
                    className={cn(
                      "text-left px-3 py-2.5 rounded-xl border-2 transition-all",
                      active
                        ? "border-primary bg-primary/5 dark:bg-primary/10"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                    )}
                  >
                    <p className={cn("text-sm font-medium", active ? "text-primary" : "text-slate-700 dark:text-slate-300")}>
                      {label}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">{description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Monthly target */}
          <div className="mt-4 max-w-xs">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Monthly Target Days <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Expected working days per month — used in attendance reports.</p>
            <input
              type="number"
              min={0}
              max={31}
              value={schedule.monthlyTarget}
              onChange={(e) => setSchedule((s) => ({ ...s, monthlyTarget: e.target.value === "" ? "" : Number(e.target.value) }))}
              placeholder="e.g. 22"
              className="h-10 w-full px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </Section>

        {/* ── 6. Permissions ───────────────────────────────────────────────────── */}
        <Section icon={Users} title="Permissions">
          <div
            onClick={() => setValue("canViewTeamCalendar", !canViewTeamCalendar)}
            className={cn(
              "flex items-center justify-between p-4 rounded-xl border cursor-pointer select-none transition-colors",
              canViewTeamCalendar
                ? "border-primary/40 bg-primary/5 dark:bg-primary/10"
                : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            )}
          >
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-white">Team Calendar Access</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Allow this employee to view the Team Calendar</p>
            </div>
            <div className={cn("relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors", canViewTeamCalendar ? "bg-primary" : "bg-slate-200 dark:bg-slate-700")}>
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200", canViewTeamCalendar ? "translate-x-5" : "translate-x-0.5")} />
            </div>
          </div>
        </Section>

        {/* ── Actions ──────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <Button type="button" variant="outline" onClick={() => router.push("/admin/employees")} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="gap-2 min-w-[160px]">
            {saving && <WeaveSpinner size={14} className="animate-spin" />}
            {saving ? "Creating…" : "Create Employee"}
          </Button>
        </div>
      </form>
    </div>
  );
}
