"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2, UserCircle, FileText, CalendarDays,
  Home, ArrowRight, Sparkles, Loader2, ChevronRight, ExternalLink,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

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

const STEPS = [
  {
    key: "profileComplete" as keyof Steps,
    icon: UserCircle,
    title: "Complete Your Profile",
    description: "Add your mobile number and personal email so your team can reach you.",
    action: "/employee/profile",
    actionLabel: "Open Profile",
    adminTask: false,
    color: "indigo",
  },
  {
    key: "leavePolicyAssigned" as keyof Steps,
    icon: FileText,
    title: "Leave Policy",
    description: "Your admin is assigning a leave policy that defines your annual leave entitlements.",
    action: "/employee/my-policies",
    actionLabel: "View Policy",
    adminTask: true,
    color: "violet",
  },
  {
    key: "wfhPolicyAssigned" as keyof Steps,
    icon: Home,
    title: "WFH Policy",
    description: "Your admin will set a work-from-home policy with your yearly quota.",
    action: "/employee/my-policies",
    actionLabel: "View Policy",
    adminTask: true,
    color: "purple",
  },
  {
    key: "scheduleConfigured" as keyof Steps,
    icon: CalendarDays,
    title: "Working Schedule",
    description: "Your admin configures your working days, shift timing, and Saturday rules.",
    action: "/employee/my-schedule",
    actionLabel: "View Schedule",
    adminTask: true,
    color: "sky",
  },
];

const COLORS: Record<string, { bg: string; ring: string; text: string; lightBg: string }> = {
  indigo: { bg: "bg-indigo-500", ring: "ring-indigo-200", text: "text-indigo-600", lightBg: "bg-indigo-50" },
  violet: { bg: "bg-violet-500", ring: "ring-violet-200", text: "text-violet-600", lightBg: "bg-violet-50" },
  purple: { bg: "bg-purple-500", ring: "ring-purple-200", text: "text-purple-600", lightBg: "bg-purple-50" },
  sky:    { bg: "bg-sky-500",    ring: "ring-sky-200",    text: "text-sky-600",    lightBg: "bg-sky-50"    },
};

