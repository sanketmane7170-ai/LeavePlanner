"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, TrendingUp, Save, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";

interface LeaveLimitsSettings {
  monthlyLeaveLimitEnabled: boolean;
  monthlyLeaveLimit: number | null;
}

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
      <div>
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

export default function LeaveLimitsPage() {
  const [settings, setSettings] = useState<LeaveLimitsSettings | null>(null);
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [limitDays, setLimitDays] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get("/admin/settings/org").then((r) => {
      const data = r.data as any;
      setSettings({
        monthlyLeaveLimitEnabled: data.monthlyLeaveLimitEnabled ?? false,
        monthlyLeaveLimit: data.monthlyLeaveLimit ?? null,
      });
      setLimitEnabled(data.monthlyLeaveLimitEnabled ?? false);
      setLimitDays(data.monthlyLeaveLimit != null ? String(data.monthlyLeaveLimit) : "");
    }).catch(() => toast.error("Failed to load settings"));
  }, []);

  const handleSave = async () => {
    const parsedDays = limitDays ? parseFloat(limitDays) : null;
    if (limitEnabled && (!parsedDays || parsedDays <= 0)) {
      toast.error("Please enter a valid monthly leave limit (> 0)");
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      await api.patch("/admin/settings/org", {
        monthlyLeaveLimitEnabled: limitEnabled,
        monthlyLeaveLimit: limitEnabled ? parsedDays : null,
      });
      toast.success("Leave limit settings saved");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <WeaveSpinner className="animate-spin text-primary" size={32} />
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      </div>
    );
  }

  const isDirty =
    limitEnabled !== settings.monthlyLeaveLimitEnabled ||
    (limitDays || "") !== (settings.monthlyLeaveLimit != null ? String(settings.monthlyLeaveLimit) : "");

  return (
    <div className="w-full max-w-2xl space-y-4">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 dark:border-primary/20 p-5">
        <div className="relative flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 dark:bg-primary/20 flex items-center justify-center shrink-0">
            <ShieldCheck className="text-primary" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-heading font-bold text-slate-900 dark:text-white leading-tight">Leave Limits</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Set monthly leave consumption hard limits for employees.
            </p>
          </div>
        </div>
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
      </div>

      {/* How it works */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <Info size={15} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1 leading-relaxed">
          <p className="font-semibold">How monthly hard limit works</p>
          <p>When an employee applies for leave that exceeds the monthly hard limit, admin will see an <strong>Admin Insights</strong> warning on the leave review page with a suggested paid/unpaid split. Leaves are not auto-rejected — admin always makes the final decision.</p>
        </div>
      </div>

      {/* Settings card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Monthly Leave Hard Limit</span>
          </div>

          <div className="space-y-3">
            <Toggle
              checked={limitEnabled}
              onChange={setLimitEnabled}
              label="Enable Monthly Limit"
              description="Show warnings when employee's monthly leave exceeds the set limit"
            />

            {limitEnabled && (
              <div className="space-y-1.5 pl-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Maximum Days Per Month
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="31"
                    value={limitDays}
                    onChange={(e) => setLimitDays(e.target.value)}
                    placeholder="e.g. 5"
                    className="w-32 h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">days / month</span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Leaves beyond this limit will be flagged with suggested unpaid split.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Example scenario */}
        {limitEnabled && limitDays && (
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-amber-400" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Example Scenario</span>
            </div>
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <p>Monthly limit set to <strong className="text-slate-900 dark:text-white">{limitDays} days</strong>.</p>
              <p>
                Employee has already taken{" "}
                <strong className="text-slate-900 dark:text-white">
                  {Math.max(0, parseFloat(limitDays) - 2).toFixed(1)}
                </strong>{" "}
                days this month and applies for{" "}
                <strong className="text-slate-900 dark:text-white">3 more days</strong>:
              </p>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 space-y-1.5 mt-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Admin will see:</p>
                <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  Approving this exceeds the monthly limit of {limitDays} days
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  Recommended: {Math.max(0, parseFloat(limitDays) - (parseFloat(limitDays) - 2)).toFixed(1)}d paid + {(3 - Math.max(0, parseFloat(limitDays) - (parseFloat(limitDays) - 2))).toFixed(1)}d unpaid
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save bar */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 py-3 px-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {isDirty ? (
            <span className="text-amber-600 dark:text-amber-400 font-medium">● Unsaved changes</span>
          ) : saved ? (
            <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1.5">
              <CheckCircle2 size={13} /> All changes saved
            </span>
          ) : (
            "No pending changes"
          )}
        </p>
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="flex items-center justify-center gap-2 h-10 px-5 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm shadow-primary/30 hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all w-full sm:w-auto"
        >
          {saving ? <WeaveSpinner className="animate-spin" size={15} /> : <Save size={15} />}
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
