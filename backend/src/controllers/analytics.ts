import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/authenticate';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── GET /api/admin/reports/overview ──────────────────────────────────────────
export const getReportsOverview = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const year = parseInt((req.query.year as string) || '') || new Date().getFullYear();
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : new Date(`${year}-01-01`);
    const dateTo   = req.query.dateTo   ? new Date(req.query.dateTo   as string) : new Date(`${year}-12-31`);

    const [
      totalEmployees,
      totalLeaves,
      totalWfh,
      unpaidLeaves,
      pendingLeaves,
      pendingWfh,
    ] = await Promise.all([
      prisma.employee.count({ where: { isActive: true } }),
      prisma.leaveApplication.count({
        where: { status: 'APPROVED', fromDate: { gte: dateFrom, lte: dateTo } },
      }),
      prisma.wfhApplication.count({
        where: { status: 'APPROVED', date: { gte: dateFrom, lte: dateTo } },
      }),
      prisma.leaveApplication.count({
        where: { status: 'APPROVED', isUnpaid: true, fromDate: { gte: dateFrom, lte: dateTo } },
      }),
      prisma.leaveApplication.count({ where: { status: 'PENDING' } }),
      prisma.wfhApplication.count({ where: { status: 'PENDING' } }),
    ]);

    const leaveDaysAgg = await prisma.leaveApplication.aggregate({
      where: { status: 'APPROVED', fromDate: { gte: dateFrom, lte: dateTo } },
      _sum: { totalDays: true },
    });
    const wfhDaysAgg = await prisma.wfhApplication.aggregate({
      where: { status: 'APPROVED', date: { gte: dateFrom, lte: dateTo } },
      _sum: { totalDays: true },
    });

    return res.json({
      year,
      totalEmployees,
      totalLeaveApplications: totalLeaves,
      totalLeaveDays: leaveDaysAgg._sum.totalDays ?? 0,
      totalWfhApplications: totalWfh,
      totalWfhDays: wfhDaysAgg._sum.totalDays ?? 0,
      unpaidLeaveApplications: unpaidLeaves,
      pendingLeaves,
      pendingWfh,
    });
  } catch (error) {
    logger.error('getReportsOverview error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/reports/leave-trends ──────────────────────────────────────
export const getLeaveTrends = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const year = parseInt((req.query.year as string) || '') || new Date().getFullYear();

    const [leaveApps, wfhApps] = await Promise.all([
      prisma.leaveApplication.findMany({
        where: {
          status: 'APPROVED',
          fromDate: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
        },
        select: { fromDate: true, totalDays: true, leaveType: true, isUnpaid: true },
      }),
      prisma.wfhApplication.findMany({
        where: {
          status: 'APPROVED',
          date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
        },
        select: { date: true, totalDays: true },
      }),
    ]);

    const monthly: Record<number, { leaveDays: number; leaveCount: number; wfhDays: number; wfhCount: number; unpaidDays: number }> = {};
    for (let m = 1; m <= 12; m++) monthly[m] = { leaveDays: 0, leaveCount: 0, wfhDays: 0, wfhCount: 0, unpaidDays: 0 };

    for (const l of leaveApps) {
      const m = new Date(l.fromDate).getMonth() + 1;
      monthly[m]!.leaveDays  += l.totalDays;
      monthly[m]!.leaveCount += 1;
      if (l.isUnpaid) monthly[m]!.unpaidDays += l.totalDays;
    }
    for (const w of wfhApps) {
      const m = new Date(w.date).getMonth() + 1;
      monthly[m]!.wfhDays  += w.totalDays ?? 1;
      monthly[m]!.wfhCount += 1;
    }

    const trend = Object.entries(monthly).map(([m, v]) => ({
      month: MONTH_NAMES[parseInt(m) - 1],
      monthNum: parseInt(m),
      ...v,
    }));

    // Leave type breakdown
    const typeBreakdown: Record<string, number> = {};
    for (const l of leaveApps) {
      typeBreakdown[l.leaveType] = (typeBreakdown[l.leaveType] ?? 0) + l.totalDays;
    }

    return res.json({ year, trend, typeBreakdown });
  } catch (error) {
    logger.error('getLeaveTrends error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/reports/department-summary ─────────────────────────────────
export const getDepartmentSummary = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const year = parseInt((req.query.year as string) || '') || new Date().getFullYear();

    const employees = await prisma.employee.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        employeeId: true,
        department: true,
        leaveApplications: {
          where: { status: 'APPROVED', fromDate: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } },
          select: { totalDays: true, isUnpaid: true },
        },
        wfhApplications: {
          where: { status: 'APPROVED', date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } },
          select: { totalDays: true },
        },
      },
    });

    const deptMap: Record<string, { leaveDays: number; wfhDays: number; unpaidDays: number; headcount: number }> = {};

    for (const emp of employees) {
      const dept = emp.department || 'Unassigned';
      if (!deptMap[dept]) deptMap[dept] = { leaveDays: 0, wfhDays: 0, unpaidDays: 0, headcount: 0 };
      deptMap[dept]!.headcount++;
      for (const l of emp.leaveApplications) {
        deptMap[dept]!.leaveDays += l.totalDays;
        if (l.isUnpaid) deptMap[dept]!.unpaidDays += l.totalDays;
      }
      for (const w of emp.wfhApplications) {
        deptMap[dept]!.wfhDays += w.totalDays ?? 1;
      }
    }

    const departments = Object.entries(deptMap).map(([dept, stats]) => ({
      department: dept,
      ...stats,
      avgLeaveDaysPerEmployee: stats.headcount > 0 ? Math.round((stats.leaveDays / stats.headcount) * 10) / 10 : 0,
    })).sort((a, b) => b.leaveDays - a.leaveDays);

    return res.json({ year, departments });
  } catch (error) {
    logger.error('getDepartmentSummary error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/reports/top-leavers ───────────────────────────────────────
export const getTopLeavers = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const year  = parseInt((req.query.year  as string) || '') || new Date().getFullYear();
    const limit = Math.min(20, parseInt((req.query.limit as string) || '10', 10));

    const employees = await prisma.employee.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        employeeId: true,
        department: true,
        designation: true,
        leaveApplications: {
          where: { status: 'APPROVED', fromDate: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } },
          select: { totalDays: true, leaveType: true, isUnpaid: true },
        },
        wfhApplications: {
          where: { status: 'APPROVED', date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } },
          select: { totalDays: true },
        },
      },
    });

    const result = employees.map((emp) => ({
      id: emp.id,
      fullName: emp.fullName,
      employeeId: emp.employeeId,
      department: emp.department,
      designation: emp.designation,
      totalLeaveDays: emp.leaveApplications.reduce((s, l) => s + l.totalDays, 0),
      totalWfhDays:   emp.wfhApplications.reduce((s, w) => s + (w.totalDays ?? 1), 0),
      unpaidDays:     emp.leaveApplications.filter(l => l.isUnpaid).reduce((s, l) => s + l.totalDays, 0),
      leaveCount:     emp.leaveApplications.length,
    }))
    .sort((a, b) => b.totalLeaveDays - a.totalLeaveDays)
    .slice(0, limit);

    return res.json({ year, employees: result });
  } catch (error) {
    logger.error('getTopLeavers error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/reports/attendance-heatmap ─────────────────────────────────
export const getAttendanceHeatmap = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const year = parseInt((req.query.year as string) || '') || new Date().getFullYear();

    const reports = await prisma.monthlyReport.findMany({
      where: { year },
      select: { month: true, presentDays: true, leaveDays: true, absentDays: true, wfhDays: true, attendancePct: true },
    });

    const monthly: Record<number, { presentDays: number; leaveDays: number; absentDays: number; wfhDays: number; count: number }> = {};
    for (let m = 1; m <= 12; m++) monthly[m] = { presentDays: 0, leaveDays: 0, absentDays: 0, wfhDays: 0, count: 0 };

    for (const r of reports) {
      monthly[r.month]!.presentDays += r.presentDays;
      monthly[r.month]!.leaveDays   += r.leaveDays;
      monthly[r.month]!.absentDays  += r.absentDays;
      monthly[r.month]!.wfhDays     += r.wfhDays;
      monthly[r.month]!.count       += 1;
    }

    const heatmap = Object.entries(monthly).map(([m, v]) => ({
      month: MONTH_NAMES[parseInt(m) - 1],
      monthNum: parseInt(m),
      avgPresent: v.count > 0 ? Math.round((v.presentDays / v.count) * 10) / 10 : 0,
      avgLeave:   v.count > 0 ? Math.round((v.leaveDays   / v.count) * 10) / 10 : 0,
      avgAbsent:  v.count > 0 ? Math.round((v.absentDays  / v.count) * 10) / 10 : 0,
      avgWfh:     v.count > 0 ? Math.round((v.wfhDays     / v.count) * 10) / 10 : 0,
    }));

    return res.json({ year, heatmap });
  } catch (error) {
    logger.error('getAttendanceHeatmap error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