export default function OnboardingPage() {
  const router = useRouter();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  const loadData = useCallback(async () => {
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

  useEffect(() => { loadData(); }, [loadData]);

  const completedCount = data ? STEPS.filter((s) => data.steps[s.key]).length : 0;
  const allDone = completedCount === STEPS.length;
  const pct = Math.round((completedCount / STEPS.length) * 100);

  async function handleComplete() {
    setCompleting(true);
    try {
      await api.post("/employee/portal/onboarding/complete");
      toast.success("Welcome aboard! Everything is set up.");
      router.push("/employee/dashboard");
    } catch {
      toast.error("Failed to complete onboarding");
      setCompleting(false);
    }
  }

  return (
    /* Full-screen overlay covers sidebar + header completely */
    <div className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 60%, #f0fdf4 100%)" }}>

      {/* Dot grid backdrop */}
      <div
        className="fixed inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, #c7d2fe 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />

      <div className="relative min-h-full flex flex-col items-center justify-start px-4 py-12">
        {/* Brand */}
        <div className="mb-8 flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <span className="text-[11px] font-black text-white tracking-tight">In</span>
          </div>
          <span className="font-bold text-slate-700 text-base tracking-tight">Innovizia</span>
        </div>

        <div className="w-full max-w-[520px] space-y-5">

          {loading ? (
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-16 flex flex-col items-center gap-4">
              <Loader2 size={28} className="animate-spin text-indigo-500" />
              <p className="text-sm text-slate-500">Loading your account…</p>
            </div>
          ) : !data ? null : (
            <>
              {/* Welcome card */}
              <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                <div className="px-8 py-7" style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center">
                      <Sparkles size={22} className="text-white" />
                    </div>
                    <div>
                      <p className="text-indigo-200 text-xs font-medium uppercase tracking-wide">Account Setup</p>
                      <h1 className="text-xl font-bold text-white leading-tight">
                        Welcome, {data.employee.fullName.split(" ")[0]}!
                      </h1>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-indigo-200 text-xs">Setup progress</span>
                      <span className="text-white text-xs font-bold">{completedCount}/{STEPS.length} complete</span>
                    </div>
                    <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          background: allDone
                            ? "linear-gradient(90deg, #34d399, #10b981)"
                            : "linear-gradient(90deg, #a5b4fc, #fff)",
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Employee details strip */}
                <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-x-6 gap-y-2">
                  {[
                    { label: "Employee ID", value: data.employee.employeeId },
                    { label: "Department",  value: data.employee.department || "—" },
                    { label: "Designation", value: data.employee.designation || "—" },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{item.label}</p>
                      <p className="text-sm font-semibold text-slate-700">{item.value}</p>
                    </div>
                  ))}
                </div>

                {allDone && (
                  <div className="px-8 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                    <p className="text-sm text-emerald-700 font-medium">All steps complete — you're ready to go!</p>
                  </div>
                )}
              </div>

              {/* Step list */}
              <div className="space-y-3">
                {STEPS.map((step, i) => {
                  const isDone = data.steps[step.key];
                  const c = COLORS[step.color];
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.key}
                      className={cn(
                        "bg-white rounded-2xl border shadow-sm overflow-hidden transition-all",
                        isDone ? "border-emerald-200" : "border-slate-100 hover:border-slate-200"
                      )}
                    >
                      <div className="flex items-start gap-4 p-5">
                        {/* Step icon */}
                        <div className={cn(
                          "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ring-4",
                          isDone ? "bg-emerald-500 ring-emerald-100" : `${c.lightBg} ${c.ring}`
                        )}>
                          {isDone
                            ? <CheckCircle2 size={20} className="text-white" />
                            : <Icon size={20} className={c.text} />}
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn(
                              "text-sm font-semibold",
                              isDone ? "text-emerald-700" : "text-slate-900"
                            )}>
                              {step.title}
                            </span>
                            {step.adminTask && (
                              <span className="text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full">
                                Admin sets this
                              </span>
                            )}
                            {isDone && (
                              <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                                Done
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.description}</p>

                          {/* Action link */}
                          <button
                            onClick={() => router.push(step.action)}
                            className={cn(
                              "mt-2 inline-flex items-center gap-1 text-xs font-semibold transition-colors",
                              isDone ? "text-emerald-600 hover:text-emerald-700" : `${c.text} hover:underline`
                            )}
                          >
                            {step.actionLabel}
                            {isDone ? <ExternalLink size={10} /> : <ArrowRight size={11} />}
                          </button>
                        </div>

                        {/* Step number */}
                        <div className={cn(
                          "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
                          isDone ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
                        )}>
                          {isDone ? "✓" : i + 1}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Policy & schedule info */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 grid grid-cols-2 gap-4">
                {[
                  { label: "Leave Policy",   value: data.employee.leavePolicy?.name },
                  { label: "WFH Policy",     value: data.employee.wfhPolicy?.name },
                ].map((item) => (
                  <div key={item.label} className="space-y-0.5">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">{item.label}</p>
                    {item.value
                      ? <p className="text-sm font-semibold text-slate-700">{item.value}</p>
                      : <p className="text-sm font-medium text-amber-500">Not assigned yet</p>}
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="flex gap-3 pb-6">
                <button
                  onClick={() => router.push("/employee/dashboard")}
                  className="flex-1 h-11 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all"
                >
                  Skip for now
                </button>
                <button
                  onClick={handleComplete}
                  disabled={completing}
                  className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-sm font-semibold shadow-md shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
                >
                  {completing ? (
                    <><Loader2 size={15} className="animate-spin" /> Finishing…</>
                  ) : allDone ? (
                    <><CheckCircle2 size={15} /> Complete Setup</>
                  ) : (
                    <>Continue to Dashboard <ChevronRight size={15} /></>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
