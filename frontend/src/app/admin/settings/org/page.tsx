"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Globe, Building2, Clock, Save, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { WeaveSpinner } from "@/components/ui/weave-spinner";

interface OrgSettings {
  id: string;
  orgName: string;
  timezone: string;
}

const TIMEZONES = [
  { group: "Asia", items: ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Asia/Bangkok", "Asia/Karachi"] },
  { group: "Europe", items: ["Europe/London", "Europe/Berlin", "Europe/Paris", "Europe/Moscow"] },
  { group: "America", items: ["America/New_York", "America/Chicago", "America/Los_Angeles", "America/Toronto"] },
  { group: "Other", items: ["UTC", "Pacific/Auckland", "Australia/Sydney"] },
];

export default function OrgProfilePage() {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [orgName, setOrgName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get("/admin/settings/org").then((r) => {
      setSettings(r.data);
      setOrgName(r.data.orgName);
      setTimezone(r.data.timezone);
    }).catch(() => toast.error("Failed to load org settings"));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch("/admin/settings/org", { orgName: orgName.trim(), timezone: timezone.trim() });
      toast.success("Organization settings saved");
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
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading organization settings…</p>
      </div>
    );
  }

  const isDirty = orgName !== settings.orgName || timezone !== settings.timezone;

  return (
    <div className="w-full max-w-2xl space-y-4">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 dark:border-primary/20 p-5">
        <div className="relative flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 dark:bg-primary/20 flex items-center justify-center shrink-0">
            <Globe className="text-primary" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-heading font-bold text-slate-900 dark:text-white leading-tight">Organization Profile</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Configure your company name and default timezone.
            </p>
          </div>
        </div>
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
      </div>

      {/* Form Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Company Info */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Company Info</span>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Organization Name
            </label>
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Innovizia Technologies"
              className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
            />
            <p className="text-xs text-slate-400 dark:text-slate-500">
              This name will appear in emails and system notifications.
            </p>
          </div>
        </div>

        {/* Timezone */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Timezone</span>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Default Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all appearance-none cursor-pointer"
            >
              {TIMEZONES.map(({ group, items }) => (
                <optgroup key={group} label={group}>
                  {items.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Used for leave calculations, daily cron jobs and timestamp display.
            </p>
          </div>
        </div>
      </div>

      {/* Save Bar — stacks on mobile */}
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
          {saving ? (
            <WeaveSpinner className="animate-spin" size={15} />
          ) : (
            <Save size={15} />
          )}
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
