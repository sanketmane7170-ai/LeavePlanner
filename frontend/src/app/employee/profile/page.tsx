"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Mail, Phone, Building2, Briefcase, Calendar, Shield,
  User, Users, Lock,  CheckCircle2, Bell,
} from "lucide-react";
import api from "@/lib/api";
import { formatDate, LEAVE_TYPE_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";



// ── Types ─────────────────────────────────────────────────────────────────────
interface ProfileData {
  user: { id: string; email: string; role: string; };
  employee: {
    id: string;
    fullName: string;
    employeeId: string;
    personalEmail?: string;
    mobile?: string;
    department?: string;
    designation?: string;
    dateOfJoining?: string;
    probationMonths: number;
    isActive: boolean;
    reportingManager?: { fullName: string; employeeId: string } | null;
    leavePolicy?: { name: string; leaveType: string; daysAllowed: number } | null;
    wfhPolicy?: { name: string; daysAllowed: number } | null;
    workingSchedule?: { workingDays: string[]; saturdayRule: string } | null;
  } | null;
}

// ── Change password schema ────────────────────────────────────────────────────
const pwSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/[A-Z]/, "Must contain uppercase letter")
      .regex(/[0-9]/, "Must contain a number"),
    confirmPassword: z.string().min(1, "Required"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type PwForm = z.infer<typeof pwSchema>;

// ── Info row ──────────────────────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={14} className="text-slate-500 dark:text-slate-400" />
      </div>
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">{value || "—"}</p>
      </div>
    </div>
  );
}

