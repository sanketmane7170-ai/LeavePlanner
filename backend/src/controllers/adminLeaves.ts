import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/authenticate';
import { sendLeaveStatusEmail, sendAdminImportedLeaveEmail } from '../services/emailService';
import { calculateProRatedDays } from '../services/leaveCalculator';
import { calculateLeaveDays } from '../services/leaveCalculator';
import { createNotification } from '../services/notificationService';


// ── GET /api/admin/leaves ────────────────────────────────────────────────────
export const getAdminLeaves = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const {
      status,
      leaveType,
      search,
      year,
      dateFrom,
      dateTo,
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(limit, 10));
    const yr = parseInt(year || '') || new Date().getFullYear();

    const where: Record<string, any> = {
      fromDate: { gte: new Date(`${yr}-01-01`), lte: new Date(`${yr}-12-31`) },
    };

    if (status) where['status'] = status;
    if (leaveType) where['leaveType'] = leaveType;

    if (dateFrom && dateTo) {
      where['fromDate'] = { gte: new Date(dateFrom) };
      where['toDate'] = { lte: new Date(dateTo) };
    } else if (dateFrom) {
      where['fromDate'] = { gte: new Date(dateFrom) };
    }

    if (search) {
      where['employee'] = {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { employeeId: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [leaves, total] = await Promise.all([
      prisma.leaveApplication.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              employeeId: true,
              department: true,
              designation: true,
              user: { select: { email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.leaveApplication.count({ where }),
    ]);

    return res.json({
      data: leaves,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    logger.error('getAdminLeaves error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/leaves/:id ─────────────────────────────────────────────────
export const getLeaveById = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);

    const leave = await prisma.leaveApplication.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            user: { select: { email: true } },
            leavePolicy: { include: { rules: true } },
          },
        },
      },
    });

    if (!leave) return res.status(404).json({ message: 'Leave not found' });

    const leaveYear = leave.fromDate.getFullYear();
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [thisMonthLeaves, lastMonthLeaves, balance, orgSettings] = await Promise.all([
      prisma.leaveApplication.findMany({
        where: {
          employeeId: leave.employeeId,
          fromDate: { gte: thisMonthStart, lte: thisMonthEnd },
          status: { in: ['APPROVED', 'PENDING'] },
          NOT: { id },
        },
        orderBy: { fromDate: 'asc' },
      }),
      prisma.leaveApplication.findMany({
        where: {
          employeeId: leave.employeeId,
          fromDate: { gte: lastMonthStart, lte: lastMonthEnd },
          status: { in: ['APPROVED', 'PENDING'] },
        },
        orderBy: { fromDate: 'asc' },
      }),
      prisma.leaveBalance.findFirst({
        where: { employeeId: leave.employeeId, year: leaveYear, isArchived: false },
      }),
      prisma.orgSettings.findUnique({ where: { id: 'global' } }),
    ]);

    const thisMonthApproved = thisMonthLeaves
      .filter((l) => l.status === 'APPROVED')
      .reduce((s, l) => s + l.totalDays, 0);
    const thisMonthTotal = thisMonthLeaves.reduce((s, l) => s + l.totalDays, 0);
    const lastMonthTotal = lastMonthLeaves.reduce((s, l) => s + l.totalDays, 0);

    // Smart suggestions
    const suggestions: Array<{
      type: string;
      severity: 'info' | 'warning' | 'error';
      message: string;
      suggestedPaidDays?: number;
      suggestedUnpaidDays?: number;
    }> = [];

    if (leave.noticeViolation) {
      suggestions.push({
        type: 'NOTICE_VIOLATION',
        severity: 'warning',
        message: 'Employee did not meet the required advance notice period. You may still approve at your discretion.',
      });
    }

    if (leave.status === 'PENDING' && (orgSettings as any)?.monthlyLeaveLimitEnabled && (orgSettings as any)?.monthlyLeaveLimit) {
      const limit = (orgSettings as any).monthlyLeaveLimit as number;
      const totalWithCurrent = thisMonthApproved + leave.totalDays;
      if (totalWithCurrent > limit) {
        const maxPaid = Math.max(0, limit - thisMonthApproved);
        const overLimit = leave.totalDays - maxPaid;
        suggestions.push({
          type: 'MONTHLY_LIMIT_EXCEEDED',
          severity: 'error',
          message: `Approving this exceeds the monthly limit of ${limit} days. Employee has already used ${thisMonthApproved}d this month. Recommended split: ${maxPaid}d paid + ${overLimit}d unpaid.`,
          suggestedPaidDays: maxPaid,
          suggestedUnpaidDays: overLimit,
        });
      } else {
        suggestions.push({
          type: 'WITHIN_LIMIT',
          severity: 'info',
          message: `Within monthly limit. After approval: ${totalWithCurrent}d of ${limit}d used this month.`,
        });
      }
    }

    if (leave.status === 'PENDING' && balance) {
      if (balance.remainingDays <= 0) {
        suggestions.push({
          type: 'NO_BALANCE',
          severity: 'error',
          message: 'Employee has no paid leave balance remaining. This leave must be fully unpaid.',
          suggestedPaidDays: 0,
          suggestedUnpaidDays: leave.totalDays,
        });
      } else if (balance.remainingDays < leave.totalDays) {
        const canPay = balance.remainingDays;
        const unpaid = leave.totalDays - canPay;
        suggestions.push({
          type: 'PARTIAL_BALANCE',
          severity: 'warning',
          message: `Only ${canPay}d paid balance remaining. ${unpaid}d should be marked unpaid.`,
          suggestedPaidDays: canPay,
          suggestedUnpaidDays: unpaid,
        });
      }
    }

    return res.json({
      leave,
      context: {
        thisMonthLeaves,
        lastMonthLeaves,
        thisMonthTotal,
        thisMonthApproved,
        lastMonthTotal,
        monthlyLimit: (orgSettings as any)?.monthlyLeaveLimit ?? null,
        monthlyLimitEnabled: (orgSettings as any)?.monthlyLeaveLimitEnabled ?? false,
        balance,
        suggestions,
      },
    });
  } catch (error) {
    logger.error('getLeaveById error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PATCH /api/admin/leaves/:id/approve ──────────────────────────────────────
export const approveLeave = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    const { paidDays: bodyPaidDays, unpaidDays: bodyUnpaidDays } = req.body as {
      paidDays?: number;
      unpaidDays?: number;
    };

    const leave = await prisma.leaveApplication.findUnique({
      where: { id },
      include: {
        employee: {
          include: { user: { select: { email: true } }, leavePolicy: true },
        },
      },
    });

    if (!leave) return res.status(404).json({ message: 'Leave application not found' });
    if (leave.status !== 'PENDING') {
      return res.status(400).json({ message: `Cannot approve a leave with status "${leave.status}".` });
    }

    // Determine paid/unpaid split
    let effectivePaidDays: number;
    let effectiveUnpaidDays: number;

    if (bodyPaidDays !== undefined || bodyUnpaidDays !== undefined) {
      effectivePaidDays   = Number(bodyPaidDays ?? 0);
      effectiveUnpaidDays = Number(bodyUnpaidDays ?? 0);
      const splitTotal = effectivePaidDays + effectiveUnpaidDays;
      if (Math.abs(splitTotal - leave.totalDays) > 0.01) {
        return res.status(400).json({
          message: `paidDays (${effectivePaidDays}) + unpaidDays (${effectiveUnpaidDays}) must equal totalDays (${leave.totalDays}).`,
        });
      }
    } else {
      effectivePaidDays   = leave.isUnpaid ? 0 : leave.totalDays;
      effectiveUnpaidDays = leave.isUnpaid ? leave.totalDays : 0;
    }

    const year = leave.fromDate.getFullYear();
    const balanceType = (leave.employee as any).leavePolicy?.leaveType ?? leave.leaveType;

    // Balance check only for paid portion
    if (effectivePaidDays > 0) {
      const balance = await prisma.leaveBalance.findUnique({
        where: { employeeId_leaveType_year_isArchived: { employeeId: leave.employeeId, leaveType: balanceType, year, isArchived: false } },
      });
      if (balance && balance.remainingDays < effectivePaidDays) {
        return res.status(400).json({
          message: `Insufficient balance. Employee has ${balance.remainingDays} day(s) remaining, ${effectivePaidDays} paid days required.`,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.leaveApplication.update({
        where: { id },
        data: {
          status:     'APPROVED',
          paidDays:   effectivePaidDays,
          unpaidDays: effectiveUnpaidDays,
          isUnpaid:   effectiveUnpaidDays === leave.totalDays,
        },
      });
      const balance = await tx.leaveBalance.findFirst({
        where: { employeeId: leave.employeeId, leaveType: balanceType, year, isArchived: false },
      });
      if (balance) {
        if (effectivePaidDays > 0) {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: { usedDays: { increment: effectivePaidDays }, remainingDays: { decrement: effectivePaidDays } },
          });
        }
        if (effectiveUnpaidDays > 0) {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: { unpaidDaysUsed: { increment: effectiveUnpaidDays } },
          });
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.userId,
        action: 'APPROVE_LEAVE',
        targetType: 'LEAVE',
        targetId: leave.id,
        meta: JSON.stringify({
          employeeName: leave.employee.fullName,
          leaveType: leave.leaveType,
          fromDate: leave.fromDate.toISOString().split('T')[0],
          toDate: leave.toDate.toISOString().split('T')[0],
          totalDays: leave.totalDays,
          paidDays: effectivePaidDays,
          unpaidDays: effectiveUnpaidDays,
        }),
      },
    }).catch((e) => logger.error('Failed to log approveLeave to auditLog:', e));

    const paidUnpaidNote = effectiveUnpaidDays > 0
      ? ` (${effectivePaidDays}d paid + ${effectiveUnpaidDays}d unpaid)`
      : '';

    sendLeaveStatusEmail(
      (leave.employee as any).user?.email ?? '',
      leave.employee.fullName,
      {
        leaveType: leave.leaveType,
        fromDate: leave.fromDate.toLocaleDateString('en-IN'),
        toDate: leave.toDate.toLocaleDateString('en-IN'),
        isHalfDay: leave.isHalfDay,
        halfDaySlot: leave.halfDaySlot,
        totalDays: leave.totalDays,
        paidDays: effectivePaidDays,
        unpaidDays: effectiveUnpaidDays,
      },
      'APPROVED'
    ).catch((e) => logger.error('[email] sendLeaveStatusEmail APPROVED failed:', e));

    await createNotification(
      leave.employee.userId,
      'LEAVE_APPROVED',
      `Your leave application for ${leave.totalDays} day(s) from ${leave.fromDate.toLocaleDateString('en-IN')} was approved${paidUnpaidNote}.`,
      '/employee/my-leaves'
    );

    return res.json({ message: 'Leave approved successfully.', paidDays: effectivePaidDays, unpaidDays: effectiveUnpaidDays });
  } catch (error) {
    logger.error('approveLeave error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PATCH /api/admin/leaves/:id/reject ───────────────────────────────────────
export const rejectLeave = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    const { comment } = req.body as { comment: string };

    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'A rejection comment is required.' });
    }

    const leave = await prisma.leaveApplication.findUnique({
      where: { id },
      include: {
        employee: { include: { user: { select: { email: true } } } },
      },
    });

    if (!leave) return res.status(404).json({ message: 'Leave application not found' });
    if (leave.status !== 'PENDING') {
      return res.status(400).json({ message: `Cannot reject a leave with status "${leave.status}".` });
    }

    await prisma.leaveApplication.update({
      where: { id },
      data: { status: 'REJECTED', adminComment: comment.trim() },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.userId,
        action: 'REJECT_LEAVE',
        targetType: 'LEAVE',
        targetId: leave.id,
        meta: JSON.stringify({
          employeeName: leave.employee.fullName,
          leaveType: leave.leaveType,
          fromDate: leave.fromDate.toISOString().split('T')[0],
          toDate: leave.toDate.toISOString().split('T')[0],
          totalDays: leave.totalDays,
          comment: comment.trim(),
        }),
      },
    }).catch((e) => logger.error('Failed to log rejectLeave to auditLog:', e));

    sendLeaveStatusEmail(
      (leave.employee as any).user?.email ?? '',
      leave.employee.fullName,
      { leaveType: leave.leaveType, fromDate: leave.fromDate.toLocaleDateString('en-IN'), toDate: leave.toDate.toLocaleDateString('en-IN'), isHalfDay: leave.isHalfDay, halfDaySlot: leave.halfDaySlot, totalDays: leave.totalDays },
      'REJECTED',
      comment.trim()
    ).catch((e) => logger.error('[email] sendLeaveStatusEmail REJECTED failed:', e));

    // Notify employee
    await createNotification(
      leave.employee.userId,
      'LEAVE_REJECTED',
      `Your leave application from ${leave.fromDate.toLocaleDateString('en-IN')} was rejected. Reason: ${comment.trim()}`,
      '/employee/my-leaves'
    );

    return res.json({ message: 'Leave rejected.' });
  } catch (error) {
    logger.error('rejectLeave error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/admin/leaves/bulk-approve ──────────────────────────────────────
export const bulkApproveLeaves = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array is required.' });
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        const leave = await prisma.leaveApplication.findUnique({
          where: { id },
          include: {
            employee: { include: { user: { select: { email: true } }, leavePolicy: true } },
          },
        });

        if (!leave || leave.status !== 'PENDING') {
          results.push({ id, success: false, error: 'Not pending or not found' });
          continue;
        }

        const year = leave.fromDate.getFullYear();
        const balanceType = (leave.employee as any).leavePolicy?.leaveType ?? leave.leaveType;

        if (!leave.isUnpaid) {
          const balance = await prisma.leaveBalance.findUnique({
            where: { employeeId_leaveType_year_isArchived: { employeeId: leave.employeeId, leaveType: balanceType, year, isArchived: false } },
          });
          if (balance && balance.remainingDays < leave.totalDays) {
            results.push({ id, success: false, error: 'Insufficient balance' });
            continue;
          }
        }

        // For bulk approve, treat the leave as fully paid unless isUnpaid was already set
        const bulkPaidDays   = leave.isUnpaid ? 0 : leave.totalDays;
        const bulkUnpaidDays = leave.isUnpaid ? leave.totalDays : 0;

        // Atomic: approve + deduct balance + track unpaid
        await prisma.$transaction(async (tx) => {
          await tx.leaveApplication.update({
            where: { id },
            data: {
              status:     'APPROVED',
              paidDays:   bulkPaidDays,
              unpaidDays: bulkUnpaidDays,
            },
          });
          const balance = await tx.leaveBalance.findFirst({
            where: { employeeId: leave.employeeId, leaveType: balanceType, year, isArchived: false },
          });
          if (balance) {
            if (bulkPaidDays > 0) {
              await tx.leaveBalance.update({
                where: { id: balance.id },
                data: { usedDays: { increment: bulkPaidDays }, remainingDays: { decrement: bulkPaidDays } },
              });
            }
            if (bulkUnpaidDays > 0) {
              await tx.leaveBalance.update({
                where: { id: balance.id },
                data: { unpaidDaysUsed: { increment: bulkUnpaidDays } },
              });
            }
          }
        });

        await prisma.auditLog.create({
          data: {
            adminId: req.user!.userId,
            action: 'APPROVE_LEAVE',
            targetType: 'LEAVE',
            targetId: leave.id,
            meta: JSON.stringify({
              employeeName: leave.employee.fullName,
              leaveType: leave.leaveType,
              fromDate: leave.fromDate.toISOString().split('T')[0],
              toDate: leave.toDate.toISOString().split('T')[0],
              totalDays: leave.totalDays,
              bulk: true,
            }),
          },
        }).catch((e) => logger.error('Failed to log approveLeave (bulk) to auditLog:', e));

        sendLeaveStatusEmail(
          (leave.employee as any).user?.email ?? '',
          leave.employee.fullName,
          { leaveType: leave.leaveType, fromDate: leave.fromDate.toLocaleDateString('en-IN'), toDate: leave.toDate.toLocaleDateString('en-IN'), isHalfDay: leave.isHalfDay, halfDaySlot: leave.halfDaySlot, totalDays: leave.totalDays },
          'APPROVED'
        ).catch(() => {});

        await createNotification(
          leave.employee.userId,
          'LEAVE_APPROVED',
          `Your leave application for ${leave.totalDays} day(s) from ${leave.fromDate.toLocaleDateString('en-IN')} was approved.`,
          '/employee/my-leaves'
        );

        results.push({ id, success: true });
      } catch (err) {
        results.push({ id, success: false, error: 'Internal error' });
      }
    }

    const approved = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return res.json({
      message: `${approved} approved, ${failed} failed.`,
      results,
    });
  } catch (error) {
    logger.error('bulkApproveLeaves error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/admin/leaves/bulk-reject ───────────────────────────────────────
export const bulkRejectLeaves = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { ids, comment } = req.body as { ids: string[]; comment: string };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array is required.' });
    }
    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'A rejection comment is required.' });
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        const leave = await prisma.leaveApplication.findUnique({
          where: { id },
          include: {
            employee: { include: { user: { select: { email: true } } } },
          },
        });

        if (!leave || leave.status !== 'PENDING') {
          results.push({ id, success: false, error: 'Not pending or not found' });
          continue;
        }

        await prisma.leaveApplication.update({
          where: { id },
          data: { status: 'REJECTED', adminComment: comment.trim() },
        });

        await prisma.auditLog.create({
          data: {
            adminId: req.user!.userId,
            action: 'REJECT_LEAVE',
            targetType: 'LEAVE',
            targetId: leave.id,
            meta: JSON.stringify({
              employeeName: leave.employee.fullName,
              leaveType: leave.leaveType,
              fromDate: leave.fromDate.toISOString().split('T')[0],
              toDate: leave.toDate.toISOString().split('T')[0],
              totalDays: leave.totalDays,
              comment: comment.trim(),
              bulk: true,
            }),
          },
        }).catch((e) => logger.error('Failed to log rejectLeave (bulk) to auditLog:', e));

        sendLeaveStatusEmail(
          (leave.employee as any).user?.email ?? '',
          leave.employee.fullName,
          { leaveType: leave.leaveType, fromDate: leave.fromDate.toLocaleDateString('en-IN'), toDate: leave.toDate.toLocaleDateString('en-IN'), isHalfDay: leave.isHalfDay, halfDaySlot: leave.halfDaySlot, totalDays: leave.totalDays },
          'REJECTED',
          comment.trim()
        ).catch(() => {});

        await createNotification(
          leave.employee.userId,
          'LEAVE_REJECTED',
          `Your leave application from ${leave.fromDate.toLocaleDateString('en-IN')} was rejected. Reason: ${comment.trim()}`,
          '/employee/my-leaves'
        );

        results.push({ id, success: true });
      } catch {
        results.push({ id, success: false, error: 'Internal error' });
      }
    }

    const rejected = results.filter((r) => r.success).length;
    return res.json({ message: `${rejected} rejected.`, results });
  } catch (error) {
    logger.error('bulkRejectLeaves error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PATCH /api/admin/leaves/:id/override-absent ──────────────────────────────
export const overrideAbsent = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    const adminId = req.user!.userId;

    const leave = await prisma.leaveApplication.findUnique({ where: { id } });
    if (!leave) return res.status(404).json({ message: 'Leave application not found' });
    if (leave.status !== 'ABSENT') {
      return res.status(400).json({ message: 'Only ABSENT leaves can be overridden.' });
    }

    const year = leave.fromDate.getFullYear();

    // Change to APPROVED and deduct balance (it was already deducted by cron, so check)
    await prisma.leaveApplication.update({
      where: { id },
      data: { status: 'APPROVED', adminComment: 'Override: Absence approved by admin.' },
    });

    // Update any matching AbsentRecord to note the override
    await prisma.absentRecord.updateMany({
      where: { employeeId: leave.employeeId },
      data: { overrideById: adminId },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.userId,
        action: 'OVERRIDE_ABSENT',
        targetType: 'LEAVE',
        targetId: leave.id,
        meta: JSON.stringify({
          employeeId: leave.employeeId,
          leaveType: leave.leaveType,
          fromDate: leave.fromDate.toISOString().split('T')[0],
          toDate: leave.toDate.toISOString().split('T')[0],
          totalDays: leave.totalDays,
        }),
      },
    }).catch((e) => logger.error('Failed to log overrideAbsent to auditLog:', e));

    return res.json({ message: 'Absent leave overridden to Approved.' });
  } catch (error) {
    logger.error('overrideAbsent error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/leaves/balance/:employeeId ─────────────────────────────────
export const getEmployeeBalanceAdmin = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const employeeId = String(req.params['employeeId']);
    const year = parseInt((req.query.year as string) || '') || new Date().getFullYear();

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { leavePolicy: true },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    let balances = await prisma.leaveBalance.findMany({ where: { employeeId, year, isArchived: false } });

    if (balances.length === 0 && employee.leavePolicy) {
      const allocatedDays = calculateProRatedDays(
        employee.leavePolicy.daysAllowed,
        employee.dateOfJoining,
        year
      );
      const b = await prisma.leaveBalance.create({
        data: {
          employeeId,
          leaveType: employee.leavePolicy.leaveType, // GENERAL or specific type
          year,
          totalDays:     allocatedDays,
          usedDays:      0,
          remainingDays: allocatedDays,
        },
      });
      balances = [b];
    }

    return res.json({ balances, leavePolicy: employee.leavePolicy });
  } catch (error) {
    logger.error('getEmployeeBalanceAdmin error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/leaves/employee/:employeeId ────────────────────────────────
export const getEmployeeLeavesAdmin = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const employeeId = String(req.params['employeeId']);
    const year  = parseInt((req.query.year  as string) || '') || new Date().getFullYear();
    const page  = Math.max(1, parseInt((req.query.page  as string) || '1', 10));
    const limit = Math.min(50, parseInt((req.query.limit as string) || '20', 10));
    const status = req.query.status as string | undefined;

    const where: Record<string, any> = {
      employeeId,
      fromDate: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
    };
    if (status) where['status'] = status;

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
    logger.error('getEmployeeLeavesAdmin error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/admin/leaves/import ─────────────────────────────────────────────
export const importLeave = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const adminId = req.user!.userId;
    const {
      employeeId,
      leaveType,
      fromDate: fromStr,
      toDate: toStr,
      isHalfDay = false,
      halfDaySlot,
      reason,
    } = req.body as {
      employeeId: string;
      leaveType: string;
      fromDate: string;
      toDate?: string;
      isHalfDay?: boolean;
      halfDaySlot?: string;
      reason: string;
    };

    if (!employeeId || !leaveType || !fromStr || !reason) {
      return res.status(400).json({ message: 'employeeId, leaveType, fromDate, and reason are required.' });
    }

    const validTypes = ['SICK', 'TRANSPORT_WEATHER', 'PERSONAL'];
    if (!validTypes.includes(leaveType)) {
      return res.status(400).json({ message: 'Invalid leaveType.' });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { leavePolicy: true, workingSchedule: true },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    const from = new Date(fromStr);
    const to   = toStr ? new Date(toStr) : new Date(fromStr);
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    if (from > to) {
      return res.status(400).json({ message: 'fromDate must be before or equal to toDate.' });
    }

    const year = from.getFullYear();
    const holidays = await prisma.publicHoliday.findMany({ where: { year } });
    const totalDays = calculateLeaveDays(from, to, employee.workingSchedule, holidays.map((h) => h.date), isHalfDay);

    if (totalDays <= 0) {
      return res.status(400).json({ message: 'No working days in the selected range.' });
    }

    // Upsert balance — init with pro-rated policy days (or 0 if no matching policy)
    const rawPolicyDays = (employee.leavePolicy?.leaveType === leaveType) ? employee.leavePolicy.daysAllowed : 0;
    const policyDays = calculateProRatedDays(rawPolicyDays, employee.dateOfJoining, year);

    const balance = await prisma.leaveBalance.upsert({
      where: { employeeId_leaveType_year_isArchived: { employeeId, leaveType: leaveType as any, year, isArchived: false } },
      create: { employeeId, leaveType: leaveType as any, year, totalDays: policyDays, usedDays: 0, remainingDays: policyDays },
      update: {},
    });

    const application = await prisma.leaveApplication.create({
      data: {
        employeeId,
        leaveType: leaveType as any,
        fromDate: from,
        toDate: to,
        isHalfDay,
        halfDaySlot: isHalfDay && halfDaySlot ? (halfDaySlot as any) : undefined,
        totalDays,
        reason,
        status: 'APPROVED',
        isAdminEntry: true,
        paidDays:   totalDays, // admin imports are treated as fully paid
        unpaidDays: 0,
      },
    });

    await prisma.leaveBalance.update({
      where: { id: balance.id },
      data: {
        usedDays:     { increment: totalDays },
        remainingDays: { decrement: totalDays },
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId,
        action: 'IMPORT_LEAVE',
        targetType: 'LeaveApplication',
        targetId: application.id,
        meta: JSON.stringify({ employeeId, leaveType, totalDays, year }),
      },
    });

    // Notify employee of the admin-imported leave
    const empUser = await prisma.user.findUnique({ where: { id: employee.userId }, select: { email: true } });
    if (empUser?.email) {
      sendAdminImportedLeaveEmail(
        empUser.email,
        employee.fullName,
        { leaveType, fromDate: from.toLocaleDateString('en-IN'), toDate: to.toLocaleDateString('en-IN'), isHalfDay, halfDaySlot: isHalfDay && halfDaySlot ? halfDaySlot : null, totalDays, reason }
      ).catch((e) => logger.error('[email] sendAdminImportedLeaveEmail failed:', e));
    }

    return res.status(201).json({ message: 'Leave record imported.', application });
  } catch (error) {
    logger.error('importLeave error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/admin/leaves/import/bulk ────────────────────────────────────────
export const importBulkLeaves = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const adminId = req.user!.userId;
    const { employeeId, records } = req.body as {
      employeeId: string;
      records: Array<{
        leaveType: string;
        fromDate: string;
        toDate?: string;
        reason: string;
        isHalfDay?: boolean;
        halfDaySlot?: string;
      }>;
    };

    if (!employeeId) return res.status(400).json({ message: 'employeeId is required.' });
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: 'records array is required.' });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { leavePolicy: true, workingSchedule: true },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });

    const results: Array<{ index: number; success: boolean; error?: string; totalDays?: number }> = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i]!;
      try {
        const { leaveType, fromDate: fromStr, toDate: toStr, reason, isHalfDay = false, halfDaySlot } = record;

        const validTypes = ['SICK', 'TRANSPORT_WEATHER', 'PERSONAL'];
        if (!validTypes.includes(leaveType)) throw new Error(`Invalid leaveType "${leaveType}"`);
        if (!fromStr) throw new Error('fromDate is required');
        if (!reason) throw new Error('reason is required');

        const from = new Date(fromStr);
        const to   = toStr ? new Date(toStr) : new Date(fromStr);
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);

        if (from > to) throw new Error('fromDate must be before toDate');

        const year = from.getFullYear();
        const holidays = await prisma.publicHoliday.findMany({ where: { year } });
        const totalDays = calculateLeaveDays(from, to, employee.workingSchedule, holidays.map((h) => h.date), isHalfDay);

        if (totalDays <= 0) throw new Error('No working days in range');

        const rawPolicyDays = (employee.leavePolicy?.leaveType === leaveType) ? employee.leavePolicy.daysAllowed : 0;
        const policyDays = calculateProRatedDays(rawPolicyDays, employee.dateOfJoining, year);

        const balance = await prisma.leaveBalance.upsert({
          where: { employeeId_leaveType_year_isArchived: { employeeId, leaveType: leaveType as any, year, isArchived: false } },
          create: { employeeId, leaveType: leaveType as any, year, totalDays: policyDays, usedDays: 0, remainingDays: policyDays },
          update: {},
        });

        const application = await prisma.leaveApplication.create({
          data: {
            employeeId,
            leaveType: leaveType as any,
            fromDate: from,
            toDate: to,
            isHalfDay,
            halfDaySlot: isHalfDay && halfDaySlot ? (halfDaySlot as any) : undefined,
            totalDays,
            reason,
            status: 'APPROVED',
            isAdminEntry: true,
            paidDays:   totalDays, // admin imports are fully paid
            unpaidDays: 0,
          },
        });

        await prisma.leaveBalance.update({
          where: { id: balance.id },
          data: { usedDays: { increment: totalDays }, remainingDays: { decrement: totalDays } },
        });

        await prisma.auditLog.create({
          data: {
            adminId,
            action: 'IMPORT_LEAVE_BULK',
            targetType: 'LeaveApplication',
            targetId: application.id,
            meta: JSON.stringify({ employeeId, leaveType, totalDays, year }),
          },
        });

        results.push({ index: i, success: true, totalDays });
      } catch (err: any) {
        results.push({ index: i, success: false, error: err.message });
      }
    }

    const imported = results.filter((r) => r.success).length;
    const failed   = results.filter((r) => !r.success).length;

    return res.json({ message: `${imported} imported, ${failed} failed.`, results });
  } catch (error) {
    logger.error('importBulkLeaves error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
