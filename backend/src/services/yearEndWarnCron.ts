import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { sendLeaveExpiryWarningEmail } from './emailService';
import { createNotification } from './notificationService';

const EXPIRY_THRESHOLD_DAYS = 3; // warn if >= 3 days remaining

async function runYearEndLeaveWarning(): Promise<void> {
  const year = new Date().getFullYear();

  logger.info(`[yearEndWarnCron] Running year-end leave lapse warning for ${year}…`);

  try {
    // Find employees whose active balance has > threshold remaining days
    // AND whose policy has carryForward = false (no point warning if they carry forward)
    const balances = await prisma.leaveBalance.findMany({
      where: {
        year,
        isArchived: false,
        remainingDays: { gte: EXPIRY_THRESHOLD_DAYS },
        employee: {
          isActive: true,
          leavePolicy: { carryForward: false },
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            userId: true,
            user: { select: { email: true } },
            leavePolicy: { select: { name: true, carryForward: true } },
          },
        },
      },
    });

    if (!balances.length) {
      logger.info('[yearEndWarnCron] No balances qualify for expiry warning.');
      return;
    }

    logger.info(`[yearEndWarnCron] Sending expiry warning to ${balances.length} employee(s).`);

    let sent = 0;
    for (const bal of balances) {
      const emp    = bal.employee;
      const email  = (emp.user as any)?.email as string | undefined;
      const policy = emp.leavePolicy;
      if (!email || !policy) continue;

      try {
        await sendLeaveExpiryWarningEmail(email, emp.fullName, {
          policyName:    policy.name,
          totalDays:     bal.totalDays,
          usedDays:      bal.usedDays,
          remainingDays: bal.remainingDays,
          year,
        });

        await createNotification(
          emp.userId,
          'LEAVE_EXPIRY_WARNING',
          `You have ${bal.remainingDays} leave day${bal.remainingDays !== 1 ? 's' : ''} remaining that will expire on 31 Dec ${year}. Please plan to use them.`,
          '/employee/apply-leave'
        ).catch(() => {});

        sent++;
      } catch (e) {
        logger.error(`[yearEndWarnCron] Failed for employee ${emp.id}:`, e);
      }
    }

    await prisma.auditLog.create({
      data: {
        adminId: 'CRON',
        action: 'CRON_YEAR_END_WARN_SENT',
        targetType: 'CRON',
        targetId: 'YEAR_END_WARN',
        meta: JSON.stringify({ year, sent, total: balances.length }),
      },
    }).catch(() => {});

    logger.info(`[yearEndWarnCron] Sent ${sent}/${balances.length} expiry warnings.`);
  } catch (error: any) {
    logger.error('[yearEndWarnCron] Error:', error);
  }
}

export function startYearEndWarnCron(): void {
  // October 1st and November 1st at 08:00 AM
  cron.schedule('0 8 1 10,11 *', runYearEndLeaveWarning, { timezone: process.env.TZ || 'Asia/Kolkata' });
  logger.info('[yearEndWarnCron] Scheduled: October 1st and November 1st at 08:00 AM.');
}

export { runYearEndLeaveWarning };