// ── Notification toggle ───────────────────────────────────────────────────────
function NotifToggle({ label, description, value, onChange }: {
  label: string; description: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40",
          value ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
        )}
      >
        <span className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
          value ? "translate-x-5" : "translate-x-0.5"
        )} />
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPw, setSavingPw] = useState(false);

  // Notification prefs (localStorage)
  const [notifLeave, setNotifLeave] = useState(true);
  const [notifWfh, setNotifWfh] = useState(true);

  useEffect(() => {
    api.get("/employee/portal/profile")
      .then((r) => setProfile(r.data))
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setLoading(false));

    // Load notification prefs from localStorage
    try {
      const prefs = JSON.parse(localStorage.getItem("notifPrefs") || "{}");
      if (typeof prefs.leave === "boolean") setNotifLeave(prefs.leave);
      if (typeof prefs.wfh === "boolean") setNotifWfh(prefs.wfh);
    } catch { /* ignore */ }
  }, []);

  const saveNotifPrefs = (leave: boolean, wfh: boolean) => {
    localStorage.setItem("notifPrefs", JSON.stringify({ leave, wfh }));
    toast.success("Notification preferences saved");
  };

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PwForm>({
    resolver: zodResolver(pwSchema),
  });

  const onChangePassword = async (data: PwForm) => {
    setSavingPw(true);
    try {
      await api.patch("/auth/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success("Password changed successfully");
      reset();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to change password");
    } finally {
      setSavingPw(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <WeaveSpinner className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  const emp = profile?.employee;
  const initials = emp?.fullName
    ? emp.fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-heading font-bold text-slate-900 dark:text-white">My Profile</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Your personal and work information</p>
      </div>

      {/* Profile header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-xl font-bold shrink-0">
            {initials}
          </div>
          <div>
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">
              {emp?.fullName ?? "—"}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                {emp?.employeeId ?? "—"}
              </span>
              {emp?.designation && (
                <span className="text-xs text-slate-500 dark:text-slate-400">{emp.designation}</span>
              )}
              {emp?.department && (
                <span className="text-xs text-slate-500 dark:text-slate-400">· {emp.department}</span>
              )}
              <span className={cn(
                "text-xs px-2 py-0.5 rounded-full font-medium",
                emp?.isActive
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              )}>
                {emp?.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Personal info */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <h3 className="font-heading font-semibold text-slate-900 dark:text-white mb-1">Personal Information</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Contact your administrator to update this information.</p>
        <div>
          <InfoRow icon={Mail}     label="Work Email"        value={profile?.user.email} />
          <InfoRow icon={Mail}     label="Personal Email"    value={emp?.personalEmail} />
          <InfoRow icon={Phone}    label="Mobile"            value={emp?.mobile} />
          <InfoRow icon={Building2}label="Department"        value={emp?.department} />
          <InfoRow icon={Briefcase}label="Designation"       value={emp?.designation} />
          <InfoRow icon={Calendar} label="Date of Joining"   value={formatDate(emp?.dateOfJoining)} />
          <InfoRow icon={Shield}   label="Probation Period"  value={emp?.probationMonths ? `${emp.probationMonths} months` : undefined} />
          <InfoRow icon={Users}    label="Reporting Manager"
            value={emp?.reportingManager ? `${emp.reportingManager.fullName} (${emp.reportingManager.employeeId})` : undefined}
          />
        </div>
      </div>

      {/* Assigned policies */}
      {(emp?.leavePolicy || emp?.wfhPolicy) && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          <h3 className="font-heading font-semibold text-slate-900 dark:text-white mb-3">Assigned Policies</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {emp?.leavePolicy && (
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Leave Policy</p>
                <p className="font-medium text-slate-900 dark:text-white text-sm">{emp.leavePolicy.name}</p>
                <p className="text-xs text-primary mt-0.5">
                  {LEAVE_TYPE_LABELS[emp.leavePolicy.leaveType] ?? emp.leavePolicy.leaveType} · {emp.leavePolicy.daysAllowed} days/year
                </p>
              </div>
            )}
            {emp?.wfhPolicy && (
              <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">WFH Policy</p>
                <p className="font-medium text-slate-900 dark:text-white text-sm">{emp.wfhPolicy.name}</p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                  {emp.wfhPolicy.daysAllowed} days/month
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Change password */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={16} className="text-slate-600 dark:text-slate-400" />
          <h3 className="font-heading font-semibold text-slate-900 dark:text-white">Change Password</h3>
        </div>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <form onSubmit={handleSubmit(onChangePassword as any)} className="space-y-4">
          <Input
            label="Current Password"
            type="password"
            placeholder="Enter current password"
            error={errors.currentPassword?.message}
            {...register("currentPassword")}
          />
          <Input
            label="New Password"
            type="password"
            placeholder="Min 8 chars, 1 uppercase, 1 number"
            error={errors.newPassword?.message}
            {...register("newPassword")}
          />
          <Input
            label="Confirm New Password"
            type="password"
            placeholder="Re-enter new password"
            error={errors.confirmPassword?.message}
            {...register("confirmPassword")}
          />
          <Button type="submit" disabled={savingPw}>
            {savingPw ? (
              <WeaveSpinner className="animate-spin mr-2" size={15} />
            ) : (
              <CheckCircle2 size={15} className="mr-2" />
            )}
            Update Password
          </Button>
        </form>
      </div>

      {/* Notification preferences */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Bell size={16} className="text-slate-600 dark:text-slate-400" />
          <h3 className="font-heading font-semibold text-slate-900 dark:text-white">Notification Preferences</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Choose which email notifications you receive.
        </p>
        <NotifToggle
          label="Leave application updates"
          description="Get notified when your leave is approved, rejected, or marked absent"
          value={notifLeave}
          onChange={(v) => { setNotifLeave(v); saveNotifPrefs(v, notifWfh); }}
        />
        <NotifToggle
          label="WFH application updates"
          description="Get notified when your WFH request is approved or rejected"
          value={notifWfh}
          onChange={(v) => { setNotifWfh(v); saveNotifPrefs(notifLeave, v); }}
        />
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 flex items-center gap-1.5">
          <User size={11} />
          Preferences are saved locally on this device.
        </p>
      </div>
    </div>
  );
}
