"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Clock, Mail, Users } from "lucide-react";

interface Settings {
  checkInEnabled:       boolean;
  checkInCodeTime:      string;
  checkInStartTime:     string;
  checkInDeadline:      string;
  checkInBufferMinutes: number;
  checkOutExpected:     string;
  checkInWindowEnd:     string;
  weeklyEmailEnabled:   boolean;
  attendanceMode:       "AUTO_PRESENT" | "FROM_CHECKIN";
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${checked ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"}`}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

export default function CheckInSettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    checkInEnabled: false, checkInCodeTime: "09:00", checkInStartTime: "07:00",
    checkInDeadline: "10:30", checkInBufferMinutes: 0,
    checkOutExpected: "18:00", checkInWindowEnd: "13:00", weeklyEmailEnabled: false,
    attendanceMode: "AUTO_PRESENT",
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    api.get("/admin/checkin/settings")
      .then(r => setSettings(r.data))
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch("/admin/checkin/settings", settings);
      toast.success("Check-in settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  if (loading) return <div className="py-20 text-center text-slate-400">Loading settings…</div>;

  // Compute effective late time for preview
  const effectiveLateTime = (() => {
    const [h, m] = settings.checkInDeadline.split(":").map(Number);
    const total  = (h ?? 0) * 60 + (m ?? 0) + settings.checkInBufferMinutes;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  })();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Check-In Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configure daily attendance timings and rules</p>
      </div>

      {/* Enable module */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-primary" />
          <h2 className="font-semibold text-slate-900 dark:text-white">Module Control</h2>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Check-In Module</p>
            <p className="text-xs text-slate-500 mt-0.5">When disabled, employees cannot check in or out</p>
          </div>
          <Toggle checked={settings.checkInEnabled} onChange={v => set("checkInEnabled", v)} />
        </div>
      </div>

      {/* Daily Timings */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Clock size={16} className="text-primary" />
            <h2 className="font-semibold text-slate-900 dark:text-white">Daily Timings</h2>
          </div>
          <p className="text-xs text-slate-500">Configure when employees can check in and when they&apos;re marked late</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Code Generation Time</label>
            <p className="text-xs text-slate-400">When today&apos;s code is auto-generated</p>
            <input
              type="time"
              value={settings.checkInCodeTime}
              onChange={e => set("checkInCodeTime", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Earliest Check-In Time</label>
            <p className="text-xs text-slate-400">Cannot check in before this time</p>
            <input
              type="time"
              value={settings.checkInStartTime}
              onChange={e => set("checkInStartTime", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-amber-600">Late Deadline</label>
            <p className="text-xs text-slate-400">Check-ins after this time are marked late</p>
            <input
              type="time"
              value={settings.checkInDeadline}
              onChange={e => set("checkInDeadline", e.target.value)}
              className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:border-amber-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Buffer / Grace Period</label>
            <p className="text-xs text-slate-400">Minutes after deadline before marking late</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={60}
                value={settings.checkInBufferMinutes}
                onChange={e => set("checkInBufferMinutes", Number(e.target.value))}
                className="w-24 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
              />
              <span className="text-sm text-slate-500">minutes</span>
            </div>
            {settings.checkInBufferMinutes > 0 && (
              <p className="text-xs text-green-600">
                Late marked only after {effectiveLateTime} (deadline + {settings.checkInBufferMinutes}m buffer)
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Expected Check-Out Time</label>
            <p className="text-xs text-slate-400">Checkout before this = early checkout flag</p>
            <input
              type="time"
              value={settings.checkOutExpected}
              onChange={e => set("checkOutExpected", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Check-In Window Closes</label>
            <p className="text-xs text-slate-400">After this time, check-in is no longer allowed</p>
            <input
              type="time"
              value={settings.checkInWindowEnd}
              onChange={e => set("checkInWindowEnd", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
            />
          </div>
        </div>

        {/* Timeline preview */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500 mb-2">Daily Timeline Preview</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { label: "Window opens",   time: settings.checkInStartTime, color: "bg-green-500"  },
              { label: "Code generated", time: settings.checkInCodeTime,  color: "bg-blue-500"   },
              { label: "On-time by",     time: settings.checkInDeadline,  color: "bg-amber-500"  },
              ...(settings.checkInBufferMinutes > 0
                ? [{ label: "Late after",  time: effectiveLateTime,         color: "bg-orange-400" }]
                : []
              ),
              { label: "Window closes",  time: settings.checkInWindowEnd, color: "bg-red-400"    },
              { label: "Expected out",   time: settings.checkOutExpected,  color: "bg-purple-500" },
            ].map((t, i) => (
              <span key={i} className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className={`w-2 h-2 rounded-full ${t.color}`} />
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{t.time}</span>
                <span className="text-slate-400">{t.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Email settings */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Mail size={16} className="text-primary" />
          <h2 className="font-semibold text-slate-900 dark:text-white">Weekly Email Reports</h2>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Weekly Summary Emails</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Sent every Monday at 8:00 AM with previous week&apos;s attendance, late count, and working hours
            </p>
          </div>
          <Toggle checked={settings.weeklyEmailEnabled} onChange={v => set("weeklyEmailEnabled", v)} />
        </div>
      </div>

      {/* Attendance Mode */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Users size={16} className="text-primary" />
          <h2 className="font-semibold text-slate-900 dark:text-white">Attendance Marking Mode</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Choose how employee presence is determined in the muster roll
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            {
              value: "AUTO_PRESENT",
              title: "Mark Auto Present",
              desc: "All working days are automatically marked Present unless overridden by leave, WFH, or an absent record. Check-in is optional / informational only.",
              icon: "✅",
            },
            {
              value: "FROM_CHECKIN",
              title: "Mark Based on Check-In",
              desc: "Presence requires a check-in record. Working days with no check-in show as NC (No Check-In) and count as absent for salary. Recommended when check-in is mandatory.",
              icon: "🔒",
            },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set("attendanceMode", opt.value)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                settings.attendanceMode === opt.value
                  ? "border-primary bg-primary/5 dark:bg-primary/10"
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-lg">{opt.icon}</span>
                <span className={`text-sm font-semibold ${settings.attendanceMode === opt.value ? "text-primary" : "text-slate-800 dark:text-slate-200"}`}>
                  {opt.title}
                </span>
                {settings.attendanceMode === opt.value && (
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded-full">Active</span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{opt.desc}</p>
            </button>
          ))}
        </div>
        {settings.attendanceMode === "FROM_CHECKIN" && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            Make sure Check-In Module is enabled above, otherwise all employees will show NC every day.
          </p>
        )}
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        <Save size={14} className="mr-2" />
        {saving ? "Saving…" : "Save Settings"}
      </Button>
    </div>
  );
}
