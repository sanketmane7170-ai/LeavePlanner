import cron from 'node-cron';
import { prisma } from '../lib/prisma';

async function runNoticePeriodExpiry(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // Find employees on notice period whose effective end date has passed
    const expired = await prisma.employee.findMany({
      where: {
        isOnNoticePeriod: true,
        OR: [
          { noticePeriodEnd:   { lt: today } },
          { earlyReleaseDate:  { lt: today } },
        ],
      },
      select: { id: true, fullName: true, employeeId: true },
    });

    if (expired.length === 0) return;

    await prisma.employee.updateMany({
      where: { id: { in: expired.map((e) => e.id) } },
      data: {
        isOnNoticePeriod: false,
        // Keep the date fields for historical reference — only clear the flag
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId:    'CRON',
        action:     'NOTICE_PERIOD_AUTO_EXPIRED',
        targetType: 'CRON',
        targetId:   'NOTICE_PERIOD_EXPIRY',
        meta: JSON.stringify({ expiredCount: expired.length, employees: expired.map((e) => e.employeeId) }),
      },
    }).catch(() => {});

    console.log(`[noticePeriodCron] Expired notice period for ${expired.length} employee(s).`);
  } catch (err) {
    console.error('[noticePeriodCron] Error:', err);
  }
}

export function startNoticePeriodCron(): void {
  // Run at 00:05 every day (5 minutes after midnight, after absentCron)
  cron.schedule('5 0 * * *', runNoticePeriodExpiry, { timezone: process.env.TZ || 'Asia/Kolkata' });
  console.log('[noticePeriodCron] Scheduled at 00:05 daily.');
}
