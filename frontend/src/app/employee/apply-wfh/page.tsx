"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { toast } from "sonner";
import {
  Home,
  AlertTriangle,
  CheckCircle2, 
  Info,
} from "lucide-react";
import api from "@/lib/api";
import { calculateLeaveDaysClient, formatDate } from "@/lib/utils";
import type { WfhPolicy, WorkingSchedule } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";



// ── Types ─────────────────────────────────────────────────────────────────────
interface WfhBalanceCtx {
  policy: WfhPolicy | null;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  month: number;
  year: number;
  employee: { workingSchedule: WorkingSchedule | null };
  holidays: { id: string; name: string; date: string }[];
}

// ── Month name helper ─────────────────────────────────────────────────────────
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ── Half-day slot button ──────────────────────────────────────────────────────
function SlotButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all",
        selected
          ? "border-primary bg-primary text-white"
          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
      )}
    >
      {label}
    </button>
  );
}

// ── Monthly balance bar ───────────────────────────────────────────────────────
function MonthlyBalance({ ctx }: { ctx: WfhBalanceCtx }) {
  const total = ctx.policy?.daysAllowed ?? 0;
  const used = ctx.usedDays;
  const pending = ctx.pendingDays;
  const remaining = ctx.remainingDays;
  const usedPct = total > 0 ? (used / total) * 100 : 0;
  const pendingPct = total > 0 ? (pending / total) * 100 : 0;

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            WFH Balance — {MONTHS[(ctx.month - 1) % 12]} {ctx.year}
          </p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            {remaining}
            <span className="text-sm font-normal text-slate-500 ml-1">of {total} days remaining</span>
          </p>
        </div>
        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Home size={17} className="text-primary" />
        </div>
      </div>

      {/* Stacked bar: used + pending + remaining */}
      <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
        {usedPct > 0 && (
          <div className="h-full bg-primary rounded-full" style={{ width: `${usedPct}%` }} />
        )}
        {pendingPct > 0 && (
          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pendingPct}%` }} />
        )}
      </div>
      <div className="flex gap-4 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
        {used > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary inline-block" />{used} approved</span>}
        {pending > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{pending} pending</span>}
        <span className="ml-auto">{remaining} free</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ApplyWfhPage() {
  const router = useRouter();
  const [ctx, setCtx] = useState<WfhBalanceCtx | null>(null);
  const [loading, setLoading] = useState(true);

  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDaySlot, setHalfDaySlot] = useState<"FIRST_HALF" | "SECOND_HALF">("FIRST_HALF");
  const [range, setRange] = useState<DateRange | undefined>();
  const [singleDate, setSingleDate] = useState<Date | undefined>();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get("/employee/wfh/balance")
      .then((r) => setCtx(r.data))
      .catch(() => toast.error("Failed to load WFH data"))
      .finally(() => setLoading(false));
  }, []);

  const policy = ctx?.policy ?? null;
  const schedule = ctx?.employee.workingSchedule;
  const workingDays = schedule?.workingDays ?? ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const saturdayRule = schedule?.saturdayRule ?? "NONE";
  const holidayDates = useMemo(
    () => ctx?.holidays.map((h) => h.date.split("T")[0] ?? "") ?? [],
    [ctx]
  );
  const holidayDateObjects = useMemo(
    () => ctx?.holidays.map((h) => new Date(h.date)) ?? [],
    [ctx]
  );

  const totalDays = useMemo(() => {
    if (isHalfDay && singleDate) return 0.5;
    if (!isHalfDay && range?.from) {
      const to = range.to ?? range.from;
      return calculateLeaveDaysClient(range.from, to, workingDays, saturdayRule, holidayDates, false);
    }
    return 0;
  }, [isHalfDay, singleDate, range, workingDays, saturdayRule, holidayDates]);

  const handleSubmit = async () => {
    if (!policy) return;
    const fromDate = isHalfDay ? singleDate : range?.from;
    const toDate   = isHalfDay ? singleDate : (range?.to ?? range?.from);

    if (!fromDate) { toast.error("Please select a date"); return; }
    if (!reason.trim()) { toast.error("Please provide a reason"); return; }
    if (totalDays <= 0) { toast.error("No working days selected"); return; }

    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        date: fromDate.toISOString(),
        isHalfDay,
        reason: reason.trim(),
      };
      if (toDate && toDate.toDateString() !== fromDate.toDateString()) {
        payload["toDate"] = toDate.toISOString();
      }
      if (isHalfDay) payload["halfDaySlot"] = halfDaySlot;

      const res = await api.post("/employee/wfh/apply", payload);
      toast.success(res.data.message);
      router.push("/employee/my-leaves");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to submit WFH application");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <WeaveSpinner className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4">
        <AlertTriangle size={40} className="mx-auto mb-4 text-amber-500" />
        <h2 className="font-heading font-semibold text-lg text-slate-900 dark:text-white">
          No WFH Policy Assigned
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
          Your account doesn&apos;t have a WFH policy yet. Please ask your administrator to assign one.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-heading font-bold text-slate-900 dark:text-white">Apply for WFH</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Submit a work-from-home request</p>
      </div>

      {/* Policy + balance */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/20">
          <Home size={17} className="text-primary shrink-0" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{policy.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {policy.daysAllowed} days/month
              {policy.approvalRequired ? " · Requires approval" : " · Auto-approved"}
            </p>
          </div>
        </div>
        {ctx && <MonthlyBalance ctx={ctx} />}
      </div>

      {/* Half-day toggle */}
      {policy.halfDayAllowed && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-medium text-slate-900 dark:text-white">Half Day</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Counts as 0.5 days</p>
            </div>
            <button
              type="button"
              onClick={() => { setIsHalfDay((v) => !v); setRange(undefined); setSingleDate(undefined); }}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40",
                isHalfDay ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
              )}
            >
              <span className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                isHalfDay ? "translate-x-5" : "translate-x-0.5"
              )} />
            </button>
          </div>
          {isHalfDay && (
            <div className="flex gap-2">
              <SlotButton label="First Half" selected={halfDaySlot === "FIRST_HALF"} onClick={() => setHalfDaySlot("FIRST_HALF")} />
              <SlotButton label="Second Half" selected={halfDaySlot === "SECOND_HALF"} onClick={() => setHalfDaySlot("SECOND_HALF")} />
            </div>
          )}
        </div>
      )}

      {/* Date picker */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          {isHalfDay ? "Select Date" : "Select Date(s)"}
        </p>
        <div className="flex justify-center overflow-x-auto">
          {isHalfDay ? (
            <DayPicker
              mode="single"
              selected={singleDate}
              onSelect={setSingleDate}
              disabled={[{ before: new Date() }]}
              modifiers={{ holiday: holidayDateObjects }}
              modifiersClassNames={{ holiday: "rdp-day_holiday" }}
              showOutsideDays
            />
          ) : (
            <DayPicker
              mode="range"
              selected={range}
              onSelect={setRange}
              disabled={[{ before: new Date() }]}
              modifiers={{ holiday: holidayDateObjects }}
              modifiersClassNames={{ holiday: "rdp-day_holiday" }}
              numberOfMonths={1}
              showOutsideDays
            />
          )}
        </div>

        {holidayDateObjects.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="w-3 h-3 rounded-sm bg-amber-100 dark:bg-amber-900/30 border border-amber-300" />
            <span>Public holiday (not counted)</span>
          </div>
        )}

        {(range?.from || singleDate) && (
          <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">
              {isHalfDay
                ? formatDate(singleDate?.toISOString())
                : range?.from && range?.to
                  ? `${formatDate(range.from.toISOString())} → ${formatDate(range.to.toISOString())}`
                  : range?.from
                    ? formatDate(range.from.toISOString())
                    : ""}
            </span>
            <span className="font-bold text-primary">
              {totalDays} day{totalDays !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Inline holiday notice */}
        {ctx?.holidays.slice(0, 3).map((h) => {
          const d = new Date(h.date);
          const from = isHalfDay ? singleDate : range?.from;
          const to   = isHalfDay ? singleDate : range?.to ?? range?.from;
          if (from && to && d >= from && d <= to) {
            return (
              <div key={h.id} className="mt-2 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-xl">
                <Info size={13} />
                <span>{h.name} ({formatDate(h.date)}) is excluded</span>
              </div>
            );
          }
          return null;
        })}
      </div>

      {/* Reason */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">
          Reason *
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Working from home due to scheduled maintenance…"
          maxLength={500}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <p className="text-xs text-slate-400 mt-1 text-right">{reason.length}/500</p>
      </div>

      {/* Policy notices */}
      {policy.noticeRequired && policy.minNoticeDays > 0 && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm border border-amber-200 dark:border-amber-800">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>Minimum <strong>{policy.minNoticeDays} day(s)</strong> advance notice required.</span>
        </div>
      )}
      {!policy.approvalRequired && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm border border-green-200 dark:border-green-800">
          <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
          <span>WFH is <strong>auto-approved</strong> under your policy.</span>
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3 pb-4">
        <Button variant="outline" className="flex-1" onClick={() => router.push("/employee/my-leaves")}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={handleSubmit}
          disabled={submitting || totalDays <= 0 || !reason.trim()}
        >
          {submitting && <WeaveSpinner className="animate-spin mr-2" size={15} />}
          {submitting ? "Submitting…" : `Submit${totalDays > 0 ? ` (${totalDays} day${totalDays !== 1 ? "s" : ""})` : ""}`}
        </Button>
      </div>
    </div>
  );
}
