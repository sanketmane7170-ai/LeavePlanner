"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { toast } from "sonner";
import {
  CalendarDays,
  AlertTriangle,
  CheckCircle2, 
  Info,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { differenceInDays, startOfDay, addMonths } from "date-fns";
import api from "@/lib/api";
import {
  calculateLeaveDaysClient,
  LEAVE_TYPE_LABELS,
  formatDate,
} from "@/lib/utils";
import type { LeaveBalance, LeavePolicy, WorkingSchedule } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";



// ── Types ─────────────────────────────────────────────────────────────────────
interface BalanceContext {
  balances: LeaveBalance[];
  employee: {
    id: string;
    dateOfJoining?: string;
    probationMonths: number;
    leavePolicy: LeavePolicy | null;
    workingSchedule: WorkingSchedule | null;
    policyExceptions: { blackoutFrom: string; blackoutTo: string }[];
  };
  holidays: { id: string; name: string; date: string }[];
}

// ── Half-day slot toggle ──────────────────────────────────────────────────────
function SlotButton({
  value,
  label,
  selected,
  onClick,
}: {
  value: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
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

// ── Balance pill ──────────────────────────────────────────────────────────────
function BalancePill({ balance }: { balance: LeaveBalance | undefined }) {
  if (!balance) return null;
  const pct = balance.totalDays > 0 ? (balance.remainingDays / balance.totalDays) * 100 : 0;
  const color =
    pct > 50 ? "bg-green-500" : pct > 20 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
      <div className="flex-1">
        <p className="text-xs text-slate-500 dark:text-slate-400">Remaining balance</p>
        <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
          {balance.remainingDays}{" "}
          <span className="text-sm font-normal text-slate-500">of {balance.totalDays} days</span>
        </p>
        <div className="mt-1.5 h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-slate-500 dark:text-slate-400">Used</p>
        <p className="font-semibold text-slate-700 dark:text-slate-300">{balance.usedDays} days</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ApplyLeavePage() {
  const router = useRouter();
  const [ctx, setCtx] = useState<BalanceContext | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedLeaveType, setSelectedLeaveType] = useState<string>("SICK");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDaySlot, setHalfDaySlot] = useState<"FIRST_HALF" | "SECOND_HALF">("FIRST_HALF");
  const [range, setRange] = useState<DateRange | undefined>();
  const [singleDate, setSingleDate] = useState<Date | undefined>();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Warnings state
  const [warningType, setWarningType] = useState<"NOTICE" | "BALANCE" | "PROBATION" | "BLACKOUT" | "AUTO_APPROVED" | "ALL_GOOD" | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    api
      .get("/employee/leaves/balances")
      .then((r) => {
        setCtx(r.data);
        const lt = r.data?.employee?.leavePolicy?.leaveType;
        setSelectedLeaveType(lt && lt !== "GENERAL" ? lt : "SICK");
      })
      .catch(() => toast.error("Failed to load leave data"))
      .finally(() => setLoading(false));
  }, []);

  // Derived helpers
  const policy = ctx?.employee.leavePolicy ?? null;
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

  const policyLeaveType = policy?.leaveType;
  const isGeneralPolicy = policyLeaveType === "GENERAL";
  // For GENERAL policy the balance pool key is always "GENERAL"; specific policies use their own type
  const currentBalance = ctx?.balances.find((b) => b.leaveType === policyLeaveType);

  // Live day count
  const totalDays = useMemo(() => {
    if (isHalfDay && singleDate) return 0.5;
    if (!isHalfDay && range?.from) {
      const to = range.to ?? range.from;
      return calculateLeaveDaysClient(range.from, to, workingDays, saturdayRule, holidayDates, false);
    }
    return 0;
  }, [isHalfDay, singleDate, range, workingDays, saturdayRule, holidayDates]);

  // Disabled days for the picker: past dates + holidays
  const disabledDays = [{ before: new Date() }];

  const handleInitialSubmit = () => {
    if (!policy) return;

    const fromDate = isHalfDay ? singleDate : range?.from;
    const toDate   = isHalfDay ? singleDate : (range?.to ?? range?.from);

    if (!fromDate || !toDate) { toast.error("Please select a date"); return; }
    if (!reason.trim()) { toast.error("Please provide a reason"); return; }
    if (totalDays <= 0) { toast.error("No working days selected"); return; }

    // 1. Probation check
    if (ctx?.employee.dateOfJoining && policy.probationRule === "NO_LEAVES") {
      const joiningDate = new Date(ctx.employee.dateOfJoining);
      const probationEnd = addMonths(joiningDate, ctx.employee.probationMonths);
      if (fromDate < probationEnd) {
        setWarningType("PROBATION");
        setShowWarning(true);
        return;
      }
    }

    // 2. Blackout dates check
    if (ctx?.employee.policyExceptions) {
      for (const ex of ctx.employee.policyExceptions) {
        const bFrom = startOfDay(new Date(ex.blackoutFrom));
        const bTo = startOfDay(new Date(ex.blackoutTo));
        const lFrom = startOfDay(fromDate);
        const lTo = startOfDay(toDate);
        if (lFrom <= bTo && lTo >= bFrom) {
          setWarningType("BLACKOUT");
          setShowWarning(true);
          return;
        }
      }
    }

    // 3. Balance check
    if (currentBalance && currentBalance.remainingDays < totalDays) {
      setWarningType("BALANCE");
      setShowWarning(true);
      return;
    }

    // 4. Notice period check
    if (policy.noticeRequired && policy.minNoticeDays > 0) {
      const today = startOfDay(new Date());
      const start = startOfDay(fromDate);
      const daysNotice = differenceInDays(start, today);

      if (daysNotice < policy.minNoticeDays) {
        setWarningType("NOTICE");
        setShowWarning(true);
        return;
      }
    }

    // Positive paths
    if (!policy.approvalRequired) {
      setWarningType("AUTO_APPROVED");
      setShowWarning(true);
      return;
    }

    setWarningType("ALL_GOOD");
    setShowWarning(true);
  };

  const executeSubmit = async () => {
    if (!policy) return;
    const fromDate = isHalfDay ? singleDate : range?.from;
    const toDate = isHalfDay ? singleDate : (range?.to ?? range?.from);

    if (!fromDate) return;

    setSubmitting(true);
    setShowWarning(false);
    try {
      const res = await api.post("/employee/leaves/apply", {
        leaveType: selectedLeaveType,
        fromDate: fromDate.toISOString(),
        toDate: (toDate ?? fromDate).toISOString(),
        isHalfDay,
        halfDaySlot: isHalfDay ? halfDaySlot : undefined,
        reason: reason.trim(),
      });
      toast.success(res.data.message);
      router.push("/employee/my-leaves");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to submit leave application");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
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
          No Leave Policy Assigned
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
          Your account doesn&apos;t have a leave policy yet. Please ask your administrator to assign one.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-heading font-bold text-slate-900 dark:text-white">
          Apply for Leave
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Submit a new leave request
        </p>
      </div>

      {/* Leave type + balance */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        {/* Policy info row */}
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/20">
          <CalendarDays size={18} className="text-primary shrink-0" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{policy.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {policy.daysAllowed} days / year
              {policy.approvalRequired ? " · Requires approval" : " · Auto-approved"}
            </p>
          </div>
        </div>

        {/* Leave type selector — shown only for GENERAL (all-types) policies */}
        {isGeneralPolicy ? (
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              Select Leave Type
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "SICK", label: "Sick Leave" },
                { value: "PERSONAL", label: "Personal" },
                { value: "TRANSPORT_WEATHER", label: "Transport / Weather" },
              ].map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setSelectedLeaveType(t.value)}
                  className={cn(
                    "py-2.5 px-2 rounded-xl text-xs font-medium border-2 transition-all text-center leading-tight",
                    selectedLeaveType === t.value
                      ? "border-primary bg-primary text-white"
                      : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary/40 hover:bg-primary/5"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              Leave Type
            </p>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {LEAVE_TYPE_LABELS[policyLeaveType ?? ""] ?? policyLeaveType}
              </span>
            </div>
          </div>
        )}

        <BalancePill balance={currentBalance} />
      </div>

      {/* Half-day toggle */}
      {policy.halfDayAllowed && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-medium text-slate-900 dark:text-white">Half Day</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Deducts 0.5 days from your balance
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsHalfDay((v) => !v);
                setRange(undefined);
                setSingleDate(undefined);
              }}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40",
                isHalfDay ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                  isHalfDay ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </button>
          </div>

          {isHalfDay && (
            <div className="flex gap-2 mt-2">
              <SlotButton
                value="FIRST_HALF"
                label="First Half"
                selected={halfDaySlot === "FIRST_HALF"}
                onClick={() => setHalfDaySlot("FIRST_HALF")}
              />
              <SlotButton
                value="SECOND_HALF"
                label="Second Half"
                selected={halfDaySlot === "SECOND_HALF"}
                onClick={() => setHalfDaySlot("SECOND_HALF")}
              />
            </div>
          )}
        </div>
      )}

      {/* Date picker */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          {isHalfDay ? "Select Date" : "Select Date Range"}
        </p>

        <div className="flex justify-center overflow-x-auto">
          {isHalfDay ? (
            <DayPicker
              mode="single"
              selected={singleDate}
              onSelect={setSingleDate}
              disabled={disabledDays}
              modifiers={{ holiday: holidayDateObjects }}
              modifiersClassNames={{ holiday: "rdp-day_holiday" }}
              showOutsideDays
            />
          ) : (
            <DayPicker
              mode="range"
              selected={range}
              onSelect={setRange}
              disabled={disabledDays}
              modifiers={{ holiday: holidayDateObjects }}
              modifiersClassNames={{ holiday: "rdp-day_holiday" }}
              numberOfMonths={1}
              showOutsideDays
            />
          )}
        </div>

        {/* Holidays legend */}
        {holidayDateObjects.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="w-3 h-3 rounded-sm bg-amber-100 dark:bg-amber-900/30 border border-amber-300" />
            <span>Public holiday (excluded from count)</span>
          </div>
        )}

        {/* Selected summary */}
        {(range?.from || singleDate) && (
          <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm">
            <div className="flex items-center justify-between">
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
          </div>
        )}

        {/* Upcoming holidays notice */}
        {ctx?.holidays.slice(0, 3).map((h) => {
          const d = new Date(h.date);
          const from = isHalfDay ? singleDate : range?.from;
          const to = isHalfDay ? singleDate : range?.to ?? range?.from;
          if (from && to && d >= from && d <= to) {
            return (
              <div key={h.id} className="mt-2 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-xl">
                <Info size={13} />
                <span>{h.name} ({formatDate(h.date)}) is excluded from the count</span>
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
          placeholder="Brief reason for leave (e.g. Medical appointment, Family event…)"
          maxLength={500}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <p className="text-xs text-slate-400 mt-1 text-right">{reason.length}/500</p>
      </div>

      {/* Policy info banners */}
      {policy.noticeRequired && policy.minNoticeDays > 0 && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm border border-amber-200 dark:border-amber-800">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>This policy requires at least <strong>{policy.minNoticeDays} day(s)</strong> advance notice.</span>
        </div>
      )}

      {!policy.approvalRequired && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm border border-green-200 dark:border-green-800">
          <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
          <span>This leave type is <strong>auto-approved</strong> — it will be approved immediately upon submission.</span>
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3 pb-4">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => router.push("/employee/my-leaves")}
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={handleInitialSubmit}
          disabled={submitting || totalDays <= 0 || !reason.trim()}
        >
          {submitting && <WeaveSpinner className="animate-spin mr-2" size={15} />}
          {submitting ? "Submitting…" : `Submit ${totalDays > 0 ? `(${totalDays} day${totalDays !== 1 ? "s" : ""})` : ""}`}
        </Button>
      </div>

      {/* Warning/Confirmation Dialog */}
      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={cn("flex items-center gap-2", 
              (warningType === "AUTO_APPROVED" || warningType === "ALL_GOOD") ? "text-green-600" : "text-amber-600"
            )}>
              {(warningType === "AUTO_APPROVED" || warningType === "ALL_GOOD") ? <ThumbsUp size={20} /> : <AlertTriangle size={20} />}
              {(warningType === "AUTO_APPROVED" || warningType === "ALL_GOOD") ? "Confirmation" : "Warning"}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-700 dark:text-slate-300 mt-4 leading-relaxed whitespace-pre-wrap">
              {warningType === "PROBATION" && (
                <>
                  You are currently in your probation period.{'\n\n'}
                  This leave policy restricts leaves during probation. There are high chances that this leave will get rejected.{'\n'}
                  Are you sure you want to apply?
                </>
              )}
              {warningType === "BLACKOUT" && (
                <>
                  Your selected dates fall within a restricted blackout period.{'\n\n'}
                  There are high chances that this leave will get rejected.{'\n'}
                  Are you sure you want to apply?
                </>
              )}
              {warningType === "NOTICE" && (
                <>
                  Are you sure you want to apply? You are applying too late!{'\n\n'}
                  As per policy, you should apply minimum <strong>{policy?.minNoticeDays} days</strong> before.{'\n'}
                  There are high chances that this leave will get rejected.
                </>
              )}
              {warningType === "BALANCE" && (
                <>
                  You don't have enough leave balance!{'\n\n'}
                  Your remaining balance is <strong>{currentBalance?.remainingDays ?? 0} days</strong>.{'\n'}
                  There are high chances that this leave will get rejected, or it will be marked as unpaid leave.{'\n'}
                  Are you sure you want to apply?
                </>
              )}
              {warningType === "AUTO_APPROVED" && (
                <>
                  Great news!{'\n\n'}
                  This leave type does not require admin approval and will be <strong>auto-approved instantly</strong>.{'\n'}
                  Are you sure you want to submit?
                </>
              )}
              {warningType === "ALL_GOOD" && (
                <>
                  Everything looks good!{'\n\n'}
                  You have plenty of balance (<strong>{Math.max(0, (currentBalance?.remainingDays ?? 0) - totalDays)} days left</strong> after this leave) and you've applied well within the notice period.{'\n'}
                  Are you sure you want to submit?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex sm:justify-end gap-3">
            <Button variant="outline" onClick={() => setShowWarning(false)}>
              No, Cancel
            </Button>
            <Button onClick={executeSubmit} disabled={submitting}>
              {submitting && <WeaveSpinner className="animate-spin mr-2" size={15} />}
              {(warningType === "AUTO_APPROVED" || warningType === "ALL_GOOD") ? "Yes, Submit Leave" : "Yes, Apply Anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
