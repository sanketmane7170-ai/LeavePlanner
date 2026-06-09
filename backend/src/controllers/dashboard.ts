import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/authenticate';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── GET /api/admin/dashboard/stats ────────────────────────────────────────────
export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const [
      totalEmployees,
      pendingLeaveCount,
      pendingWfhCount,
      onLeaveToday,
      onWfhToday,
      absentToday,
      pendingLeaves,
      upcomingLeaves,
      pendingSwapDaysCount,
      overdueSwapDays,
    ] = await Promise.all([
      prisma.employee.count({ where: { isActive: true } }),
      prisma.leaveApplication.count({ where: { status: 'PENDING' } }),
      prisma.wfhApplication.count({ where: { status: 'PENDING' } }),
      prisma.leaveApplication.count({
        where: { status: 'APPROVED', fromDate: { lte: todayEnd }, toDate: { gte: today } },
      }),
      prisma.wfhApplication.count({
        where: { status: 'APPROVED', date: { gte: today, lte: todayEnd } },
      }),
      prisma.absentRecord.count({ where: { date: { gte: today, lte: todayEnd } } }),

      // Top 5 pending leaves for quick-approve
      prisma.leaveApplication.findMany({
        where: { status: 'PENDING' },
        include: {
          employee: { select: { id: true, fullName: true, employeeId: true, department: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 5,
      }),

      // Leaves starting this week
      prisma.leaveApplication.findMany({
        where: {
          status: 'APPROVED',
          fromDate: { gte: today, lte: weekEnd },
        },
        include: {
          employee: { select: { id: true, fullName: true, employeeId: true } },
        },
        orderBy: { fromDate: 'asc' },
        take: 10,
      }),

      // Pending swap days count
      prisma.swapDay.count({ where: { status: 'PENDING_COMPENSATION' } }),

      // Top 5 overdue swap days (comp date passed, still pending)
      prisma.swapDay.findMany({
        where: { status: 'PENDING_COMPENSATION', compensationDate: { lt: today } },
        include: {
          employee: { select: { id: true, fullName: true, employeeId: true, department: true } },
        },
        orderBy: { compensationDate: 'asc' },
        take: 5,
      }),
    ]);

    return res.json({
      stats: {
        totalEmployees,
        pendingLeaves: pendingLeaveCount + pendingWfhCount,
        onLeaveToday,
        onWfhToday,
        absentToday,
        pendingSwapDays: pendingSwapDaysCount,
      },
      pendingLeaves,
      upcomingLeaves,
      overdueSwapDays,
    });
  } catch (error) {
    logger.error('getDashboardStats error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/reports/monthly ────────────────────────────────────────────
export const getMonthlyReport = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const year = parseInt((req.query.year as string) || '') || new Date().getFullYear();
    const yearStart = new Date(`${year}-01-01`);
    const yearEnd   = new Date(`${year}-12-31T23:59:59`);

    const leaves = await prisma.leaveApplication.findMany({
      where: { status: 'APPROVED', fromDate: { gte: yearStart, lte: yearEnd } },
      select: { fromDate: true, totalDays: true },
    });

    const monthly = MONTH_NAMES.map((name, i) => ({ month: name, monthNum: i + 1, days: 0, count: 0 }));
    for (const leave of leaves) {
      const m = leave.fromDate.getMonth();
      if (monthly[m]) {
        monthly[m].days += leave.totalDays;
        monthly[m].count += 1;
      }
    }

    return res.json(monthly);
  } catch (error) {
    logger.error('getMonthlyReport error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/reports/type ───────────────────────────────────────────────
export const getTypeReport = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const year = parseInt((req.query.year as string) || '') || new Date().getFullYear();
    const yearStart = new Date(`${year}-01-01`);
    const yearEnd   = new Date(`${year}-12-31T23:59:59`);

    const leaves = await prisma.leaveApplication.findMany({
      where: { status: 'APPROVED', fromDate: { gte: yearStart, lte: yearEnd } },
      select: { leaveType: true, totalDays: true },
    });

    const typeMap: Record<string, { days: number; count: number }> = {};
    for (const leave of leaves) {
      const t = leave.leaveType;
      if (!typeMap[t]) typeMap[t] = { days: 0, count: 0 };
      typeMap[t].days += leave.totalDays;
      typeMap[t].count += 1;
    }

    const result = Object.entries(typeMap).map(([leaveType, data]) => ({
      leaveType,
      ...data,
    }));

    return res.json(result);
  } catch (error) {
    logger.error('getTypeReport error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
