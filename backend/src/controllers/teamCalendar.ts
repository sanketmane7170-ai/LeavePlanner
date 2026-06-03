import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/authenticate';
import { startOfMonth, endOfMonth, parseISO } from 'date-fns';

export const getTeamCalendarLeaves = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Verify permissions
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role !== 'ADMIN' && !user.employee?.canViewTeamCalendar) {
      return res.status(403).json({ message: 'You do not have permission to view the team calendar' });
    }

    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ message: 'Month and year are required' });
    }

    // Create start and end dates for the given month
    const targetDate = new Date(Number(year), Number(month) - 1, 1);
    const startDate = startOfMonth(targetDate);
    const endDate = endOfMonth(targetDate);

    // Fetch approved leaves that overlap with this month
    const leaves = await prisma.leaveApplication.findMany({
      where: {
        status: 'APPROVED',
        OR: [
          {
            fromDate: { lte: endDate },
            toDate: { gte: startDate },
          }
        ]
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            employeeId: true,
            department: true,
          }
        }
      },
      orderBy: {
        fromDate: 'asc'
      }
    });

    // Strip out sensitive info like reason
    const sanitizedLeaves = leaves.map(leave => ({
      id: leave.id,
      employee: leave.employee,
      leaveType: leave.leaveType,
      fromDate: leave.fromDate,
      toDate: leave.toDate,
      isHalfDay: leave.isHalfDay,
      halfDaySlot: leave.halfDaySlot,
      totalDays: leave.totalDays,
    }));

    return res.json(sanitizedLeaves);
  } catch (error) {
    logger.error('getTeamCalendarLeaves error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/team-calendar ──────────────────────────────────────────────
export const getAdminTeamCalendar = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const month      = Math.min(12, Math.max(1, parseInt((req.query.month as string) || String(new Date().getMonth() + 1))));
    const year       = parseInt((req.query.year  as string) || String(new Date().getFullYear()));
    const department = (req.query.department as string) || undefined;
    const leaveType  = (req.query.leaveType  as string) || undefined;
    const employeeId = (req.query.employeeId as string) || undefined;

    const startDate = startOfMonth(new Date(year, month - 1, 1));
    const endDate   = endOfMonth(new Date(year, month - 1, 1));

    // ── Employee where clause ─────────────────────────────────────────────
    const empWhere: Record<string, any> = { isActive: true };
    if (department) empWhere.department = department;
    if (employeeId) empWhere.id = employeeId;

    const empIds = (await prisma.employee.findMany({
      where: empWhere,
      select: { id: true },
    })).map((e) => e.id);

    // ── Batch fetch leaves, WFH, holidays ─────────────────────────────────
    const leaveWhere: Record<string, any> = {
      employeeId: { in: empIds },
      status: { in: ['APPROVED', 'PENDING'] },
      fromDate: { lte: endDate },
      toDate:   { gte: startDate },
    };
    if (leaveType) leaveWhere.leaveType = leaveType;

    const [leaves, wfhApps, holidays, employees] = await Promise.all([
      prisma.leaveApplication.findMany({
        where: leaveWhere,
        include: { employee: { select: { id: true, fullName: true, employeeId: true, department: true } } },
        orderBy: { fromDate: 'asc' },
      }),
      prisma.wfhApplication.findMany({
        where: {
          employeeId: { in: empIds },
          status: { in: ['APPROVED', 'PENDING'] },
          date: { gte: startDate, lte: endDate },
        },
        include: { employee: { select: { id: true, fullName: true, employeeId: true, department: true } } },
        orderBy: { date: 'asc' },
      }),
      prisma.publicHoliday.findMany({
        where: { year, date: { gte: startDate, lte: endDate } },
        orderBy: { date: 'asc' },
      }),
      prisma.employee.findMany({
        where: empWhere,
        select: { id: true, fullName: true, employeeId: true, department: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);

    // ── Today stats ───────────────────────────────────────────────────────
    const today    = new Date(); today.setHours(0,0,0,0);
    const todayEnd = new Date(today); todayEnd.setHours(23,59,59,999);

    const onLeaveToday = leaves.filter((l) => {
      const from = new Date(l.fromDate); from.setHours(0,0,0,0);
      const to   = new Date(l.toDate);   to.setHours(23,59,59,999);
      return l.status === 'APPROVED' && today >= from && today <= to;
    }).length;

    const wfhToday = wfhApps.filter((w) => {
      const d = new Date(w.date); d.setHours(0,0,0,0);
      const e = w.toDate ? new Date(w.toDate) : new Date(w.date); e.setHours(23,59,59,999);
      return w.status === 'APPROVED' && today >= d && today <= e;
    }).length;

    const pendingCount = leaves.filter((l) => l.status === 'PENDING').length
      + wfhApps.filter((w) => w.status === 'PENDING').length;

    // ── Shape events ──────────────────────────────────────────────────────
    const leaveEvents = leaves.map((l) => ({
      id:        l.id,
      type:      'LEAVE' as const,
      status:    l.status,
      leaveType: l.leaveType,
      fromDate:  l.fromDate,
      toDate:    l.toDate,
      isHalfDay: l.isHalfDay,
      halfDaySlot: l.halfDaySlot,
      totalDays: l.totalDays,
      reason:    l.reason,
      employee:  l.employee,
    }));

    const wfhEvents = wfhApps.map((w) => ({
      id:        w.id,
      type:      'WFH' as const,
      status:    w.status,
      leaveType: null,
      fromDate:  w.date,
      toDate:    w.toDate ?? w.date,
      isHalfDay: w.isHalfDay,
      halfDaySlot: w.halfDaySlot,
      totalDays: w.totalDays,
      reason:    w.reason,
      employee:  w.employee,
    }));

    return res.json({
      events:   [...leaveEvents, ...wfhEvents],
      holidays: holidays.map((h) => ({ date: h.date, name: h.name })),
      employees,
      summary:  { onLeaveToday, wfhToday, pendingCount, totalEmployees: empIds.length },
      month,
      year,
    });
  } catch (error) {
    logger.error('getAdminTeamCalendar error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
