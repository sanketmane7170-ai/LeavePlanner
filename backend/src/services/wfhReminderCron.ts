import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { sendWfhBalanceReminderEmail } from './emailService';
import { createNotification } from './notificationService';

async function runWfhBalanceReminder(): Promise<void> {
  const now  = new Date();
  const year = now.getFullYear();

  // Only send in the first 7 days of the month (cron already ensures Monday 1–7)
  logger.info(`[wfhReminderCron] Sending WFH balance reminders for ${year}…`);

  const yearStart = new Date(year, 0, 1, 0, 0, 0, 0);
  const yearEnd   = new Date(year, 11, 31, 23, 59, 59, 999);

  try {
    // Fetch active employees who have a WFH policy
    const employees = await prisma.employee.findMany({
      where:   { isActive: true, wfhPolicyId: { not: null } },
      include: {
        wfhPolicy:           { select: { id: true, name: true, daysAllowed: true } },
        wfhPolicyExceptions: { select: { policyId: true, overrideDays: true } },
        user:                { select: { email: true, id: true } },
      },
    });

    if (!employees.length) {
      logger.info('[wfhReminderCron] No employees with WFH policies.');
      return;
    }

    // Batch-fetch WFH usage for all employees this year
    const wfhAgg = await prisma.wfhApplication.groupBy({
      by: ['employeeId'],
      where: { status: 'APPROVED', date: { gte: yearStart, lte: yearEnd } },
      _sum: { totalDays: true },
    });
    const usedMap = new Map(wfhAgg.map((w) => [w.employeeId, w._sum.totalDays ?? 0]));

    let sent = 0;
    for (const emp of employees) {
      const policy = emp.wfhPolicy;
      if (!policy) continue;

      const exception = (emp.wfhPolicyExceptions as any[]).find((ex: any) => ex.policyId === emp.wfhPolicyId);
      const allowedDays = exception ? exception.overrideDays : policy.daysAllowed;
      const usedDays    = usedMap.get(emp.id) ?? 0;
      const remaining   = Math.max(0, allowedDays - usedDays);

      const email = (emp.user as any)?.email as string | undefined;
      const userId = (emp.user as any)?.id as string | undefined;

      // Only notify employees who have used at least 1 day or have more than 0 remaining
      // (skip employees with no policy activity — likely on full leave/notice)
      if (!email || !userId) continue;

      try {
        await sendWfhBalanceReminderEmail(email, emp.fullName, {
          policyName:    policy.name,
          totalDays:     allowedDays,
          usedDays,
          remainingDays: remaining,
          year,
        });

        await createNotification(
          userId,
          'WFH_BALANCE_REMINDER',
          `Monthly WFH Reminder: You have ${remaining} WFH day${remaining !== 1 ? 's' : ''} remaining for ${year} (${usedDays}/${allowedDays} used).`,
          '/employee/apply-wfh'
        ).catch(() => {});

        sent++;
      } catch (e) {
        logger.error(`[wfhReminderCron] Failed for employee ${emp.id}:`, e);
      }
    }

    await prisma.auditLog.create({
      data: {
        adminId: 'CRON',
        action: 'CRON_WFH_REMINDER_SENT',
        targetType: 'CRON',
        targetId: 'WFH_REMINDER',
        meta: JSON.stringify({ year, sent, total: employees.length }),
      },
    }).catch(() => {});

    logger.info(`[wfhReminderCron] Sent ${sent}/${employees.length} WFH reminders.`);
  } catch (error: any) {
    logger.error('[wfhReminderCron] Error:', error);
  }
}

export function startWfhReminderCron(): void {
  // First Monday of every month at 09:00 AM
  // '0 9 1-7 * 1' = "09:00 on days 1–7 of the month that fall on a Monday"
  cron.schedule('0 9 1-7 * 1', runWfhBalanceReminder, { timezone: process.env.TZ || 'Asia/Kolkata' });
  logger.info('[wfhReminderCron] Scheduled: first Monday of every month at 09:00 AM.');
}

export { runWfhBalanceReminder };
