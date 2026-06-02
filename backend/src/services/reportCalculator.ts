import { prisma } from '../lib/prisma';
import { getWorkingDatesInRange } from './leaveCalculator';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface DayRecord {
  date: string; // YYYY-MM-DD
  status: 'present' | 'leave' | 'absent' | 'wfh' | 'holiday' | 'weekend' | 'upcoming';
  leaveType?: string;
  holidayName?: string;
}

export interface MonthlyReportData {
  employeeId: string;
  employeeIdStr: string;
  fullName: string;
  email: string;
  department: string | null;
  designation: string | null;
  month: number;
  year: number;
  totalWorkingDays: number;
  presentDays: number;
  leaveDays: number;
  absentDays: number;
  wfhDays: number;
  attendancePct: number;
  leaveBreakdown: { type: string; label: string; days: number }[];
  days: DayRecord[]; // day-level breakdown (used by calendar view)
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  GENERAL: 'Annual Leave', SICK: 'Sick Leave',
  TRANSPORT_WEATHER: 'Transport/Weather', PERSONAL: 'Personal Leave',
};

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function calculateEmployeeMonthReport(
  employeeId: string,
  month: number,
  year: number,
): Promise<MonthlyReportData | null> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      user:            { select: { email: true } },
      workingSchedule: true,
    },
  });

  if (!employee || !employee.isActive) return null;

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd   = new Date(year, month, 0, 23, 59, 59, 999);

  // If employee joined after this month entirely, skip
  if (employee.dateOfJoining && employee.dateOfJoining > monthEnd) return null;

  // Effective start: max(monthStart, dateOfJoining)
  const effectiveStart =
    employee.dateOfJoining && employee.dateOfJoining > monthStart
      ? new Date(employee.dateOfJoining)
      : new Date(monthStart);
  effectiveStart.setHours(0, 0, 0, 0);

  // ── Fetch data in parallel ────────────────────────────────────────────────
  const [holidays, approvedLeaves, absentRecords, approvedWfh] = await Promise.all([
    prisma.publicHoliday.findMany({
      where: { date: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.leaveApplication.findMany({
      where: {
        employeeId,
        status: 'APPROVED',
        fromDate: { lte: monthEnd },
        toDate:   { gte: effectiveStart },
      },
    }),
    prisma.absentRecord.findMany({
      where: { employeeId, date: { gte: effectiveStart, lte: monthEnd } },
    }),
    prisma.wfhApplication.findMany({
      where: {
        employeeId,
        status: 'APPROVED',
        date: { gte: effectiveStart, lte: monthEnd },
      },
    }),
  ]);

  const holidayDates = holidays.map((h) => h.date);
  const holidayMap = new Map(holidays.map((h) => [toYMD(h.date), h.name]));

  // Today at end of day — used to distinguish past from future
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const todayStr = toYMD(new Date()); // YYYY-MM-DD

  // Aggregates are capped at today (don't count future days as worked)
  const statEnd = monthEnd < today ? monthEnd : today;

  // All working dates in the month — used for the calendar display
  const allWorkingDates = getWorkingDatesInRange(effectiveStart, monthEnd, employee.workingSchedule, holidayDates);
  const allWorkingDateStrs = new Set(allWorkingDates.map(toYMD));

  // Working dates UP TO TODAY — used for stat calculations only
  const pastWorkingDates = getWorkingDatesInRange(effectiveStart, statEnd, employee.workingSchedule, holidayDates);
  const pastWorkingDateStrs = new Set(pastWorkingDates.map(toYMD));

  // ── Build leave day → leaveType map (only past working days) ─────────────
  const leaveDayMap = new Map<string, string>(); // YYYY-MM-DD → leaveType
  for (const leave of approvedLeaves) {
    const lFrom = leave.fromDate < effectiveStart ? effectiveStart : leave.fromDate;
    const lTo   = leave.toDate   > statEnd        ? statEnd        : leave.toDate;
    const cur   = new Date(lFrom);
    cur.setHours(0, 0, 0, 0);
    while (cur <= lTo) {
      const ds = toYMD(cur);
      if (pastWorkingDateStrs.has(ds)) {
        leaveDayMap.set(ds, leave.leaveType as string);
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  // ── Absent day set (past working days only) ───────────────────────────────
  const absentDaySet = new Set<string>(
    absentRecords
      .filter((r) => pastWorkingDateStrs.has(toYMD(r.date)))
      .map((r) => toYMD(r.date)),
  );

  // ── WFH day set (past working days only) ─────────────────────────────────
  const wfhDaySet = new Set<string>(
    approvedWfh
      .filter((w) => pastWorkingDateStrs.has(toYMD(w.date)))
      .map((w) => toYMD(w.date)),
  );

  // ── Aggregate counts (based on past working days only) ────────────────────
  const leaveDays        = leaveDayMap.size;
  const absentDays       = absentDaySet.size;
  const wfhDays          = wfhDaySet.size;
  const totalWorkingDays = pastWorkingDates.length;
  const presentDays      = Math.max(0, totalWorkingDays - leaveDays - absentDays);
  const attendancePct    = totalWorkingDays > 0
    ? Math.round((presentDays / totalWorkingDays) * 1000) / 10
    : 100;

  // ── Leave breakdown by type ───────────────────────────────────────────────
  const typeCount = new Map<string, number>();
  leaveDayMap.forEach((lt) => typeCount.set(lt, (typeCount.get(lt) ?? 0) + 1));
  const leaveBreakdown = Array.from(typeCount.entries()).map(([type, days]) => ({
    type,
    label: LEAVE_TYPE_LABELS[type] ?? type,
    days,
  }));

  // ── Build day-level records for calendar view (full month) ───────────────
  const days: DayRecord[] = [];
  const cur = new Date(monthStart);
  while (cur <= monthEnd) {
    const ds         = toYMD(cur);
    const isHoliday  = holidayMap.has(ds);
    const isWorking  = allWorkingDateStrs.has(ds);
    const isFuture   = ds > todayStr;          // strictly after today
    const isLeave    = leaveDayMap.has(ds);
    const isAbsent   = absentDaySet.has(ds);
    const isWfh      = wfhDaySet.has(ds);

    if (isHoliday) {
      days.push({ date: ds, status: 'holiday', holidayName: holidayMap.get(ds) });
    } else if (!isWorking) {
      days.push({ date: ds, status: 'weekend' });
    } else if (isFuture) {
      // Working day but hasn't happened yet — show as upcoming (not present)
      days.push({ date: ds, status: 'upcoming' });
    } else if (isLeave) {
      days.push({ date: ds, status: 'leave', leaveType: leaveDayMap.get(ds) });
    } else if (isAbsent) {
      days.push({ date: ds, status: 'absent' });
    } else if (isWfh) {
      days.push({ date: ds, status: 'wfh' });
    } else {
      days.push({ date: ds, status: 'present' });
    }

    cur.setDate(cur.getDate() + 1);
  }

  return {
    employeeId,
    employeeIdStr: employee.employeeId,
    fullName:      employee.fullName,
    email:         (employee.user as any)?.email ?? '',
    department:    employee.department,
    designation:   employee.designation,
    month,
    year,
    totalWorkingDays,
    presentDays,
    leaveDays,
    absentDays,
    wfhDays,
    attendancePct,
    leaveBreakdown,
    days,
  };
}

export async function generateAndSaveAllMonthlyReports(
  month: number,
  year: number,
): Promise<MonthlyReportData[]> {
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  const reports: MonthlyReportData[] = [];

  // Process in batches to bound DB concurrency (avoid exhausting the connection pool)
  const BATCH_SIZE = 5;
  for (let i = 0; i < employees.length; i += BATCH_SIZE) {
    const batch = employees.slice(i, i + BATCH_SIZE);
    const batchReports = await Promise.all(
      batch.map(async (emp) => {
        const report = await calculateEmployeeMonthReport(emp.id, month, year);
        if (!report) return null;

        // Upsert into MonthlyReport table for permanent history
        await prisma.monthlyReport.upsert({
          where: { employeeId_month_year: { employeeId: emp.id, month, year } },
          create: {
            employeeId:       emp.id,
            month,
            year,
            totalWorkingDays: report.totalWorkingDays,
            presentDays:      report.presentDays,
            leaveDays:        report.leaveDays,
            absentDays:       report.absentDays,
            wfhDays:          report.wfhDays,
            attendancePct:    report.attendancePct,
          },
          update: {
            totalWorkingDays: report.totalWorkingDays,
            presentDays:      report.presentDays,
            leaveDays:        report.leaveDays,
            absentDays:       report.absentDays,
            wfhDays:          report.wfhDays,
            attendancePct:    report.attendancePct,
            generatedAt:      new Date(),
          },
        });

        return report;
      })
    );
    reports.push(...batchReports.filter((r): r is MonthlyReportData => r !== null));
  }

  return reports;
}
