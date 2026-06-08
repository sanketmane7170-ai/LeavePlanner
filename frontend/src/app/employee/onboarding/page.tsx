"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, UserCircle, FileText, CalendarDays,
  Home, ArrowRight, Sparkles,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";

interface Steps {
  profileComplete: boolean;
  leavePolicyAssigned: boolean;
  wfhPolicyAssigned: boolean;
  scheduleConfigured: boolean;
  onboardingCompleted: boolean;
}

interface OnboardingData {
  employee: {
    id: string;
    fullName: string;
    employeeId: string;
    department?: string;
    designation?: string;
    leavePolicy?: { id: string; name: string } | null;
    wfhPolicy?: { id: string; name: string } | null;
  };
  steps: Steps;
}

const STEP_CONFIG = [
  {
    key: "profileComplete" as keyof Steps,
    icon: UserCircle,
    title: "Complete Your Profile",
    description: "Add your mobile number and personal email address.",
    action: "/employee/profile",
    actionLabel: "Go to Profile",
    adminOnly: false,
  },
  {
    key: "leavePolicyAssigned" as keyof Steps,
    icon: FileText,
    title: "Leave Policy Assigned",
    description: "Your admin assigns a leave policy that defines your entitlements.",
    action: "/employee/my-policies",
    actionLabel: "View Leave Policy",
    adminOnly: true,
  },
  {
    key: "wfhPolicyAssigned" as keyof Steps,
    icon: Home,
    title: "WFH Policy Assigned",
    description: "Your admin assigns a work-from-home policy with yearly quota.",
    action: "/employee/my-policies",
    actionLabel: "View WFH Policy",
    adminOnly: true,
  },
  {
    key: "scheduleConfigured" as keyof Steps,
    icon: CalendarDays,
    title: "Working Schedule Set",
    description: "Your admin configures your working days and Saturday rules.",
    action: "/employee/my-schedule",
    actionLabel: "View My Schedule",
    adminOnly: true,
  },
];

function StepCard({ step, done, index, router }: { step: typeof STEP_CONFIG[0]; done: boolean; index: number; router: ReturnType<typeof useRouter> }) {
  return (
    <div className={cn(
      "flex items-start gap-4 p-4 rounded-2xl border transition-all",
      done
        ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800"
        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
    )}>
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
        done ? "bg-emerald-500" : "bg-slate-100 dark:bg-slate-800"
      )}>
        {done
          ? <CheckCircle2 size={20} className="text-white" />
          : <step.icon size={20} className="text-slate-500 dark:text-slate-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn("font-semibold text-sm", done ? "text-emerald-700 dark:text-emerald-400" : "text-slate-900 dark:text-white")}>
            {step.title}
          </p>
          {step.adminOnly && (
            <span className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">Admin sets this</span>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{step.description}</p>
        {!done && !step.adminOnly && (
          <button onClick={() => router.push(step.action)} className="mt-2 text-xs font-semibold text-primary hover:underline flex items-center gap-1">
            {step.actionLabel} <ArrowRight size={11} />
          </button>
        )}
        {done && (
          <button onClick={() => router.push(step.action)} className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
            {step.actionLabel} <ArrowRight size={11} />
          </button>
        )}
      </div>
      <div className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
        done ? "bg-emerald-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
      )}>
        {done ? "✓" : index + 1}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router   = useRouter();
  const [data,    setData]    = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/employee/portal/onboarding");
      setData(res.data);
    } catch {
      toast.error("Failed to load onboarding status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const completedCount = data ? STEP_CONFIG.filter(s => data.steps[s.key]).length : 0;
  const totalSteps = STEP_CONFIG.length;
  const allDone = completedCount === totalSteps;

  async function handleComplete() {
    setCompleting(true);
    try {
      await api.post("/employee/portal/onboarding/complete");
      toast.success("Onboarding complete! Welcome aboard.");
      router.push("/employee/dashboard");
    } catch {
      toast.error("Failed to complete onboarding");
    } finally {
      setCompleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <WeaveSpinner size={32} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-6">
      {/* Welcome header */}
      <div className="text-center space-y-2 pt-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Sparkles size={28} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Welcome, {data.employee.fullName.split(" ")[0]}!
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Let's get your account set up. Complete the steps below to get started.
        </p>
      </div>

      {/* Progress bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-900 dark:text-white">Setup Progress</span>
          <span className="text-sm font-bold text-primary">{completedCount}/{totalSteps}</span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">
          <div
            className={cn("h-2.5 rounded-full transition-all duration-500", allDone ? "bg-emerald-500" : "bg-primary")}
            style={{ width: `${(completedCount / totalSteps) * 100}%` }}
          />
        </div>
        {allDone && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1">
            <CheckCircle2 size={12} /> All steps complete — you're ready to go!
          </p>
        )}
      </div>

      {/* Step cards */}
      <div className="space-y-3">
        {STEP_CONFIG.map((step, i) => (
          <StepCard key={step.key} step={step} done={data.steps[step.key]} index={i} router={router} />
        ))}
      </div>

      {/* Employee info card */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-400 mb-0.5">Employee ID</p>
          <p className="font-semibold text-slate-900 dark:text-white">{data.employee.employeeId}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-0.5">Department</p>
          <p className="font-semibold text-slate-900 dark:text-white">{data.employee.department || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-0.5">Leave Policy</p>
          <p className="font-semibold text-slate-900 dark:text-white">{data.employee.leavePolicy?.name || <span className="text-amber-600">Not assigned</span>}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-0.5">WFH Policy</p>
          <p className="font-semibold text-slate-900 dark:text-white">{data.employee.wfhPolicy?.name || <span className="text-amber-600">Not assigned</span>}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.push("/employee/dashboard")} className="flex-1">
          Skip for now
        </Button>
        <Button onClick={handleComplete} className="flex-1 gap-1.5" disabled={completing}>
          {completing ? <WeaveSpinner size={13} /> : <CheckCircle2 size={15} />}
          {completing ? "Completing…" : allDone ? "Complete Setup" : "Continue to Dashboard"}
        </Button>
      </div>
    </div>
  );
}
