import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { createNotification } from './notificationService';

async function runHolidayReminder(): Promise<void> {
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(today); target.setDate(target.getDate() + 2); // 2 days ahead
  target.setHours(0, 0, 0, 0);
  const targetEnd = new Date(target); targetEnd.setHours(23, 59, 59, 999);

  try {
    const holidays = await prisma.publicHoliday.findMany({
      where: { date: { gte: target, lte: targetEnd } },
    });

    if (!holidays.length) return; // No holiday in 2 days

    const holidayNames = holidays.map((h) => h.name).join(' & ');
    const dateStr = target.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' });

    logger.info(`[holidayReminderCron] Holiday in 2 days: ${holidayNames} on ${dateStr}`);

    // Fetch all active employee userIds
    const employees = await prisma.employee.findMany({
      where:  { isActive: true },
      select: { userId: true },
    });

    let sent = 0;
    const BATCH = 20;
    for (let i = 0; i < employees.length; i += BATCH) {
      const batch = employees.slice(i, i + BATCH);
      await Promise.all(batch.map((emp) =>
        createNotification(
          emp.userId,
          'HOLIDAY_REMINDER',
          `Reminder: ${dateStr} (${holidayNames}) is a public holiday — offices will be closed.`,
          '/employee/dashboard'
        ).catch(() => {})
      ));
      sent += batch.length;
    }

    await prisma.auditLog.create({
      data: {
        adminId: 'CRON',
        action: 'CRON_HOLIDAY_REMINDER_SENT',
        targetType: 'CRON',
        targetId: 'HOLIDAY_REMINDER',
        meta: JSON.stringify({ holiday: holidayNames, date: target.toISOString().split('T')[0], notified: sent }),
      },
    }).catch(() => {});

    logger.info(`[holidayReminderCron] Notified ${sent} employees about ${holidayNames}.`);
  } catch (error: any) {
    logger.error('[holidayReminderCron] Error:', error);
  }
}

export function startHolidayReminderCron(): void {
  // Daily at 07:00 AM — checks if any holiday falls exactly 2 days from today
  cron.schedule('0 7 * * *', runHolidayReminder, { timezone: process.env.TZ || 'Asia/Kolkata' });
  logger.info('[holidayReminderCron] Scheduled daily at 07:00 AM.');
}

export { runHolidayReminder };
