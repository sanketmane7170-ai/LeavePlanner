import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/authenticate';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDOW(date: Date): string {
  return ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][date.getDay()];
}

function getSaturdayCount(date: Date): number {
  let count = 0;
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  while (d <= date) {
    if (d.getDay() === 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function isDayWorking(date: Date, workingDays: string[], saturdayRule: string): boolean {
  const dow = getDOW(date);
  if (dow === 'SATURDAY') {
    switch (saturdayRule) {
      case 'NONE':          return false;
      case 'ALL':           return true;
      case 'FIRST':         return getSaturdayCount(date) === 1;
      case 'SECOND':        return getSaturdayCount(date) === 2;
      case 'THIRD':         return getSaturdayCount(date) === 3;
      case 'FOURTH':        return getSaturdayCount(date) === 4;
      case 'FIRST_THIRD':   return [1,3].includes(getSaturdayCount(date));
      case 'SECOND_FOURTH': return [2,4].includes(getSaturdayCount(date));
      default:              return false;
    }
  }
  return workingDays.includes(dow);
}

// Status codes used in the muster grid
// U  = Unpaid leave (fully unpaid approved leave)
// SD = Swap Day absent (employee missed work, compensation pending)
// SC = Swap Compensation Day (the makeup day — employee should work this day)
// NC = No Check-In (FROM_CHECKIN mode: working day but no check-in recorded)
export type MusterStatus = 'P' | 'A' | 'L' | 'U' | 'HD' | 'WFH' | 'WO' | 'H' | '-' | '·' | 'SD' | 'SC' | 'NC';

// ── GET /api/admin/attendance/muster ─────────────────────────────────────────
export const getMuster = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const month      = Math.min(12, Math.max(1, parseInt((req.query.month as string) || String(new Date().getMonth() + 1))));
    const year       = parseInt((req.query.year as string) || String(new Date().getFullYear()));
    const department = (req.query.department as string) || undefined;
    const search     = (req.query.search as string) || undefined;
    const page       = Math.max(1, parseInt((req.query.page as string) || '1'));
    const limit      = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || '20')));
    const exportAll  = req.query.export === 'true';

    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStart  = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd    = new Date(year, month - 1, daysInMonth, 23, 59, 59, 999);
    const today       = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr    = toYMD(today);

    // ── Fetch employees ────────────────────────────────────────────────────
    const empWhere: Record<string, any> = { isActive: true };
    if (department) empWhere.department = department;
    if (search) {
      empWhere.OR = [
        { fullName:   { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [employeeRows, totalEmployees] = await Promise.all([
      prisma.employee.findMany({
        where: empWhere,
        include: { workingSchedule: { select: { workingDays: true, saturdayRule: true } } },
        orderBy: { fullName: 'asc' },
        ...(exportAll ? {} : { skip: (page - 1) * limit, take: limit }),
      }),
      prisma.employee.count({ where: empWhere }),
    ]);

    const employeeIds = employeeRows.map((e) => e.id);

    // ── Batch-fetch all attendance data for this month ─────────────────────
    const [leaves, wfhApps, absentRecords, holidays, corrections, swapDays, swapCompDays, lateRecords, checkInRecords, orgSettings] = await Promise.all([
      prisma.leaveApplication.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: { in: ['APPROVED', 'ABSENT'] },
          fromDate: { lte: monthEnd },
          toDate:   { gte: monthStart },
        },
        select: { employeeId: true, fromDate: true, toDate: true, isHalfDay: true, status: true, leaveType: true, isUnpaid: true, paidDays: true, unpaidDays: true },
      }),
      prisma.wfhApplication.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          date: { gte: monthStart, lte: monthEnd },
        },
        select: { employeeId: true, date: true, toDate: true, isHalfDay: true },
      }),
      prisma.absentRecord.findMany({
        where: {
          employeeId: { in: employeeIds },
          date: { gte: monthStart, lte: monthEnd },
        },
        select: { employeeId: true, date: true },
      }),
      prisma.publicHoliday.findMany({
        where: { year, date: { gte: monthStart, lte: monthEnd } },
        select: { date: true, name: true },
      }),
      prisma.attendanceCorrection.findMany({
        where: {
          employeeId: { in: employeeIds },
          date: { gte: monthStart, lte: monthEnd },
        },
        select: { id: true, employeeId: true, date: true, correctedStatus: true, originalStatus: true, reason: true },
      }),
      // SD: absent dates of pending swap days in this month
      prisma.swapDay.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: 'PENDING_COMPENSATION',
          absentDate: { gte: monthStart, lte: monthEnd },
        },
        select: { employeeId: true, absentDate: true, compensationDate: true, deadline: true },
      }),
      // SC: compensation dates that fall in this month (from ANY month's absent date)
      prisma.swapDay.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: 'PENDING_COMPENSATION',
          compensationDate: { gte: monthStart, lte: monthEnd },
        },
        select: { employeeId: true, absentDate: true, compensationDate: true },
      }),
      // Late records for this month
      prisma.lateRecord.findMany({
        where: {
          employeeId: { in: employeeIds },
          date: { gte: monthStart, lte: monthEnd },
        },
        select: { employeeId: true, date: true, lateMinutes: true, source: true },
      }),
      // CheckIn records for FROM_CHECKIN mode
      (prisma as any).checkInRecord.findMany({
        where: {
          employeeId: { in: employeeIds },
          date: { gte: toYMD(monthStart), lte: toYMD(monthEnd) },
        },
        select: { employeeId: true, date: true, status: true },
      }),
      prisma.orgSettings.findUnique({ where: { id: 'global' } }),
    ]);

    const attendanceMode = (orgSettings as any)?.attendanceMode ?? 'AUTO_PRESENT';

    const holidaySet = new Set(holidays.map((h) => toYMD(h.date)));

    // Group corrections by employee → dateStr
    const correctionsByEmp = new Map<string, Map<string, typeof corrections[0]>>();
    for (const c of corrections) {
      if (!correctionsByEmp.has(c.employeeId)) correctionsByEmp.set(c.employeeId, new Map());
      correctionsByEmp.get(c.employeeId)!.set(toYMD(c.date), c);
    }

    // Group by employee
    const leavesByEmp      = new Map<string, typeof leaves>();
    const wfhByEmp         = new Map<string, typeof wfhApps>();
    const absentByEmp      = new Map<string, typeof absentRecords>();
    const swapDaysByEmp    = new Map<string, typeof swapDays>();
    const swapCompByEmp    = new Map<string, typeof swapCompDays>();
    const lateByEmp        = new Map<string, typeof lateRecords>();
    const checkInByEmp     = new Map<string, Set<string>>(); // employeeId → Set<dateStr>

    for (const l of leaves) {
      if (!leavesByEmp.has(l.employeeId)) leavesByEmp.set(l.employeeId, []);
      leavesByEmp.get(l.employeeId)!.push(l);
    }
    for (const w of wfhApps) {
      if (!wfhByEmp.has(w.employeeId)) wfhByEmp.set(w.employeeId, []);
      wfhByEmp.get(w.employeeId)!.push(w);
    }
    for (const a of absentRecords) {
      if (!absentByEmp.has(a.employeeId)) absentByEmp.set(a.employeeId, []);
      absentByEmp.get(a.employeeId)!.push(a);
    }
    for (const s of swapDays) {
      if (!swapDaysByEmp.has(s.employeeId)) swapDaysByEmp.set(s.employeeId, []);
      swapDaysByEmp.get(s.employeeId)!.push(s);
    }
    for (const s of swapCompDays) {
      if (!swapCompByEmp.has(s.employeeId)) swapCompByEmp.set(s.employeeId, []);
      swapCompByEmp.get(s.employeeId)!.push(s);
    }
    for (const lr of lateRecords) {
      if (!lateByEmp.has(lr.employeeId)) lateByEmp.set(lr.employeeId, []);
      lateByEmp.get(lr.employeeId)!.push(lr);
    }
    for (const ci of checkInRecords) {
      if (!checkInByEmp.has(ci.employeeId)) checkInByEmp.set(ci.employeeId, new Set());
      checkInByEmp.get(ci.employeeId)!.add(typeof ci.date === 'string' ? ci.date : toYMD(new Date(ci.date)));
    }

    // ── Derive daily attendance per employee ───────────────────────────────
    const employees = employeeRows.map((emp) => {
      const empLeaves      = leavesByEmp.get(emp.id)       ?? [];
      const empWfh         = wfhByEmp.get(emp.id)          ?? [];
      const empAbsents     = absentByEmp.get(emp.id)       ?? [];
      const empSwapDays    = swapDaysByEmp.get(emp.id)     ?? [];
      const empSwapComp    = swapCompByEmp.get(emp.id)     ?? [];
      const empLate        = lateByEmp.get(emp.id)         ?? [];
      const empCheckIns    = checkInByEmp.get(emp.id)      ?? new Set<string>();
      const empCorrections = correctionsByEmp.get(emp.id)  ?? new Map();
      const workingDays    = (emp.workingSchedule?.workingDays ?? ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY']) as string[];
      const saturdayRule   = (emp.workingSchedule?.saturdayRule ?? 'NONE') as string;

      const attendance:  Record<number, MusterStatus>                                 = {};
      const correctionMeta: Record<number, { id: string; originalStatus: string; correctedStatus: string; reason: string | null }> = {};
      const swapDayMeta: Record<number, { compensationDate: string | null; deadline: string | null }> = {};
      const swapCompMeta: Record<number, { absentDate: string }> = {};
      const lateMeta: Record<number, { minutes: number; source: string }> = {};
      let present = 0, absent = 0, leave = 0, unpaidLeave = 0, halfDay = 0, wfh = 0, weekOff = 0, holiday = 0;
      let workingTotal = 0;

      for (let day = 1; day <= daysInMonth; day++) {
        const date    = new Date(year, month - 1, day);
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

        // Not yet joined — compare using YMD strings to avoid timezone off-by-one
        if (emp.dateOfJoining && dateStr < toYMD(new Date(emp.dateOfJoining as Date))) {
          attendance[day] = '-';
          continue;
        }

        // Holiday
        if (holidaySet.has(dateStr)) {
          attendance[day] = 'H';
          holiday++;
          // corrections can override holidays too — applied below
        } else if (!isDayWorking(date, workingDays, saturdayRule)) {
          // Week off
          attendance[day] = 'WO';
          weekOff++;
          // corrections can override week-offs too — applied below
        } else if (dateStr > todayStr) {
          // Future (upcoming) — do NOT count in workingTotal
          attendance[day] = '·';
          continue; // corrections don't apply to future days
        } else {
          // Working day in the past — derive status
          workingTotal++;

          // SC: compensation day for a swap (show before everything else for normal working days)
          const matchedComp = empSwapComp.find((s) => s.compensationDate && toYMD(new Date(s.compensationDate)) === dateStr);

          // SD: absent date of a pending swap day
          const matchedSwap = empSwapDays.find((s) => toYMD(new Date(s.absentDate)) === dateStr);
          const isSwapDay = !!matchedSwap;
          if (isSwapDay && matchedSwap) {
            attendance[day] = 'SD'; absent++;
            swapDayMeta[day] = {
              compensationDate: matchedSwap.compensationDate ? toYMD(new Date(matchedSwap.compensationDate)) : null,
              deadline: matchedSwap.deadline ? toYMD(new Date(matchedSwap.deadline)) : null,
            };
          }

          const isAbsent = !isSwapDay && empAbsents.some((a) => toYMD(new Date(a.date)) === dateStr);
          if (!isSwapDay && isAbsent) {
            attendance[day] = 'A'; absent++;
          } else if (!isSwapDay) {
            const matchedLeave = empLeaves.find((l) => {
              const from = new Date(l.fromDate); from.setHours(0,0,0,0);
              const to   = new Date(l.toDate);   to.setHours(23,59,59,999);
              return date >= from && date <= to;
            });
            if (matchedLeave) {
              if (matchedLeave.status === 'ABSENT') {
                attendance[day] = 'A'; absent++;
              } else if (matchedLeave.isHalfDay) {
                attendance[day] = 'HD'; halfDay++;
              } else if (matchedLeave.isUnpaid || (matchedLeave.paidDays !== null && matchedLeave.paidDays === 0)) {
                attendance[day] = 'U'; unpaidLeave++;
              } else {
                attendance[day] = 'L'; leave++;
              }
            } else {
              const matchedWfh = empWfh.find((w) => {
                const wFrom = new Date(w.date); wFrom.setHours(0,0,0,0);
                const wTo   = w.toDate ? new Date(w.toDate) : new Date(w.date); wTo.setHours(23,59,59,999);
                return date >= wFrom && date <= wTo;
              });
              if (matchedWfh) {
                if (matchedWfh.isHalfDay) { attendance[day] = 'HD'; halfDay++; }
                else                      { attendance[day] = 'WFH'; wfh++; }
              } else if (attendanceMode === 'FROM_CHECKIN' && !empCheckIns.has(dateStr)) {
                // FROM_CHECKIN mode: no check-in record → NC (counts as absent for salary)
                attendance[day] = 'NC'; absent++;
              } else {
                attendance[day] = 'P'; present++;
              }
            }
          }

          // SC overlay: if this day is the compensation day, mark SC (overrides P/WFH but not leave/absent)
          if (matchedComp && !isSwapDay && !isAbsent) {
            const cur = attendance[day];
            if (cur === 'P' || cur === 'WFH') {
              if (cur === 'P') present--;
              else wfh--;
              attendance[day] = 'SC';
              swapCompMeta[day] = { absentDate: toYMD(new Date(matchedComp.absentDate)) };
              // SC doesn't decrement workingTotal — it counts as a normal working day
            }
          }
        }

        // Late mark overlay — set regardless of status (P, WFH, SC, etc.)
        const lateRec = empLate.find((lr) => toYMD(new Date(lr.date)) === dateStr);
        if (lateRec) {
          lateMeta[day] = { minutes: lateRec.lateMinutes, source: lateRec.source };
        }

        // ── Apply admin correction override ────────────────────────────────
        const corr = empCorrections.get(dateStr);
        if (corr) {
          const oldStatus = attendance[day];
          // Undo old status from summary counts
          if (oldStatus === 'P' || oldStatus === 'SC')        present--;
          else if (oldStatus === 'A' || oldStatus === 'SD' || oldStatus === 'NC') absent--;
          else if (oldStatus === 'L')   leave--;
          else if (oldStatus === 'U')   unpaidLeave--;
          else if (oldStatus === 'HD')  halfDay--;
          else if (oldStatus === 'WFH') wfh--;
          else if (oldStatus === 'WO')  weekOff--;
          else if (oldStatus === 'H')   holiday--;

          const newStatus = corr.correctedStatus as MusterStatus;
          attendance[day] = newStatus;

          // Add new status to summary counts
          if (newStatus === 'P' || newStatus === 'SC')        present++;
          else if (newStatus === 'A' || newStatus === 'SD' || newStatus === 'NC') absent++;
          else if (newStatus === 'L')   leave++;
          else if (newStatus === 'U')   unpaidLeave++;
          else if (newStatus === 'HD')  halfDay++;
          else if (newStatus === 'WFH') wfh++;
          else if (newStatus === 'WO')  weekOff++;
          else if (newStatus === 'H')   holiday++;

          correctionMeta[day] = {
            id:              corr.id,
            originalStatus:  corr.originalStatus,
            correctedStatus: corr.correctedStatus,
            reason:          corr.reason,
          };
        }
      }

      return {
        id:          emp.id,
        fullName:    emp.fullName,
        employeeId:  emp.employeeId,
        department:  emp.department,
        designation: emp.designation,
        attendance,
        correctionMeta,
        swapDayMeta,
        swapCompMeta,
        lateMeta,
        summary: { present, absent, leave, unpaidLeave, halfDay, wfh, weekOff, holiday, workingDays: workingTotal },
      };
    });

    // ── Overall totals (for the current page) ─────────────────────────────
    const totals = employees.reduce(
      (acc, e) => ({
        present:     acc.present     + e.summary.present,
        absent:      acc.absent      + e.summary.absent,
        leave:       acc.leave       + e.summary.leave,
        unpaidLeave: acc.unpaidLeave + e.summary.unpaidLeave,
        wfh:         acc.wfh         + e.summary.wfh,
        halfDay:     acc.halfDay     + e.summary.halfDay,
      }),
      { present: 0, absent: 0, leave: 0, unpaidLeave: 0, wfh: 0, halfDay: 0 }
    );

    return res.json({
      employees,
      totalEmployees,
      daysInMonth,
      holidays: holidays.map((h) => ({ date: toYMD(h.date), name: h.name })),
      month,
      year,
      page,
      limit,
      totalPages: Math.ceil(totalEmployees / limit),
      totals,
      attendanceMode,
    });
  } catch (error) {
    logger.error('getMuster error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/attendance/today-summary ────────────────────────────────────
export const getTodaySummary = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    const today    = new Date(); today.setHours(0,0,0,0);
    const todayEnd = new Date(today); todayEnd.setHours(23,59,59,999);

    const [total, onLeave, onWfh, absent] = await Promise.all([
      prisma.employee.count({ where: { isActive: true } }),
      prisma.leaveApplication.count({
        where: { status: 'APPROVED', fromDate: { lte: todayEnd }, toDate: { gte: today } },
      }),
      prisma.wfhApplication.count({
        where: { status: 'APPROVED', date: { gte: today, lte: todayEnd } },
      }),
      prisma.absentRecord.count({ where: { date: { gte: today, lte: todayEnd } } }),
    ]);

    const isHoliday = (await prisma.publicHoliday.count({
      where: { date: { gte: today, lte: todayEnd } },
    })) > 0;

    // Present = employees not on leave, WFH, absent, or holiday
    const present = isHoliday ? 0 : Math.max(0, total - onLeave - onWfh - absent);

    return res.json({ total, present, onLeave, onWfh, absent, isHoliday });
  } catch (error) {
    logger.error('getTodaySummary error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/attendance/monthly-summary ──────────────────────────────────
export const getMonthlySummaryAdmin = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const month      = Math.min(12, Math.max(1, parseInt((req.query.month as string) || String(new Date().getMonth() + 1))));
    const year       = parseInt((req.query.year as string) || String(new Date().getFullYear()));
    const department = (req.query.department as string) || undefined;
    const search     = (req.query.search as string) || undefined;
    const page       = Math.max(1, parseInt((req.query.page as string) || '1'));
    const limit      = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || '25')));

    const empWhere: Record<string, any> = { isActive: true };
    if (department) empWhere.department = department;
    if (search) {
      empWhere.OR = [
        { fullName:   { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [employees, totalEmployees] = await Promise.all([
      prisma.employee.findMany({
        where: empWhere,
        select: { id: true, fullName: true, employeeId: true, department: true, designation: true },
        orderBy: { fullName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.employee.count({ where: empWhere }),
    ]);

    const employeeIds = employees.map((e) => e.id);

    // Fetch existing monthly reports
    const reports = await prisma.monthlyReport.findMany({
      where: { employeeId: { in: employeeIds }, month, year },
    });
    const reportMap = new Map(reports.map((r) => [r.employeeId, r]));

    const rows = employees.map((emp) => {
      const r = reportMap.get(emp.id);
      return {
        id:              emp.id,
        fullName:        emp.fullName,
        employeeId:      emp.employeeId,
        department:      emp.department,
        designation:     emp.designation,
        totalWorkingDays: r?.totalWorkingDays ?? null,
        presentDays:      r ? Math.round(r.presentDays * 10) / 10 : null,
        leaveDays:        r ? Math.round(r.leaveDays   * 10) / 10 : null,
        absentDays:       r ? Math.round(r.absentDays  * 10) / 10 : null,
        wfhDays:          r ? Math.round(r.wfhDays     * 10) / 10 : null,
        attendancePct:    r?.attendancePct ?? null,
        generated:        r?.generatedAt ?? null,
      };
    });

    return res.json({
      rows,
      totalEmployees,
      month,
      year,
      page,
      limit,
      totalPages: Math.ceil(totalEmployees / limit),
    });
  } catch (error) {
    logger.error('getMonthlySummaryAdmin error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/admin/attendance/correction ─────────────────────────────────────
// Body: { employeeId, date (YYYY-MM-DD), correctedStatus, reason? }
export const upsertCorrection = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { employeeId, date, correctedStatus, reason } = req.body as {
      employeeId: string;
      date: string;
      correctedStatus: string;
      reason?: string;
    };

    if (!employeeId || !date || !correctedStatus) {
      return res.status(400).json({ message: 'employeeId, date, and correctedStatus are required' });
    }

    const validStatuses = ['P','A','L','U','HD','WFH','WO','H'];
    if (!validStatuses.includes(correctedStatus)) {
      return res.status(400).json({ message: `Invalid correctedStatus. Must be one of: ${validStatuses.join(', ')}` });
    }

    if (isNaN(new Date(date).getTime())) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // originalStatus comes from the client (what the cell showed before edit)
    const { originalStatus = 'P' } = req.body as { originalStatus?: string };

    const corrDate = new Date(date);
    corrDate.setHours(12, 0, 0, 0); // noon to avoid any UTC-shift edge cases

    const correction = await prisma.attendanceCorrection.upsert({
      where: { employeeId_date: { employeeId, date: corrDate } },
      create: {
        employeeId,
        date:            corrDate,
        correctedStatus,
        originalStatus,
        reason:          reason?.trim() || null,
        correctedBy:     req.user!.userId,
      },
      update: {
        correctedStatus,
        originalStatus,
        reason:      reason?.trim() || null,
        correctedBy: req.user!.userId,
      },
    });

    // Audit log
    prisma.auditLog.create({
      data: {
        adminId:    req.user!.userId,
        action:     'ATTENDANCE_CORRECTION',
        targetType: 'EMPLOYEE',
        targetId:   employeeId,
        meta: JSON.stringify({ date, originalStatus, correctedStatus, reason }),
      },
    }).catch(() => {});

    return res.json({ message: 'Attendance corrected', correction });
  } catch (error) {
    logger.error('upsertCorrection error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── DELETE /api/admin/attendance/correction/:id ────────────────────────────────
export const deleteCorrection = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);

    const existing = await prisma.attendanceCorrection.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Correction not found' });

    await prisma.attendanceCorrection.delete({ where: { id } });

    prisma.auditLog.create({
      data: {
        adminId:    req.user!.userId,
        action:     'ATTENDANCE_CORRECTION_REVERTED',
        targetType: 'EMPLOYEE',
        targetId:   existing.employeeId,
        meta: JSON.stringify({ date: toYMD(existing.date), correctedStatus: existing.correctedStatus }),
      },
    }).catch(() => {});

    return res.json({ message: 'Correction removed — attendance reverted to derived status' });
  } catch (error) {
    logger.error('deleteCorrection error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
