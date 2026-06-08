import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/authenticate';
import { calculateLeaveDays, isDuringProbation } from '../services/leaveCalculator';
import {
  sendWfhAppliedAdminEmail,
  sendWfhSubmittedEmail,
  sendWfhStatusEmail,
} from '../services/emailService';
import { createNotification } from '../services/notificationService';

// ── helpers ───────────────────────────────────────────────────────────────────

async function getEmployeeForUser(userId: string) {
  return prisma.employee.findUnique({
    where: { userId },
    include: {
      wfhPolicy:      { include: { rules: { orderBy: { minDays: 'asc' } } } },
      workingSchedule: true,
      wfhPolicyExceptions: true,
      user:            { select: { email: true } },
    },
  }) as any;
}

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

function endOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

function evaluateOperator(totalDays: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case 'GTE': return totalDays >= threshold;
    case 'GT':  return totalDays >  threshold;
    case 'LTE': return totalDays <= threshold;
    case 'LT':  return totalDays <  threshold;
    case 'EQ':  return totalDays === threshold;
    default:    return totalDays >= threshold;
  }
}

// ── GET /api/employee/wfh/balance ─────────────────────────────────────────────
export const getWfhBalance = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const month = parseInt((req.query.month as string) || '') || now.getMonth() + 1;
    const year  = parseInt((req.query.year  as string) || '') || now.getFullYear();

    const employee = await getEmployeeForUser(userId);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const yearStart = new Date(year, 0, 1, 0, 0, 0, 0);
    const yearEnd   = new Date(year, 11, 31, 23, 59, 59, 999);

    const wfhThisYear = await prisma.wfhApplication.findMany({
      where: {
        employeeId: employee.id,
        status: { in: ['APPROVED', 'PENDING'] },
        date: { gte: yearStart, lte: yearEnd },
      },
      select: { status: true, totalDays: true },
    });

    const approvedDays = wfhThisYear
      .filter((a) => a.status === 'APPROVED')
      .reduce((s, a) => s + a.totalDays, 0);
    const pendingDays = wfhThisYear
      .filter((a) => a.status === 'PENDING')
      .reduce((s, a) => s + a.totalDays, 0);

    const exception = (employee.wfhPolicyExceptions as any[])?.find((ex: any) => ex.policyId === employee.wfhPolicyId);
    const baseDays = employee.wfhPolicy ? employee.wfhPolicy.daysAllowed : 0;
    const allowedDays = exception ? exception.overrideDays : baseDays;

    const remainingDays = employee.wfhPolicy
      ? Math.max(0, allowedDays - approvedDays - pendingDays)
      : 0;

    const holidays = await prisma.publicHoliday.findMany({
      where: { year },
      orderBy: { date: 'asc' },
      select: { id: true, name: true, date: true, year: true },
    });

    return res.json({
      policy: employee.wfhPolicy ? { ...employee.wfhPolicy, daysAllowed: allowedDays } : null,
      usedDays: approvedDays,
      pendingDays,
      remainingDays,
      month,
      year,
      employee: { id: employee.id, workingSchedule: employee.workingSchedule },
      holidays,
    });
  } catch (error) {
    logger.error('getWfhBalance error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/employee/wfh/apply ──────────────────────────────────────────────
export const applyWfh = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    const {
      date: dateStr,
      toDate: toDateStr,
      isHalfDay = false,
      halfDaySlot,
      reason,
    } = req.body as {
      date: string;
      toDate?: string;
      isHalfDay?: boolean;
      halfDaySlot?: string;
      reason: string;
    };

    if (!dateStr || !reason) {
      return res.status(400).json({ message: 'date and reason are required' });
    }
    if (typeof reason !== 'string' || reason.trim().length === 0 || reason.length > 500) {
      return res.status(400).json({ message: 'Reason must be between 1 and 500 characters.' });
    }
    if (isNaN(new Date(dateStr).getTime()) || (toDateStr && isNaN(new Date(toDateStr).getTime()))) {
      return res.status(400).json({ message: 'Invalid date format.' });
    }

    const employee = await getEmployeeForUser(userId);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (!employee.wfhPolicy) {
      return res.status(400).json({ message: 'No WFH policy assigned. Please contact your administrator.' });
    }

    // Notice period block
    if ((employee as any).isOnNoticePeriod) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const early = (employee as any).earlyReleaseDate ? new Date((employee as any).earlyReleaseDate) : null;
      const end   = (employee as any).noticePeriodEnd  ? new Date((employee as any).noticePeriodEnd)  : null;
      const effectiveEnd = early && early < (end ?? early) ? early : end;
      const start = (employee as any).noticePeriodStart ? new Date((employee as any).noticePeriodStart) : null;
      if (start && effectiveEnd && today >= start && today <= effectiveEnd) {
        return res.status(403).json({
          message: 'WFH requests are not permitted during your notice period. Please contact HR if you need an exception.',
        });
      }
    }

    const fromDate = new Date(dateStr);
    const toDate   = toDateStr ? new Date(toDateStr) : new Date(dateStr);
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    if (fromDate > toDate) {
      return res.status(400).json({ message: 'date must be before or equal to toDate' });
    }

    if (isHalfDay && fromDate.toDateString() !== toDate.toDateString()) {
      return res.status(400).json({ message: 'Half-day WFH must be a single day.' });
    }
    if (isHalfDay && !employee.wfhPolicy.halfDayAllowed) {
      return res.status(400).json({ message: 'Half-day WFH is not allowed under your policy.' });
    }

    const year  = fromDate.getFullYear();
    const month = fromDate.getMonth() + 1;

    const holidays = await prisma.publicHoliday.findMany({ where: { year } });
    const totalDays = calculateLeaveDays(
      fromDate, toDate, employee.workingSchedule, holidays.map((h) => h.date), isHalfDay
    );
    if (totalDays <= 0) {
      return res.status(400).json({ message: 'No working days in the selected date range.' });
    }

    // Probation check
    if (employee.dateOfJoining && employee.wfhPolicy.probationRule !== 'NONE') {
      const inProbation = isDuringProbation(fromDate, employee.dateOfJoining, employee.probationMonths);
      if (inProbation) {
        if (employee.wfhPolicy.probationRule === 'NO_LEAVES') {
          return res.status(400).json({ message: 'WFH is not permitted during your probation period.' });
        }
      }
    }

    // Base settings from policy
    let requiresApproval = employee.wfhPolicy.approvalRequired;
    let effectiveNoticeRequired = employee.wfhPolicy.noticeRequired;
    let effectiveMinNoticeDays = employee.wfhPolicy.minNoticeDays;

    // Apply conditional rules
    const rules = (employee.wfhPolicy as any).rules as Array<{
      operator: string; minDays: number;
      approvalRequired: boolean; noticeRequired: boolean; minNoticeDays: number;
    }> ?? [];

    if (rules.length > 0) {
      const matching = rules.filter((r) => evaluateOperator(totalDays, r.operator, r.minDays));
      if (matching.length > 0) {
        matching.sort((a, b) => b.minDays - a.minDays);
        const applied = matching[0];
        requiresApproval = applied.approvalRequired;
        effectiveNoticeRequired = applied.noticeRequired;
        effectiveMinNoticeDays = applied.minNoticeDays;
      }
    }

    // Notice period check
    if (effectiveNoticeRequired && effectiveMinNoticeDays > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const earliest = new Date(today);
      earliest.setDate(earliest.getDate() + effectiveMinNoticeDays);
      if (fromDate < earliest) {
        return res.status(400).json({
          message: `Minimum ${effectiveMinNoticeDays} day(s) advance notice required.`,
        });
      }
    }

    // Blackout check
    const blackout = (employee.wfhPolicyExceptions as any[]).find(
      (ex: any) =>
        ex.policyId === employee.wfhPolicyId &&
        new Date(ex.blackoutFrom) <= toDate &&
        new Date(ex.blackoutTo) >= fromDate
    );
    if (blackout) {
      return res.status(400).json({ message: 'Your selected dates fall within a restricted blackout period for this policy.' });
    }

    const yearStart = new Date(year, 0, 1, 0, 0, 0, 0);
    const yearEnd   = new Date(year, 11, 31, 23, 59, 59, 999);
    const wfhThisYear = await prisma.wfhApplication.findMany({
      where: {
        employeeId: employee.id,
        status: { in: ['APPROVED', 'PENDING'] },
        date: { gte: yearStart, lte: yearEnd },
      },
      select: { totalDays: true },
    });
    const usedPlusPending = wfhThisYear.reduce((s, a) => s + a.totalDays, 0);

    const exception = (employee.wfhPolicyExceptions as any[])?.find((ex: any) => ex.policyId === employee.wfhPolicyId);
    const baseDays = employee.wfhPolicy.daysAllowed;
    const allowedDays = exception ? exception.overrideDays : baseDays;

    const remaining = allowedDays - usedPlusPending;
    if (remaining < totalDays) {
      return res.status(400).json({
        message: `Insufficient WFH balance. ${Math.max(0, remaining)} day(s) remaining, ${totalDays} required.`,
      });
    }

    const overlap = await prisma.wfhApplication.findFirst({
      where: {
        employeeId: employee.id,
        status: { in: ['PENDING', 'APPROVED'] },
        date: { lte: toDate },
        OR: [
          { toDate: { gte: fromDate } },
          { toDate: null, date: { gte: fromDate } },
        ],
      },
    });
    if (overlap) {
      return res.status(400).json({ message: 'You already have a WFH application for the selected dates.' });
    }

    const application = await prisma.wfhApplication.create({
      data: {
        employeeId: employee.id,
        date: fromDate,
        toDate: toDateStr ? toDate : undefined,
        isHalfDay,
        halfDaySlot: isHalfDay && halfDaySlot ? (halfDaySlot as any) : undefined,
        totalDays,
        reason,
        status: requiresApproval ? 'PENDING' : 'APPROVED',
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: userId,
        action: 'APPLY_WFH',
        targetType: 'WFH',
        targetId: application.id,
        meta: JSON.stringify({
          fromDate: application.date.toISOString().split('T')[0],
          toDate: application.toDate ? application.toDate.toISOString().split('T')[0] : null,
          totalDays: application.totalDays,
          status: application.status,
        }),
      },
    }).catch((e) => logger.error('Failed to log applyWfh to auditLog:', e));

    // Emails (fire-and-forget)
    const emailDetails = {
      fromDate:         fromDate.toLocaleDateString('en-IN'),
      toDate:           toDate.toLocaleDateString('en-IN'),
      isHalfDay,
      halfDaySlot:      halfDaySlot ?? null,
      totalDays,
      reason,
      requiresApproval,
    };

    if (requiresApproval) {
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { email: true } });
      sendWfhAppliedAdminEmail(
        admins.map((a) => a.email),
        { fullName: employee.fullName, employeeId: employee.employeeId, department: employee.department },
        emailDetails
      ).catch((e) => logger.error('[email] sendWfhAppliedAdminEmail failed:', e));

      sendWfhSubmittedEmail(
        (employee as any).user?.email ?? '',
        employee.fullName,
        emailDetails
      ).catch((e) => logger.error('[email] sendWfhSubmittedEmail failed:', e));
    } else {
      // Auto-approved: send approval status email, not submission email
      sendWfhStatusEmail(
        (employee as any).user?.email ?? '',
        employee.fullName,
        { fromDate: fromDate.toLocaleDateString('en-IN'), toDate: toDate.toLocaleDateString('en-IN'), isHalfDay, halfDaySlot: halfDaySlot ?? null, totalDays },
        'APPROVED'
      ).catch((e) => logger.error('[email] sendWfhStatusEmail auto-approved failed:', e));
    }

    return res.status(201).json({
      message: requiresApproval
        ? 'WFH application submitted. Awaiting approval.'
        : 'WFH application approved automatically.',
      application,
    });
  } catch (error) {
    logger.error('applyWfh error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/employee/wfh ─────────────────────────────────────────────────────
export const getMyWfh = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId  = req.user!.userId;
    const year    = parseInt((req.query.year   as string) || '') || new Date().getFullYear();
    const status  = req.query.status   as string | undefined;
    const page    = Math.max(1, parseInt((req.query.page  as string) || '1', 10));
    const limit   = Math.min(50, parseInt((req.query.limit as string) || '20', 10));

    const employee = await prisma.employee.findUnique({ where: { userId }, select: { id: true } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const where: Record<string, any> = {
      employeeId: employee.id,
      date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
    };
    if (status) where['status'] = status;

    const [wfhList, total] = await Promise.all([
      prisma.wfhApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.wfhApplication.count({ where }),
    ]);

    return res.json({ data: wfhList, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error('getMyWfh error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/wfh ────────────────────────────────────────────────────────
export const getAdminWfh = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const {
      status, search, employeeId,
      year    = String(new Date().getFullYear()),
      dateFrom, dateTo,
      page    = '1',
      limit   = '20',
    } = req.query as Record<string, string>;

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(limit, 10));
    const yr       = parseInt(year, 10);

    const where: Record<string, any> = {
      date: { gte: new Date(`${yr}-01-01`), lte: new Date(`${yr}-12-31`) },
    };
    if (employeeId) where['employeeId'] = employeeId;
    if (status) where['status'] = status;
    if (dateFrom && dateTo) {
      where['date'] = { gte: new Date(dateFrom), lte: new Date(dateTo) };
    }
    if (search) {
      where['employee'] = {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { employeeId: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [wfhList, total] = await Promise.all([
      prisma.wfhApplication.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true, fullName: true, employeeId: true, department: true,
              user: { select: { email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.wfhApplication.count({ where }),
    ]);

    return res.json({
      data: wfhList, total, page: pageNum, limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    logger.error('getAdminWfh error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PATCH /api/admin/wfh/:id/approve ─────────────────────────────────────────
export const approveWfh = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);

    const wfh = await prisma.wfhApplication.findUnique({
      where: { id },
      include: { employee: { include: { user: { select: { email: true } } } } },
    });

    if (!wfh) return res.status(404).json({ message: 'WFH application not found' });
    if (wfh.status !== 'PENDING') {
      return res.status(400).json({ message: `Cannot approve a WFH application with status "${wfh.status}".` });
    }

    await prisma.wfhApplication.update({ where: { id }, data: { status: 'APPROVED' } });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.userId,
        action: 'APPROVE_WFH',
        targetType: 'WFH',
        targetId: wfh.id,
        meta: JSON.stringify({
          employeeName: wfh.employee.fullName,
          fromDate: wfh.date.toISOString().split('T')[0],
          toDate: wfh.toDate ? wfh.toDate.toISOString().split('T')[0] : null,
          totalDays: wfh.totalDays,
        }),
      },
    }).catch((e) => logger.error('Failed to log approveWfh to auditLog:', e));

    sendWfhStatusEmail(
      (wfh.employee as any).user?.email ?? '',
      wfh.employee.fullName,
      { fromDate: wfh.date.toLocaleDateString('en-IN'), toDate: (wfh.toDate ?? wfh.date).toLocaleDateString('en-IN'), isHalfDay: wfh.isHalfDay, halfDaySlot: wfh.halfDaySlot, totalDays: wfh.totalDays },
      'APPROVED'
    ).catch((e) => logger.error('[email] sendWfhStatusEmail APPROVED failed:', e));

    await createNotification(
      wfh.employee.userId,
      'WFH_APPROVED',
      `Your WFH request for ${wfh.totalDays} day(s) from ${wfh.date.toLocaleDateString('en-IN')} was approved.`,
      '/employee/my-leaves'
    );

    return res.json({ message: 'WFH application approved.' });
  } catch (error) {
    logger.error('approveWfh error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PATCH /api/admin/wfh/:id/reject ──────────────────────────────────────────
export const rejectWfh = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    const { comment } = req.body as { comment: string };

    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'A rejection comment is required.' });
    }

    const wfh = await prisma.wfhApplication.findUnique({
      where: { id },
      include: { employee: { include: { user: { select: { email: true } } } } },
    });

    if (!wfh) return res.status(404).json({ message: 'WFH application not found' });
    if (wfh.status !== 'PENDING') {
      return res.status(400).json({ message: `Cannot reject a WFH application with status "${wfh.status}".` });
    }

    await prisma.wfhApplication.update({
      where: { id },
      data: { status: 'REJECTED', adminComment: comment.trim() },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.userId,
        action: 'REJECT_WFH',
        targetType: 'WFH',
        targetId: wfh.id,
        meta: JSON.stringify({
          employeeName: wfh.employee.fullName,
          fromDate: wfh.date.toISOString().split('T')[0],
          toDate: wfh.toDate ? wfh.toDate.toISOString().split('T')[0] : null,
          totalDays: wfh.totalDays,
          comment: comment.trim(),
        }),
      },
    }).catch((e) => logger.error('Failed to log rejectWfh to auditLog:', e));

    sendWfhStatusEmail(
      (wfh.employee as any).user?.email ?? '',
      wfh.employee.fullName,
      { fromDate: wfh.date.toLocaleDateString('en-IN'), toDate: (wfh.toDate ?? wfh.date).toLocaleDateString('en-IN'), isHalfDay: wfh.isHalfDay, halfDaySlot: wfh.halfDaySlot, totalDays: wfh.totalDays },
      'REJECTED',
      comment.trim()
    ).catch((e) => logger.error('[email] sendWfhStatusEmail REJECTED failed:', e));

    await createNotification(
      wfh.employee.userId,
      'WFH_REJECTED',
      `Your WFH request from ${wfh.date.toLocaleDateString('en-IN')} was rejected. Reason: ${comment.trim()}`,
      '/employee/my-leaves'
    );

    return res.json({ message: 'WFH application rejected.' });
  } catch (error) {
    logger.error('rejectWfh error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PATCH /api/employee/wfh/:id/cancel ────────────────────────────────────────
export const cancelWfh = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params['id']);

    const employee = await prisma.employee.findUnique({ where: { userId }, select: { id: true } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const wfh = await prisma.wfhApplication.findUnique({ where: { id } });
    if (!wfh) return res.status(404).json({ message: 'WFH application not found' });
    if (wfh.employeeId !== employee.id) return res.status(403).json({ message: 'Not authorized' });
    if (!['PENDING', 'APPROVED'].includes(wfh.status)) {
      return res.status(400).json({ message: `Cannot cancel a WFH application with status "${wfh.status}".` });
    }

    await prisma.wfhApplication.update({ where: { id }, data: { status: 'CANCELLED' } });

    await prisma.auditLog.create({
      data: {
        adminId: userId,
        action: 'CANCEL_WFH',
        targetType: 'WFH',
        targetId: id,
        meta: JSON.stringify({ fromDate: wfh.date.toISOString().split('T')[0], totalDays: wfh.totalDays }),
      },
    }).catch((e) => logger.error('Failed to log cancelWfh to auditLog:', e));

    return res.json({ message: 'WFH application cancelled.' });
  } catch (error) {
    logger.error('cancelWfh error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/admin/wfh/bulk-approve ──────────────────────────────────────────
export const bulkApproveWfh = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids must be a non-empty array' });
    }

    const pending = await prisma.wfhApplication.findMany({
      where: { id: { in: ids }, status: 'PENDING' },
      include: { employee: { include: { user: { select: { email: true } } } } },
    });

    if (pending.length === 0) {
      return res.status(400).json({ message: 'No pending WFH applications found for the given ids.' });
    }

    await prisma.wfhApplication.updateMany({
      where: { id: { in: pending.map((w) => w.id) } },
      data: { status: 'APPROVED' },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.userId,
        action: 'BULK_APPROVE_WFH',
        targetType: 'WFH',
        targetId: pending.map((w) => w.id).join(','),
        meta: JSON.stringify({ count: pending.length }),
      },
    }).catch((e) => logger.error('Failed to log bulkApproveWfh to auditLog:', e));

    // Send approval emails (fire-and-forget)
    for (const wfh of pending) {
      sendWfhStatusEmail(
        (wfh.employee as any).user?.email ?? '',
        wfh.employee.fullName,
        { fromDate: wfh.date.toLocaleDateString('en-IN'), toDate: (wfh.toDate ?? wfh.date).toLocaleDateString('en-IN'), isHalfDay: wfh.isHalfDay, halfDaySlot: wfh.halfDaySlot, totalDays: wfh.totalDays },
        'APPROVED'
      ).catch((e) => logger.error(`[email] sendWfhStatusEmail bulkApprove failed for ${wfh.id}:`, e));
    }

    return res.json({ message: `${pending.length} WFH application(s) approved.`, approved: pending.length });
  } catch (error) {
    logger.error('bulkApproveWfh error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/employee/wfh/monthly-breakdown ──────────────────────────────────
export const getWfhMonthlyBreakdown = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    const year   = parseInt((req.query.year as string) || '') || new Date().getFullYear();

    const employee = await prisma.employee.findUnique({
      where: { userId },
      include: { wfhPolicy: { select: { id: true, daysAllowed: true } } },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const wfhApps = await prisma.wfhApplication.findMany({
      where: {
        employeeId: employee.id,
        status: { in: ['APPROVED', 'PENDING'] },
        date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
      },
      select: { date: true, totalDays: true, isHalfDay: true, status: true },
    });

    const months: Record<number, { approved: number; pending: number }> = {};
    for (let m = 1; m <= 12; m++) months[m] = { approved: 0, pending: 0 };

    for (const w of wfhApps) {
      const m = new Date(w.date).getMonth() + 1;
      const days = w.totalDays ?? (w.isHalfDay ? 0.5 : 1);
      if (w.status === 'APPROVED') months[m]!.approved += days;
      else months[m]!.pending += days;
    }

    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthly = Object.entries(months).map(([m, v]) => ({
      month: MONTH_NAMES[parseInt(m) - 1],
      monthNum: parseInt(m),
      approved: Math.round(v.approved * 10) / 10,
      pending:  Math.round(v.pending  * 10) / 10,
    }));

    return res.json({
      year,
      daysAllowed: employee.wfhPolicy?.daysAllowed ?? null,
      monthly,
    });
  } catch (error) {
    logger.error('getWfhMonthlyBreakdown error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
