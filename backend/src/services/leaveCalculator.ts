import type { WorkingSchedule, SaturdayRule } from '@prisma/client';

// ── Day utilities ─────────────────────────────────────────────────────────────

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
type DayName = (typeof DAY_NAMES)[number];

function getDayName(jsDay: number): DayName {
  return DAY_NAMES[jsDay] as DayName;
}

/**
 * Returns which occurrence of Saturday within the month the given date is.
 * e.g. the 6th = 1st Saturday, 13th = 2nd, 20th = 3rd, 27th = 4th
 */
function getSaturdayOccurrence(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

function isSaturdayWorking(date: Date, rule: SaturdayRule): boolean {
  switch (rule) {
    case 'NONE': return false;
    case 'ALL': return true;
    case 'FIRST': return getSaturdayOccurrence(date) === 1;
    case 'SECOND': return getSaturdayOccurrence(date) === 2;
    case 'THIRD': return getSaturdayOccurrence(date) === 3;
    case 'FOURTH': return getSaturdayOccurrence(date) === 4;
    case 'FIRST_THIRD': return getSaturdayOccurrence(date) === 1 || getSaturdayOccurrence(date) === 3;
    case 'SECOND_FOURTH': return getSaturdayOccurrence(date) === 2 || getSaturdayOccurrence(date) === 4;
    default: return false;
  }
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Core: is a date a working day? ───────────────────────────────────────────

/**
 * Returns true if `date` is a working day for the employee:
 *  - Not a public holiday
 *  - In workingDays array (Mon-Fri, Sunday) OR is a working Saturday per saturdayRule
 *
 * When schedule is null (no schedule configured), assumes Mon-Fri as defaults.
 */
export function isWorkingDay(
  date: Date,
  schedule: WorkingSchedule | null,
  holidays: Date[]
): boolean {
  // Normalize to midnight local time for consistent comparisons
  const dateStr = toDateString(date);

  // Public holiday check
  const isHoliday = holidays.some((h) => toDateString(h) === dateStr);
  if (isHoliday) return false;

  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon ... 6=Sat

  if (!schedule) {
    // Default: Mon-Fri working, weekends off
    return dayOfWeek >= 1 && dayOfWeek <= 5;
  }

  if (dayOfWeek === 6) {
    // Saturday: governed by saturdayRule
    return isSaturdayWorking(date, schedule.saturdayRule);
  }

  const dayName = getDayName(dayOfWeek);
  return schedule.workingDays.includes(dayName);
}

// ── Count working days in a range ────────────────────────────────────────────

/**
 * Counts working days between fromDate and toDate (inclusive).
 * Skips non-working days and public holidays.
 * Returns 0.5 for half-day requests.
 */
export function calculateLeaveDays(
  fromDate: Date,
  toDate: Date,
  schedule: WorkingSchedule | null,
  holidays: Date[],
  isHalfDay = false
): number {
  if (isHalfDay) return 0.5;

  let count = 0;
  const current = new Date(fromDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    if (isWorkingDay(current, schedule, holidays)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Returns all working dates (as Date objects) in the range [fromDate, toDate].
 */
export function getWorkingDatesInRange(
  fromDate: Date,
  toDate: Date,
  schedule: WorkingSchedule | null,
  holidays: Date[]
): Date[] {
  const result: Date[] = [];
  const current = new Date(fromDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    if (isWorkingDay(current, schedule, holidays)) {
      result.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return result;
}

/**
 * Pro-rates the annual leave allowance for the employee's joining year.
 *
 * Rules:
 *  - Only pro-rates in the calendar year the employee joined.
 *  - The joining month is counted in full (e.g. joins May 18 → May counts).
 *  - Result is rounded to the nearest 0.5 day.
 *  - Returns the full allowance for all subsequent years.
 *
 * Examples (12 days/year):
 *   Jan join → 12 days   May join → 8 days   Dec join → 1 day
 */
export function calculateProRatedDays(
  daysAllowed: number,
  dateOfJoining: Date | null,
  year: number
): number {
  if (!dateOfJoining) return daysAllowed;

  const joiningYear = dateOfJoining.getFullYear();
  if (joiningYear !== year) return daysAllowed;

  const joiningMonth  = dateOfJoining.getMonth() + 1; // 1 = Jan … 12 = Dec
  const remainingMonths = 13 - joiningMonth;           // joining month is counted fully

  const proRated = (remainingMonths / 12) * daysAllowed;
  return Math.round(proRated * 2) / 2; // round to nearest 0.5
}

/**
 * Checks if a given date is within the employee's probation period.
 * dateOfJoining + probationMonths = probation end date.
 */
export function isDuringProbation(
  checkDate: Date,
  dateOfJoining: Date,
  probationMonths: number
): boolean {
  if (probationMonths <= 0) return false;
  const probationEnd = new Date(dateOfJoining);
  probationEnd.setMonth(probationEnd.getMonth() + probationMonths);
  return checkDate >= dateOfJoining && checkDate <= probationEnd;
}
