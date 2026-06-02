import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { LeaveStatus, WfhStatus } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(dateStr?: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

export function toInputDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── Status badge helpers ──────────────────────────────────────────────────────

type StatusVariant = "success" | "warning" | "destructive" | "gray" | "default";

export function leaveStatusVariant(status: LeaveStatus): StatusVariant {
  switch (status) {
    case "APPROVED": return "success";
    case "PENDING": return "warning";
    case "REJECTED": return "destructive";
    case "ABSENT": return "destructive";
    case "CANCELLED": return "gray";
    default: return "default";
  }
}

export function wfhStatusVariant(status: WfhStatus): StatusVariant {
  switch (status) {
    case "APPROVED": return "success";
    case "PENDING": return "warning";
    case "REJECTED": return "destructive";
    case "CANCELLED": return "gray";
    default: return "default";
  }
}

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  SICK: "Sick Leave",
  TRANSPORT_WEATHER: "Transport / Weather",
  PERSONAL: "Personal Leave",
};

// ── Client-side leave day calculator ─────────────────────────────────────────
// Mirrors backend/src/services/leaveCalculator.ts for live preview

const DAY_KEYS = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"] as const;

function isSaturdayWorkingClient(date: Date, rule: string): boolean {
  const n = Math.ceil(date.getDate() / 7);
  switch (rule) {
    case "NONE": return false;
    case "ALL": return true;
    case "FIRST": return n === 1;
    case "SECOND": return n === 2;
    case "THIRD": return n === 3;
    case "FOURTH": return n === 4;
    case "FIRST_THIRD": return n === 1 || n === 3;
    case "SECOND_FOURTH": return n === 2 || n === 4;
    default: return false;
  }
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isWorkingDayClient(
  date: Date,
  workingDays: string[],
  saturdayRule: string,
  holidays: string[]
): boolean {
  if (holidays.includes(dateKey(date))) return false;
  const dow = date.getDay();
  if (dow === 6) return isSaturdayWorkingClient(date, saturdayRule);
  const name = DAY_KEYS[dow] ?? "MONDAY";
  return workingDays.includes(name);
}

export function calculateLeaveDaysClient(
  from: Date,
  to: Date,
  workingDays: string[],
  saturdayRule: string,
  holidays: string[],
  isHalfDay = false
): number {
  if (isHalfDay) return 0.5;
  let count = 0;
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  while (cur <= end) {
    if (isWorkingDayClient(cur, workingDays, saturdayRule, holidays)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
