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
  isUnpaid?: boolean;
  holidayName?: string;
  lateMinutes?: number;
  lateSource?: string;
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
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  wfhDays: number;
  attendancePct: number;
  leaveBreakdown: { type: string; label: string; days: number; paidDays: number; unpaidDays: number }[];
  days: DayRecord[]; // day-level breakdown (used by calendar view)
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  GENERAL: 'Annual Leave', SICK: 'Sick Leave',
  TRANSPORT_WEATHER: 'Transport/Weather', PERSONAL: 'Personal Leave',
};

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Internal structure for each leave day in the map
interface LeaveDayInfo {
  leaveType: string;
  weight: number; // 0.5 for half-day, 1.0 for full day
  isUnpaid: boolean;
  paidDays: number | null;
  unpaidDays: number | null;
  totalLeaveDays: number; // total days for this leave record
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

  if (employee.dateOfJoining && employee.dateOfJoining > monthEnd) return null;

  const effectiveStart =
    employee.dateOfJoining && employee.dateOfJoining > monthStart
      ? new Date(employee.dateOfJoining)
      : new Date(monthStart);
  effectiveStart.setHours(0, 0, 0, 0);

  const [holidays, approvedLeaves, absentRecords, approvedWfh, lateRecords] = await Promise.all([
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
      select: {
        id: true, leaveType: true, fromDate: true, toDate: true,
        isHalfDay: true, totalDays: true, isUnpaid: true,
        paidDays: true, unpaidDays: true,
      },
    }),
    prisma.absentRecord.findMany({
      where: { employeeId, date: { gte: effectiveStart, lte: monthEnd } },
    }),
    prisma.wfhApplication.findMany({
      where: {
        employeeId,
        status: 'APPROVED',
        // Use overlap query: WFH that starts before monthEnd AND ends after effectiveStart
        date: { lte: monthEnd },
        OR: [
          { toDate: { gte: effectiveStart } },
          { toDate: null, date: { gte: effectiveStart } },
        ],
      },
      select: { id: true, date: true, toDate: true, isHalfDay: true, totalDays: true },
    }),
    prisma.lateRecord.findMany({
      where: { employeeId, date: { gte: monthStart, lte: monthEnd } },
      select: { date: true, lateMinutes: true, source: true },
    }),
  ]);

  const lateMap = new Map(lateRecords.map((r) => [toYMD(r.date), { lateMinutes: r.lateMinutes, source: r.source }]));

  const holidayDates = holidays.map((h) => h.date);
  const holidayMap = new Map(holidays.map((h) => [toYMD(h.date), h.name]));

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const todayStr = toYMD(new Date());

  const statEnd = monthEnd < today ? monthEnd : today;

  const allWorkingDates = getWorkingDatesInRange(effectiveStart, monthEnd, employee.workingSchedule, holidayDates);
  const allWorkingDateStrs = new Set(allWorkingDates.map(toYMD));

  const pastWorkingDates = getWorkingDatesInRange(effectiveStart, statEnd, employee.workingSchedule, holidayDates);
  const pastWorkingDateStrs = new Set(pastWorkingDates.map(toYMD));

  // ── Build leave day map — correctly weighted for half-days ────────────────
  const leaveDayMap = new Map<string, LeaveDayInfo>();
  for (const leave of approvedLeaves) {
    const lFrom = leave.fromDate < effectiveStart ? effectiveStart : leave.fromDate;
    const lTo   = leave.toDate   > statEnd        ? statEnd        : leave.toDate;
    const cur   = new Date(lFrom);
    cur.setHours(0, 0, 0, 0);

    // Half-day leaves span exactly 1 day with weight 0.5
    // Full-day leaves: each working day in range gets weight 1.0
    const weight = leave.isHalfDay ? 0.5 : 1.0;

    while (cur <= lTo) {
      const ds = toYMD(cur);
      if (pastWorkingDateStrs.has(ds)) {
        leaveDayMap.set(ds, {
          leaveType:      leave.leaveType as string,
          weight,
          isUnpaid:       leave.isUnpaid,
          paidDays:       leave.paidDays,
          unpaidDays:     leave.unpaidDays,
          totalLeaveDays: leave.totalDays,
        });
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  // ── Aggregate counts — sum weights, not map size ──────────────────────────
  let leaveDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;

  leaveDayMap.forEach((info) => {
    leaveDays += info.weight;

    // Determine paid/unpaid split for this day's weight
    if (info.paidDays !== null && info.unpaidDays !== null) {
      const total = info.paidDays + info.unpaidDays;
      if (total > 0) {
        paidLeaveDays   += info.weight * (info.paidDays   / total);
        unpaidLeaveDays += info.weight * (info.unpaidDays / total);
      } else {
        paidLeaveDays += info.weight;
      }
    } else if (info.isUnpaid) {
      unpaidLeaveDays += info.weight;
    } else {
      paidLeaveDays += info.weight;
    }
  });

  // Round to 1 decimal place
  leaveDays       = Math.round(leaveDays       * 10) / 10;
  paidLeaveDays   = Math.round(paidLeaveDays   * 10) / 10;
  unpaidLeaveDays = Math.round(unpaidLeaveDays * 10) / 10;

  const absentDaySet = new Set<string>(
    absentRecords
      .filter((r) => pastWorkingDateStrs.has(toYMD(r.date)))
      .map((r) => toYMD(r.date)),
  );

  // Build WFH day map: expand multi-day WFH to all working days, weight 0.5 for half-day
  const wfhDayMap = new Map<string, number>(); // date → weight
  for (const wfh of approvedWfh) {
    const wFrom = wfh.date < effectiveStart ? effectiveStart : wfh.date;
    const wTo   = (wfh.toDate ?? wfh.date) > statEnd ? statEnd : (wfh.toDate ?? wfh.date);
    const weight = wfh.isHalfDay ? 0.5 : 1.0;
    const cur = new Date(wFrom);
    cur.setHours(0, 0, 0, 0);
    while (cur <= wTo) {
      const ds = toYMD(cur);
      if (pastWorkingDateStrs.has(ds)) {
        wfhDayMap.set(ds, weight);
      }
      cur.setDate(cur.getDate() + 1);
    }
  }
  const wfhDaySet = new Set(wfhDayMap.keys());

  const absentDays       = absentDaySet.size;
  let   wfhDays          = 0;
  wfhDayMap.forEach((w) => { wfhDays += w; });
  wfhDays = Math.round(wfhDays * 10) / 10;
  const totalWorkingDays = pastWorkingDates.length;
  const presentDays      = Math.max(0, totalWorkingDays - leaveDays - absentDays);
  const attendancePct    = totalWorkingDays > 0
    ? Math.round((presentDays / totalWorkingDays) * 1000) / 10
    : 100;

  // ── Leave breakdown by type with paid/unpaid split ────────────────────────
  const typeCount = new Map<string, { paid: number; unpaid: number }>();
  leaveDayMap.forEach((info) => {
    const existing = typeCount.get(info.leaveType) ?? { paid: 0, unpaid: 0 };
    if (info.paidDays !== null && info.unpaidDays !== null) {
      const total = info.paidDays + info.unpaidDays;
      if (total > 0) {
        existing.paid   += info.weight * (info.paidDays   / total);
        existing.unpaid += info.weight * (info.unpaidDays / total);
      }
    } else if (info.isUnpaid) {
      existing.unpaid += info.weight;
    } else {
      existing.paid += info.weight;
    }
    typeCount.set(info.leaveType, existing);
  });

  const leaveBreakdown = Array.from(typeCount.entries()).map(([type, counts]) => ({
    type,
    label:      LEAVE_TYPE_LABELS[type] ?? type,
    days:       Math.round((counts.paid + counts.unpaid) * 10) / 10,
    paidDays:   Math.round(counts.paid   * 10) / 10,
    unpaidDays: Math.round(counts.unpaid * 10) / 10,
  }));

  // ── Build day-level records for calendar view (full month) ───────────────
  const days: DayRecord[] = [];
  const cur = new Date(monthStart);
  while (cur <= monthEnd) {
    const ds        = toYMD(cur);
    const isHoliday = holidayMap.has(ds);
    const isWorking = allWorkingDateStrs.has(ds);
    const isFuture  = ds > todayStr;
    const leaveInfo = leaveDayMap.get(ds);
    const isLeave   = !!leaveInfo;
    const isAbsent  = absentDaySet.has(ds);
    const isWfh     = wfhDaySet.has(ds);
    const lateInfo  = lateMap.get(ds);

    let record: DayRecord;
    if (isHoliday) {
      record = { date: ds, status: 'holiday', holidayName: holidayMap.get(ds) };
    } else if (!isWorking) {
      record = { date: ds, status: 'weekend' };
    } else if (isFuture) {
      record = { date: ds, status: 'upcoming' };
    } else if (isLeave) {
      record = { date: ds, status: 'leave', leaveType: leaveInfo.leaveType, isUnpaid: leaveInfo.isUnpaid };
    } else if (isAbsent) {
      record = { date: ds, status: 'absent' };
    } else if (isWfh) {
      record = { date: ds, status: 'wfh' };
    } else {
      record = { date: ds, status: 'present' };
    }

    if (lateInfo && record.status !== 'weekend' && record.status !== 'holiday' && record.status !== 'upcoming') {
      record.lateMinutes = lateInfo.lateMinutes;
      record.lateSource  = lateInfo.source;
    }

    days.push(record);
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
    paidLeaveDays,
    unpaidLeaveDays,
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

  const BATCH_SIZE = 5;
  for (let i = 0; i < employees.length; i += BATCH_SIZE) {
    const batch = employees.slice(i, i + BATCH_SIZE);
    const batchReports = await Promise.all(
      batch.map(async (emp) => {
        const report = await calculateEmployeeMonthReport(emp.id, month, year);
        if (!report) return null;

        await prisma.monthlyReport.upsert({
          where: { employeeId_month_year: { employeeId: emp.id, month, year } },
          create: {
            employeeId:       emp.id,
            month,
            year,
            totalWorkingDays: report.totalWorkingDays,
            presentDays:      report.presentDays,
            leaveDays:        report.leaveDays,
            paidLeaveDays:    report.paidLeaveDays,
            unpaidLeaveDays:  report.unpaidLeaveDays,
            absentDays:       report.absentDays,
            wfhDays:          report.wfhDays,
            attendancePct:    report.attendancePct,
          },
          update: {
            totalWorkingDays: report.totalWorkingDays,
            presentDays:      report.presentDays,
            leaveDays:        report.leaveDays,
            paidLeaveDays:    report.paidLeaveDays,
            unpaidLeaveDays:  report.unpaidLeaveDays,
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
