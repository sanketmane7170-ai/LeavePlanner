import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/authenticate';
import {
  calculateLeaveDays,
  isDuringProbation,
  calculateProRatedDays,
} from '../services/leaveCalculator';
import { createNotification } from '../services/notificationService';
import {
  sendLeaveAppliedAdminEmail,
  sendLeaveSubmittedEmail,
  sendLeaveCancelledAdminEmail,
} from '../services/emailService';

// ── helpers ───────────────────────────────────────────────────────────────────

async function getEmployeeForUser(userId: string) {
  return prisma.employee.findUnique({
    where: { userId },
    include: {
      leavePolicy:      { include: { rules: { orderBy: { minDays: 'asc' } } } },
      workingSchedule:  true,
      policyExceptions: true,
      user:             { select: { email: true } },
    },
  });
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

export async function getOrInitBalance(
  employeeId: string,
  leaveType: string,
  year: number,
  daysAllowed: number,
  carryForward: boolean
) {
  // Only look at the active (non-archived) balance
  const existing = await prisma.leaveBalance.findFirst({
    where: { employeeId, leaveType: leaveType as any, year, isArchived: false },
  });
  if (existing) return existing;

  let carryDays = 0;
  if (carryForward) {
    const prev = await prisma.leaveBalance.findFirst({
      where: { employeeId, leaveType: leaveType as any, year: year - 1, isArchived: false },
    });
    if (prev) carryDays = prev.remainingDays;
  }

  const total = daysAllowed + carryDays;
  return prisma.leaveBalance.create({
    data: { employeeId, leaveType: leaveType as any, year, totalDays: total, usedDays: 0, remainingDays: total },
  });
}

// ── GET /api/employee/balances ────────────────────────────────────────────────
export const getBalances = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    const year = parseInt((req.query.year as string) || '') || new Date().getFullYear();

    const employee = await getEmployeeForUser(userId);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // Gatekeeper: no policy → archive any leftover active rows and return nothing
    if (!employee.leavePolicy) {
      await prisma.leaveBalance.updateMany({
        where: { employeeId: employee.id, year, isArchived: false },
        data: { isArchived: true, archivedAt: new Date() },
      });
      const holidays = await prisma.publicHoliday.findMany({
        where: { year },
        orderBy: { date: 'asc' },
        select: { id: true, name: true, date: true, year: true },
      });
      return res.json({
        balances: [],
        employee: {
          id: employee.id,
          fullName: employee.fullName,
          employeeId: employee.employeeId,
          dateOfJoining: employee.dateOfJoining,
          probationMonths: employee.probationMonths,
          leavePolicy: null,
          workingSchedule: employee.workingSchedule,
          policyExceptions: employee.policyExceptions,
        },
        holidays,
      });
    }

    let balances = await prisma.leaveBalance.findMany({
      where: { employeeId: employee.id, year, isArchived: false },
    });

    if (balances.length === 0) {
      const allocatedDays = calculateProRatedDays(
        employee.leavePolicy.daysAllowed,
        employee.dateOfJoining,
        year
      );
      const b = await getOrInitBalance(
        employee.id,
        employee.leavePolicy.leaveType,
        year,
        allocatedDays,
        employee.leavePolicy.carryForward
      );
      balances = [b];
    }

    const holidays = await prisma.publicHoliday.findMany({
      where: { year },
      orderBy: { date: 'asc' },
      select: { id: true, name: true, date: true, year: true },
    });

    return res.json({
      balances,
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        employeeId: employee.employeeId,
        dateOfJoining: employee.dateOfJoining,
        probationMonths: employee.probationMonths,
        leavePolicy: employee.leavePolicy,
        workingSchedule: employee.workingSchedule,
        policyExceptions: employee.policyExceptions,
      },
      holidays,
    });
  } catch (error) {
    logger.error('getBalances error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/employee/leaves/apply ──────────────────────────────────────────
export const applyLeave = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    const {
      leaveType,
      fromDate,
      toDate,
      isHalfDay = false,
      halfDaySlot,
      reason,
    } = req.body as {
      leaveType: string;
      fromDate: string;
      toDate: string;
      isHalfDay?: boolean;
      halfDaySlot?: string;
      reason: string;
    };

    if (!leaveType || !fromDate || !toDate || !reason) {
      return res.status(400).json({ message: 'leaveType, fromDate, toDate, and reason are required' });
    }
    if (typeof reason !== 'string' || reason.trim().length === 0 || reason.length > 500) {
      return res.status(400).json({ message: 'Reason must be between 1 and 500 characters.' });
    }
    const validTypes = ['SICK', 'TRANSPORT_WEATHER', 'PERSONAL', 'GENERAL'];
    if (!validTypes.includes(leaveType)) {
      return res.status(400).json({ message: 'Invalid leaveType.' });
    }
    if (isNaN(new Date(fromDate).getTime()) || isNaN(new Date(toDate).getTime())) {
      return res.status(400).json({ message: 'Invalid date format.' });
    }

    const employee = await getEmployeeForUser(userId);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (!employee.leavePolicy) {
      return res.status(400).json({ message: 'No leave policy assigned. Please contact your administrator.' });
    }
    // Only restrict type if policy is explicitly tied to a specific leave type (not GENERAL)
    if (employee.leavePolicy.leaveType !== 'GENERAL' && employee.leavePolicy.leaveType !== leaveType) {
      return res.status(400).json({ message: `Your policy covers "${employee.leavePolicy.leaveType}" leave only.` });
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    if (from > to) return res.status(400).json({ message: 'fromDate must be before or equal to toDate' });

    if (isHalfDay && from.toDateString() !== to.toDateString()) {
      return res.status(400).json({ message: 'Half-day leave must be a single day.' });
    }
    if (isHalfDay && !employee.leavePolicy.halfDayAllowed) {
      return res.status(400).json({ message: 'Half-day leave is not allowed under your policy.' });
    }

    const year = from.getFullYear();
    const holidays = await prisma.publicHoliday.findMany({ where: { year } });
    const holidayDates = holidays.map((h) => h.date);

    const totalDays = calculateLeaveDays(from, to, employee.workingSchedule, holidayDates, isHalfDay);
    if (totalDays <= 0) {
      return res.status(400).json({ message: 'No working days in the selected date range.' });
    }

    let isUnpaid = false;
    if (employee.dateOfJoining && employee.leavePolicy.probationRule !== 'NONE') {
      const inProbation = isDuringProbation(from, employee.dateOfJoining, employee.probationMonths);
      if (inProbation) {
        if (employee.leavePolicy.probationRule === 'NO_LEAVES') {
          return res.status(400).json({ message: 'Leave is not permitted during your probation period.' });
        }
        if (employee.leavePolicy.probationRule === 'UNPAID_ALLOWED') {
          isUnpaid = true; // allowed, but no balance deduction
        }
      }
    }

    // Base settings from policy
    let requiresApproval = employee.leavePolicy.approvalRequired;
    let effectiveNoticeRequired = employee.leavePolicy.noticeRequired;
    let effectiveMinNoticeDays = employee.leavePolicy.minNoticeDays;

    // Apply conditional rules — find all matching rules, then pick the most specific
    const rules = (employee.leavePolicy as any).rules as Array<{
      operator: string; minDays: number;
      approvalRequired: boolean; noticeRequired: boolean; minNoticeDays: number;
    }> ?? [];

    if (rules.length > 0) {
      const matching = rules.filter((r) => evaluateOperator(totalDays, r.operator, r.minDays));
      if (matching.length > 0) {
        // For GTE/GT: highest-threshold rule wins (most specific for the duration)
        // For LTE/LT: lowest-threshold rule wins (most restrictive upper bound)
        // Sort descending by minDays — for GTE/GT this gives the strictest applicable rule
        matching.sort((a, b) => b.minDays - a.minDays);
        const applied = matching[0];
        requiresApproval = applied.approvalRequired;
        effectiveNoticeRequired = applied.noticeRequired;
        effectiveMinNoticeDays = applied.minNoticeDays;
      }
    }

    // Notice period check (uses effective settings from policy or matching rule)
    let noticeViolation = false;
    if (effectiveNoticeRequired && effectiveMinNoticeDays > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const earliest = new Date(today);
      earliest.setDate(earliest.getDate() + effectiveMinNoticeDays);
      if (from < earliest) {
        noticeViolation = true; // flag for admin — employee can still submit
      }
    }

    const blackout = employee.policyExceptions.find(
      (ex) =>
        ex.policyId === employee.leavePolicyId &&
        new Date(ex.blackoutFrom) <= to &&
        new Date(ex.blackoutTo) >= from
    );
    if (blackout) {
      return res.status(400).json({ message: 'Your selected dates fall within a restricted blackout period for this policy.' });
    }

    const overlap = await prisma.leaveApplication.findFirst({
      where: {
        employeeId: employee.id,
        status: { in: ['PENDING', 'APPROVED'] },
        fromDate: { lte: to },
        toDate: { gte: from },
      },
    });
    if (overlap) {
      return res.status(400).json({ message: 'You already have a leave application for the selected dates.' });
    }

    // Balance pool is keyed by the POLICY's leaveType (GENERAL = shared pool for all types)
    const policyLeaveType = employee.leavePolicy.leaveType;
    const allocatedDays = calculateProRatedDays(
      employee.leavePolicy.daysAllowed,
      employee.dateOfJoining,
      year
    );

    // Unpaid leaves (during probation) bypass balance checks
    let balance = null;
    if (!isUnpaid) {
      balance = await getOrInitBalance(
        employee.id,
        policyLeaveType,
        year,
        allocatedDays,
        employee.leavePolicy.carryForward
      );
      if (balance.remainingDays < totalDays) {
        return res.status(400).json({
          message: `Insufficient balance. ${balance.remainingDays} day(s) remaining, ${totalDays} required.`,
        });
      }
    }

    const application = await prisma.leaveApplication.create({
      data: {
        employeeId: employee.id,
        leaveType: leaveType as any,
        fromDate: from,
        toDate: to,
        isHalfDay,
        halfDaySlot: isHalfDay && halfDaySlot ? (halfDaySlot as any) : undefined,
        totalDays,
        reason,
        status: requiresApproval ? 'PENDING' : 'APPROVED',
        isUnpaid,
        noticeViolation,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: userId,
        action: 'APPLY_LEAVE',
        targetType: 'LEAVE',
        targetId: application.id,
        meta: JSON.stringify({
          leaveType: application.leaveType,
          fromDate: application.fromDate.toISOString().split('T')[0],
          toDate: application.toDate.toISOString().split('T')[0],
          totalDays: application.totalDays,
          status: application.status,
        }),
      },
    }).catch((e) => logger.error('Failed to log applyLeave to auditLog:', e));

    if (!requiresApproval && !isUnpaid && balance) {
      await prisma.leaveBalance.update({
        where: { id: balance.id },
        data: {
          usedDays: { increment: totalDays },
          remainingDays: { decrement: totalDays },
        },
      });
    }

    // In-app notifications for admins
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, email: true },
    });
    await Promise.all(
      admins.map((admin) =>
        createNotification(
          admin.id,
          'LEAVE_APPLIED',
          `${employee.fullName} applied for ${totalDays} day(s) of ${leaveType} leave.`,
          '/admin/leave-requests'
        )
      )
    );

    // Emails (fire-and-forget, never block the response)
    const emailDetails = {
      leaveType,
      fromDate:    from.toLocaleDateString('en-IN'),
      toDate:      to.toLocaleDateString('en-IN'),
      isHalfDay,
      halfDaySlot: halfDaySlot ?? null,
      totalDays,
      reason,
      requiresApproval,
    };

    if (requiresApproval) {
      const adminEmails = admins.map((a) => a.email);
      sendLeaveAppliedAdminEmail(
        adminEmails,
        { fullName: employee.fullName, employeeId: employee.employeeId, department: employee.department },
        emailDetails
      ).catch((e) => logger.error('[email] sendLeaveAppliedAdminEmail failed:', e));
    }

    sendLeaveSubmittedEmail(
      (employee as any).user?.email ?? '',
      employee.fullName,
      emailDetails
    ).catch((e) => logger.error('[email] sendLeaveSubmittedEmail failed:', e));

    return res.status(201).json({
      message: requiresApproval
        ? 'Leave application submitted. Awaiting approval.'
        : 'Leave application approved automatically.',
      application,
    });
  } catch (error) {
    logger.error('applyLeave error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/employee/leaves ──────────────────────────────────────────────────
export const getMyLeaves = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    const year = parseInt((req.query.year as string) || '') || new Date().getFullYear();
    const status = req.query.status as string | undefined;
    const leaveType = req.query.leaveType as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(50, parseInt((req.query.limit as string) || '20', 10));

    const employee = await prisma.employee.findUnique({ where: { userId }, select: { id: true } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const where: Record<string, any> = {
      employeeId: employee.id,
      fromDate: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
    };
    if (status) where['status'] = status;
    if (leaveType) where['leaveType'] = leaveType;

    const [leaves, total] = await Promise.all([
      prisma.leaveApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.leaveApplication.count({ where }),
    ]);

    return res.json({ data: leaves, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error('getMyLeaves error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PATCH /api/employee/leaves/:id/cancel ─────────────────────────────────────
export const cancelLeave = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params['id']);

    const employee = await prisma.employee.findUnique({
      where: { userId },
      select: { id: true, fullName: true, employeeId: true },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const leave = await prisma.leaveApplication.findFirst({
      where: { id, employeeId: employee.id },
    });
    if (!leave) return res.status(404).json({ message: 'Leave application not found' });
    if (leave.status !== 'PENDING') {
      return res.status(400).json({ message: `Cannot cancel a leave with status "${leave.status}".` });
    }

    await prisma.leaveApplication.update({ where: { id }, data: { status: 'CANCELLED' } });

    await prisma.auditLog.create({
      data: {
        adminId: userId,
        action: 'CANCEL_LEAVE',
        targetType: 'LEAVE',
        targetId: leave.id,
        meta: JSON.stringify({
          leaveType: leave.leaveType,
          fromDate: leave.fromDate.toISOString().split('T')[0],
          toDate: leave.toDate.toISOString().split('T')[0],
          totalDays: leave.totalDays,
        }),
      },
    }).catch((e) => logger.error('Failed to log cancelLeave to auditLog:', e));

    // Notify admins via email
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { email: true } });
    sendLeaveCancelledAdminEmail(
      admins.map((a) => a.email),
      { fullName: employee.fullName, employeeId: employee.employeeId },
      {
        leaveType: leave.leaveType,
        fromDate:  leave.fromDate.toLocaleDateString('en-IN'),
        toDate:    leave.toDate.toLocaleDateString('en-IN'),
        totalDays: leave.totalDays,
      }
    ).catch((e) => logger.error('[email] sendLeaveCancelledAdminEmail failed:', e));

    return res.json({ message: 'Leave application cancelled.' });
  } catch (error) {
    logger.error('cancelLeave error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
