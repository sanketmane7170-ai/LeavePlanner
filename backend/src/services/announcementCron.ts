import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

async function runBirthdayAnnouncementCheck(): Promise<void> {
  logger.info('[announcementCron] Running birthday announcement check...');
  try {
    await prisma.auditLog.create({
      data: {
        adminId: 'CRON',
        action: 'CRON_BIRTHDAY_CHECK_START',
        targetType: 'CRON',
        targetId: 'BIRTHDAY_CHECK',
        meta: 'Birthday check cron started',
      },
    }).catch((e) => console.error('Failed to log birthday cron start:', e));

    const today = new Date();
    // Get current date in Asia/Kolkata
    const kolkataDateStr = today.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
    const [m, d] = kolkataDateStr.split('/');
    const currentMonth = parseInt(m, 10);
    const currentDay = parseInt(d, 10);

    const activeEmployees = await prisma.employee.findMany({
      where: { isActive: true, birthday: { not: null } },
    });

    const birthdayEmployees = activeEmployees.filter((emp) => {
      if (!emp.birthday) return false;
      const b = new Date(emp.birthday);
      return b.getUTCMonth() + 1 === currentMonth && b.getUTCDate() === currentDay;
    });

    logger.info(`[announcementCron] Found ${birthdayEmployees.length} employees with birthday today.`);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    let wishesCreated = 0;
    for (const emp of birthdayEmployees) {
      // Check if birthday wish was already created today to prevent duplicate runs
      const existing = await prisma.announcement.findFirst({
        where: {
          isBirthday: true,
          targetEmployeeId: emp.id,
          createdAt: {
            gte: startOfToday,
            lte: endOfToday,
          },
        },
      });

      if (!existing) {
        const title = `Happy Birthday, ${emp.fullName}! 🎂🎉`;
        const content = `Wishing ${emp.fullName} a very happy birthday! May your day be filled with joy, laughter, and wonderful moments. Have a great year ahead! 🎈✨`;

        await prisma.announcement.create({
          data: {
            title,
            content,
            priority: 'MEDIUM',
            isBirthday: true,
            targetEmployeeId: emp.id,
            scheduledAt: startOfToday,
            expiresAt: endOfToday,
            isActive: true,
          },
        });
        wishesCreated++;
        logger.info(`[announcementCron] Created birthday wish announcement for ${emp.fullName}.`);
      }
    }

    await prisma.auditLog.create({
      data: {
        adminId: 'CRON',
        action: 'CRON_BIRTHDAY_CHECK_COMPLETE',
        targetType: 'CRON',
        targetId: 'BIRTHDAY_CHECK',
        meta: `Birthday check cron complete. Found ${birthdayEmployees.length} birthdays, created ${wishesCreated} wishes.`,
      },
    }).catch((e) => console.error('Failed to log birthday cron complete:', e));
  } catch (error: any) {
    logger.error('[announcementCron] Error checking birthdays:', error);
    await prisma.auditLog.create({
      data: {
        adminId: 'CRON',
        action: 'CRON_BIRTHDAY_CHECK_FAILED',
        targetType: 'CRON',
        targetId: 'BIRTHDAY_CHECK',
        meta: error?.message || String(error),
      },
    }).catch((e) => console.error('Failed to log birthday cron failure:', e));
  }
}

export function startAnnouncementCron(): void {
  // Runs daily at 09:00 AM IST (Asia/Kolkata timezone)
  cron.schedule('0 9 * * *', runBirthdayAnnouncementCheck, {
    timezone: 'Asia/Kolkata',
  });
  logger.info('[announcementCron] Scheduled daily at 09:00 AM IST.');
}

// Allow manual trigger
export { runBirthdayAnnouncementCheck };
