import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { sendProbationEndingAdminEmail } from './emailService';
import { createNotification } from './notificationService';

async function runProbationCheck(): Promise<void> {
  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const in7Days   = new Date(today); in7Days.setDate(in7Days.getDate() + 7);
  const in1Day    = new Date(today); in1Day.setDate(in1Day.getDate() + 1);

  logger.info('[probationCron] Checking probation endings…');

  try {
    // Find all active employees who have a dateOfJoining
    const employees = await prisma.employee.findMany({
      where:   { isActive: true, dateOfJoining: { not: null } },
      select:  { id: true, fullName: true, employeeId: true, department: true, dateOfJoining: true, probationMonths: true },
    });

    const ending: { fullName: string; employeeId: string; department: string | null; probationEnds: string }[] = [];

    for (const emp of employees) {
      if (!emp.dateOfJoining) continue;
      const probEnd = new Date(emp.dateOfJoining);
      probEnd.setMonth(probEnd.getMonth() + emp.probationMonths);
      probEnd.setHours(0, 0, 0, 0);

      // Probation ending in the next 1–7 days (not already past)
      if (probEnd >= in1Day && probEnd <= in7Days) {
        ending.push({
          fullName:   emp.fullName,
          employeeId: emp.employeeId,
          department: emp.department,
          probationEnds: probEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        });
      }
    }

    if (!ending.length) {
      logger.info('[probationCron] No probations ending in 7 days.');
      return;
    }

    logger.info(`[probationCron] Found ${ending.length} employee(s) ending probation soon.`);

    // Email all admins
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { email: true, id: true } });
    await sendProbationEndingAdminEmail(admins.map((a) => a.email), ending);

    // In-app notification to all admins
    const names = ending.map((e) => e.fullName).join(', ');
    for (const admin of admins) {
      await createNotification(
        admin.id,
        'PROBATION_ENDING',
        `${ending.length} employee${ending.length > 1 ? 's' : ''} ending probation within 7 days: ${names}. Please review their policies.`,
        '/admin/employees'
      ).catch(() => {});
    }

    await prisma.auditLog.create({
      data: {
        adminId: 'CRON',
        action: 'CRON_PROBATION_ALERT_SENT',
        targetType: 'CRON',
        targetId: 'PROBATION_CHECK',
        meta: JSON.stringify({ count: ending.length, employees: ending.map((e) => e.employeeId) }),
      },
    }).catch(() => {});
  } catch (error: any) {
    logger.error('[probationCron] Error:', error);
  }
}

export function startProbationCron(): void {
  // Daily at 09:30 AM
  cron.schedule('30 9 * * *', runProbationCheck, { timezone: process.env.TZ || 'Asia/Kolkata' });
  logger.info('[probationCron] Scheduled daily at 09:30 AM.');
}

export { runProbationCheck };
