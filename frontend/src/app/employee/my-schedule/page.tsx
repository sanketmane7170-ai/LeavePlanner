"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";

interface WorkingSchedule {
  id: string;
  employeeId: string;
  workingDays: string[];
  saturdayRule: string;
  monthlyTarget?: number | null;
}

interface ScheduleData {
  employee: {
    id: string;
    fullName: string;
    employeeId: string;
    department?: string;
    designation?: string;
    dateOfJoining?: string;
  };
  schedule: WorkingSchedule | null;
}

const ALL_DAYS = ["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"] as const;
const DAY_SHORT: Record<string, string> = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed",
  THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun",
};

const SATURDAY_RULE_LABELS: Record<string, string> = {
  NONE:          "No Saturdays",
  ALL:           "All Saturdays",
  FIRST:         "1st Saturday",
  SECOND:        "2nd Saturday",
  THIRD:         "3rd Saturday",
  FOURTH:        "4th Saturday",
  FIRST_THIRD:   "1st & 3rd Saturdays",
  SECOND_FOURTH: "2nd & 4th Saturdays",
};

function DayPill({ day, active }: { day: string; active: boolean }) {
  return (
    <div className={cn(
      "flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-all",
      active
        ? "border-primary bg-primary/5 dark:bg-primary/10"
        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 opacity-40"
    )}>
      <span className={cn("text-xs font-bold", active ? "text-primary" : "text-slate-400")}>
        {DAY_SHORT[day]}
      </span>
      {active
        ? <CheckCircle2 size={14} className="text-primary" />
        : <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 dark:border-slate-600" />}
    </div>
  );
}

export default function MySchedulePage() {
  const [data,    setData]    = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetch() {
    setLoading(true);
    try {
      const res = await api.get("/employee/portal/my-schedule");
      setData(res.data);
    } catch {
      toast.error("Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetch(); }, []);

  const workingDays = data?.schedule?.workingDays ?? [];
  const activeDays  = ALL_DAYS.filter(d => d !== "SATURDAY" && d !== "SUNDAY" && workingDays.includes(d));
  const satRule     = data?.schedule?.saturdayRule ?? "NONE";
  const hasSaturday = satRule !== "NONE";
  const workingCount = activeDays.length + (hasSaturday ? 0.5 : 0);

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarDays size={20} className="text-primary" />
            My Working Schedule
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Your configured working days and schedule rules
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetch} disabled={loading} className="gap-1.5">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><WeaveSpinner size={28} /></div>
      ) : !data?.schedule ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
          <CalendarDays size={40} className="mb-3 opacity-30" />
          <p className="font-medium text-slate-600 dark:text-slate-300">No schedule configured</p>
          <p className="text-sm mt-1">Contact your admin to set up your working schedule.</p>
        </div>
      ) : (
        <>
          {/* Employee info */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-primary">
                {data.employee.fullName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900 dark:text-white">{data.employee.fullName}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{data.employee.employeeId} · {data.employee.designation || data.employee.department || "—"}</p>
            </div>
          </div>

          {/* Day pills */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Working Days</h3>
            <div className="grid grid-cols-7 gap-2">
              {ALL_DAYS.map(day => {
                const active = day === "SATURDAY"
                  ? hasSaturday
                  : workingDays.includes(day);
                return <DayPill key={day} day={day} active={active} />;
              })}
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-center">
              <p className="text-2xl font-bold text-primary">{activeDays.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Regular Working Days</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {hasSaturday ? "Yes" : "No"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Saturday Working</p>
            </div>
            {data.schedule.monthlyTarget && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{data.schedule.monthlyTarget}</p>
                <p className="text-xs text-slate-500 mt-0.5">Monthly Target Days</p>
              </div>
            )}
          </div>

          {/* Saturday rule detail */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock size={16} className="text-amber-500" />
              Saturday Rule
            </h3>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                hasSaturday ? "bg-amber-100 dark:bg-amber-900/30" : "bg-slate-100 dark:bg-slate-700"
              )}>
                <CalendarDays size={18} className={hasSaturday ? "text-amber-600" : "text-slate-400"} />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {SATURDAY_RULE_LABELS[satRule] ?? satRule}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {hasSaturday
                    ? "These Saturday(s) are counted as working days."
                    : "Saturdays are off for you."}
                </p>
              </div>
            </div>
          </div>

          {/* Working days list */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Your Working Days</h3>
            <div className="space-y-2">
              {activeDays.map(d => (
                <div key={d} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span className="text-slate-700 dark:text-slate-300">{d.charAt(0) + d.slice(1).toLowerCase()}</span>
                </div>
              ))}
              {hasSaturday && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 size={14} className="text-amber-500 shrink-0" />
                  <span className="text-slate-700 dark:text-slate-300">Saturday ({SATURDAY_RULE_LABELS[satRule]})</span>
                </div>
              )}
              {workingDays.includes("SUNDAY") && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 size={14} className="text-red-500 shrink-0" />
                  <span className="text-slate-700 dark:text-slate-300">Sunday</span>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-center text-slate-400 pb-2">
            To change your working schedule, contact your admin.
          </p>
        </>
      )}
    </div>
  );
}
