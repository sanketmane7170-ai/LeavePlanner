import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

// ── Weekly: Password Reset Token Cleanup ──────────────────────────────────────
async function runTokenCleanup(): Promise<void> {
  try {
    const result = await prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (result.count > 0) {
      logger.info(`[maintenanceCron] Deleted ${result.count} expired password reset token(s).`);
      await prisma.auditLog.create({
        data: {
          adminId: 'CRON',
          action: 'CRON_TOKEN_CLEANUP',
          targetType: 'CRON',
          targetId: 'MAINTENANCE',
          meta: JSON.stringify({ deletedTokens: result.count }),
        },
      }).catch(() => {});
    }
  } catch (error: any) {
    logger.error('[maintenanceCron] Token cleanup error:', error);
  }
}

// ── Monthly: Stale Notice Period Sweep + Inactive Employee Audit ──────────────
async function runMonthlySweep(): Promise<void> {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  logger.info('[maintenanceCron] Running monthly maintenance sweep…');

  try {
    // 1. Clear stuck notice periods — employees whose end date (or early release) passed
    //    but isOnNoticePeriod is still true (e.g., server was down when noticePeriodCron ran)
    const stuckNotice = await prisma.employee.findMany({
      where: {
        isOnNoticePeriod: true,
        OR: [
          { noticePeriodEnd:  { lt: today } },
          { earlyReleaseDate: { lt: today } },
        ],
      },
      select: { id: true, fullName: true, employeeId: true, noticePeriodEnd: true, earlyReleaseDate: true },
    });

    if (stuckNotice.length > 0) {
      await prisma.employee.updateMany({
        where: { id: { in: stuckNotice.map((e) => e.id) } },
        data:  { isOnNoticePeriod: false },
      });
      logger.info(`[maintenanceCron] Cleared ${stuckNotice.length} stuck notice period(s).`);
      await prisma.auditLog.create({
        data: {
          adminId: 'CRON',
          action: 'CRON_STALE_NOTICE_CLEARED',
          targetType: 'CRON',
          targetId: 'MAINTENANCE',
          meta: JSON.stringify({ cleared: stuckNotice.map((e) => e.employeeId) }),
        },
      }).catch(() => {});
    }

    // 2. Inactive employee audit — find employees marked isActive=true but with no
    //    leave applications, WFH applications, or absent records in the last 6 months.
    //    This is informational only — we log it and let admin decide.
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const potentiallyInactive = await prisma.employee.findMany({
      where: {
        isActive: true,
        dateOfJoining: { lt: sixMonthsAgo }, // joined more than 6 months ago
        leaveApplications: { none: { createdAt: { gte: sixMonthsAgo } } },
        wfhApplications:   { none: { createdAt: { gte: sixMonthsAgo } } },
        absentRecords:     { none: { date:      { gte: sixMonthsAgo } } },
      },
      select: { id: true, employeeId: true, fullName: true },
    });

    if (potentiallyInactive.length > 0) {
      logger.warn(`[maintenanceCron] ${potentiallyInactive.length} employee(s) flagged as potentially inactive (no activity in 6+ months).`);
      await prisma.auditLog.create({
        data: {
          adminId: 'CRON',
          action: 'CRON_INACTIVE_EMPLOYEE_AUDIT',
          targetType: 'CRON',
          targetId: 'MAINTENANCE',
          meta: JSON.stringify({
            count: potentiallyInactive.length,
            employees: potentiallyInactive.map((e) => e.employeeId),
            note: 'These employees have no leave/WFH/absent records in 6+ months. Admin review recommended.',
          }),
        },
      }).catch(() => {});
    }

    // 3. Remove old dismissed announcement records older than 90 days
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dismissedResult = await prisma.announcementDismissal.deleteMany({
      where: { dismissedAt: { lt: ninetyDaysAgo } },
    });
    if (dismissedResult.count > 0) {
      logger.info(`[maintenanceCron] Pruned ${dismissedResult.count} old announcement dismissal records.`);
    }

    logger.info('[maintenanceCron] Monthly sweep complete.');
    await prisma.auditLog.create({
      data: {
        adminId: 'CRON',
        action: 'CRON_MONTHLY_SWEEP_COMPLETE',
        targetType: 'CRON',
        targetId: 'MAINTENANCE',
        meta: JSON.stringify({
          stuckNoticeCleared: stuckNotice.length,
          potentiallyInactive: potentiallyInactive.length,
          dismissalsPruned: dismissedResult.count,
        }),
      },
    }).catch(() => {});
  } catch (error: any) {
    logger.error('[maintenanceCron] Monthly sweep error:', error);
  }
}

export function startMaintenanceCron(): void {
  // Token cleanup: every Sunday at 03:00 AM
  cron.schedule('0 3 * * 0', runTokenCleanup, { timezone: process.env.TZ || 'Asia/Kolkata' });
  logger.info('[maintenanceCron] Token cleanup scheduled: every Sunday at 03:00 AM.');

  // Monthly sweep: 1st of every month at 04:00 AM
  cron.schedule('0 4 1 * *', runMonthlySweep, { timezone: process.env.TZ || 'Asia/Kolkata' });
  logger.info('[maintenanceCron] Monthly sweep scheduled: 1st of every month at 04:00 AM.');
}

export { runTokenCleanup, runMonthlySweep };
