"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {  Save, Calendar, RotateCcw } from "lucide-react";
import api from "@/lib/api";
import type { SaturdayRule } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";



// ── Types ─────────────────────────────────────────────────────────────────────
interface ScheduleState {
  workingDays: string[];
  saturdayRule: SaturdayRule;
  monthlyTarget: number | "";
}

const DEFAULT_SCHEDULE: ScheduleState = {
  workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  saturdayRule: "NONE",
  monthlyTarget: "",
};

// ── Constants ─────────────────────────────────────────────────────────────────
const WEEKDAYS = [
  { key: "MONDAY",    short: "Mon", full: "Monday"    },
  { key: "TUESDAY",   short: "Tue", full: "Tuesday"   },
  { key: "WEDNESDAY", short: "Wed", full: "Wednesday" },
  { key: "THURSDAY",  short: "Thu", full: "Thursday"  },
  { key: "FRIDAY",    short: "Fri", full: "Friday"    },
  { key: "SUNDAY",    short: "Sun", full: "Sunday"    },
] as const;

const SATURDAY_RULES: { value: SaturdayRule; label: string; description: string }[] = [
  { value: "NONE",         label: "No Saturday",      description: "Saturdays are always off" },
  { value: "ALL",          label: "All Saturdays",    description: "Every Saturday is a working day" },
  { value: "FIRST",        label: "1st Saturday",     description: "Only the 1st Saturday of each month" },
  { value: "SECOND",       label: "2nd Saturday",     description: "Only the 2nd Saturday of each month" },
  { value: "THIRD",        label: "3rd Saturday",     description: "Only the 3rd Saturday of each month" },
  { value: "FOURTH",       label: "4th Saturday",     description: "Only the 4th Saturday of each month" },
  { value: "FIRST_THIRD",  label: "1st & 3rd",        description: "1st and 3rd Saturdays are working days" },
  { value: "SECOND_FOURTH",label: "2nd & 4th",        description: "2nd and 4th Saturdays are working days" },
];

// ── Working days preview ──────────────────────────────────────────────────────
function WorkingDaysPreview({ schedule }: { schedule: ScheduleState }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayKeyMap: Record<string, string> = {
    Mon: "MONDAY", Tue: "TUESDAY", Wed: "WEDNESDAY", Thu: "THURSDAY", Fri: "FRIDAY", Sun: "SUNDAY",
  };

  return (
    <div className="flex items-center gap-1 mt-3">
      {days.map((d) => {
        const isWorking =
          d === "Sat"
            ? schedule.saturdayRule !== "NONE"
            : schedule.workingDays.includes(dayKeyMap[d] ?? "");
        return (
          <div
            key={d}
            className={cn(
              "flex-1 text-center text-[10px] font-semibold py-1.5 rounded-lg",
              isWorking
                ? "bg-primary/10 text-primary"
                : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
            )}
          >
            {d}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface WorkingScheduleTabProps {
  employeeId: string;
}

export function WorkingScheduleTab({ employeeId }: WorkingScheduleTabProps) {
  const [schedule, setSchedule] = useState<ScheduleState>(DEFAULT_SCHEDULE);
  const [original, setOriginal] = useState<ScheduleState>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const fetchSchedule = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/schedules/${employeeId}`);
      if (res.data) {
        const s: ScheduleState = {
          workingDays: res.data.workingDays ?? DEFAULT_SCHEDULE.workingDays,
          saturdayRule: res.data.saturdayRule ?? "NONE",
          monthlyTarget: res.data.monthlyTarget ?? "",
        };
        setSchedule(s);
        setOriginal(s);
      } else {
        setSchedule(DEFAULT_SCHEDULE);
        setOriginal(DEFAULT_SCHEDULE);
      }
    } catch {
      setSchedule(DEFAULT_SCHEDULE);
      setOriginal(DEFAULT_SCHEDULE);
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (day: string) => {
    setSchedule((s) => ({
      ...s,
      workingDays: s.workingDays.includes(day)
        ? s.workingDays.filter((d) => d !== day)
        : [...s.workingDays, day],
    }));
  };

  const handleSave = async () => {
    if (schedule.workingDays.length === 0 && schedule.saturdayRule === "NONE") {
      toast.error("At least one working day must be selected");
      return;
    }

    setSaving(true);
    try {
      await api.post(`/admin/schedules/${employeeId}`, {
        workingDays: schedule.workingDays,
        saturdayRule: schedule.saturdayRule,
        monthlyTarget: schedule.monthlyTarget !== "" ? Number(schedule.monthlyTarget) : undefined,
      });
      setOriginal(schedule);
      toast.success("Working schedule saved");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSchedule(original);
  };

  const isDirty =
    JSON.stringify(schedule) !== JSON.stringify(original);

  const workingDayCount =
    schedule.workingDays.length + (schedule.saturdayRule !== "NONE" ? 1 : 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <WeaveSpinner className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary pill */}
      <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
        <Calendar size={15} className="text-primary shrink-0" />
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="font-semibold text-primary">{workingDayCount}</span>{" "}
          working day{workingDayCount !== 1 ? "s" : ""} per week
        </p>
      </div>

      {/* Working days grid */}
      <div>
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-3">
          Working Days (Mon – Fri + Sun)
        </label>
        <div className="grid grid-cols-3 gap-2.5">
          {WEEKDAYS.map(({ key, short, full }) => {
            const active = schedule.workingDays.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                className={cn(
                  "flex flex-col items-center justify-center py-3 rounded-xl border-2 text-sm font-medium transition-all",
                  active
                    ? "border-primary bg-primary text-white shadow-sm shadow-primary/30"
                    : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
                )}
              >
                <span className="text-base font-bold">{short}</span>
                <span className="text-[10px] mt-0.5 opacity-80">{full}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Saturday rule */}
      <div>
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-3">
          Saturday Rule
        </label>
        <div className="grid grid-cols-2 gap-2">
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
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                )}
              >
                <p className={cn("text-sm font-medium", active ? "text-primary" : "text-slate-700 dark:text-slate-300")}>
                  {label}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                  {description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Monthly working days target */}
      <div>
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
          Monthly Target Days
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-2">(optional)</span>
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
          Expected working days per month. Used for attendance reports.
        </p>
        <input
          type="number"
          min={0}
          max={31}
          value={schedule.monthlyTarget}
          onChange={(e) =>
            setSchedule((s) => ({ ...s, monthlyTarget: e.target.value === "" ? "" : Number(e.target.value) }))
          }
          placeholder="e.g. 22"
          className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Calendar preview */}
      <div>
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-1">
          Weekly Preview
        </label>
        <WorkingDaysPreview schedule={schedule} />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        {isDirty && (
          <Button variant="outline" size="sm" onClick={handleReset} className="flex-1">
            <RotateCcw size={13} className="mr-1.5" />
            Reset
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="flex-1"
        >
          {saving ? (
            <WeaveSpinner className="animate-spin mr-1.5" size={13} />
          ) : (
            <Save size={13} className="mr-1.5" />
          )}
          Save Schedule
        </Button>
      </div>
    </div>
  );
}
