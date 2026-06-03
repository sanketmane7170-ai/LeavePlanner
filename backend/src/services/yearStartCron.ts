import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getOrInitBalance } from '../controllers/leaves';
import { sendYearStartRolloverEmail } from './emailService';

async function runYearStartRollover(): Promise<void> {
  const now  = new Date();
  const year = now.getFullYear(); // The new year that just started

  logger.info(`[yearStartCron] Initializing leave balances for ${year}…`);

  try {
    await prisma.auditLog.create({
      data: { adminId: 'CRON', action: 'CRON_YEAR_START_ROLLOVER_START', targetType: 'CRON', targetId: 'YEAR_START', meta: `Rollover for ${year}` },
    }).catch(() => {});

    // Fetch all active employees who have a leave policy
    const employees = await prisma.employee.findMany({
      where:   { isActive: true, leavePolicyId: { not: null } },
      include: { leavePolicy: { select: { id: true, daysAllowed: true, carryForward: true, leaveType: true } } },
    });

    if (!employees.length) {
      logger.info('[yearStartCron] No employees with leave policies — skipping.');
      return;
    }

    let processed = 0;
    let carryCount = 0;

    // Process in batches to avoid overwhelming the DB
    const BATCH = 10;
    for (let i = 0; i < employees.length; i += BATCH) {
      const batch = employees.slice(i, i + BATCH);
      await Promise.all(batch.map(async (emp) => {
        const policy = emp.leavePolicy;
        if (!policy) return;
        try {
          // Check if a carry-forward balance exists from the previous year
          const prevBalance = policy.carryForward
            ? await prisma.leaveBalance.findFirst({
                where: { employeeId: emp.id, year: year - 1, isArchived: false },
              })
            : null;
          if (prevBalance && prevBalance.remainingDays > 0) carryCount++;

          await getOrInitBalance(emp.id, policy.leaveType, year, policy.daysAllowed, policy.carryForward);
          processed++;
        } catch (e) {
          logger.error(`[yearStartCron] Failed for employee ${emp.id}:`, e);
        }
      }));
    }

    const completedAt = new Date().toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    logger.info(`[yearStartCron] Rollover complete: ${processed}/${employees.length} employees, ${carryCount} carry-forwards.`);

    // Email all admins
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { email: true } });
    const adminEmails = admins.map((a) => a.email);
    await sendYearStartRolloverEmail(adminEmails, { year, count: processed, carryCount, completedAt });

    await prisma.auditLog.create({
      data: {
        adminId: 'CRON',
        action: 'CRON_YEAR_START_ROLLOVER_COMPLETE',
        targetType: 'CRON',
        targetId: 'YEAR_START',
        meta: JSON.stringify({ year, processed, carryCount }),
      },
    }).catch(() => {});
  } catch (error: any) {
    logger.error('[yearStartCron] Fatal error:', error);
    await prisma.auditLog.create({
      data: { adminId: 'CRON', action: 'CRON_YEAR_START_ROLLOVER_FAILED', targetType: 'CRON', targetId: 'YEAR_START', meta: error?.message ?? String(error) },
    }).catch(() => {});
  }
}

export function startYearStartCron(): void {
  // January 1st at 01:00 AM
  cron.schedule('0 1 1 1 *', runYearStartRollover, { timezone: process.env.TZ || 'Asia/Kolkata' });
  logger.info('[yearStartCron] Scheduled: January 1st at 01:00 AM.');
}

export { runYearStartRollover };
