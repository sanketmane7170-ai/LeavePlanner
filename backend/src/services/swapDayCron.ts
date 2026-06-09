import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { sendSwapDayWeeklyDigestEmail } from './emailService';
import { createNotification } from './notificationService';

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

async function runSwapDayWeeklyDigest(): Promise<void> {
  logger.info('[swapDayCron] Running weekly swap day digest…');

  try {
    const now = new Date();
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);

    // Overdue: comp date has passed but still PENDING
    const overdue = await prisma.swapDay.findMany({
      where: {
        status: 'PENDING_COMPENSATION',
        compensationDate: { lt: now },
      },
      include: {
        employee: { select: { fullName: true, employeeId: true, department: true } },
      },
      orderBy: { compensationDate: 'asc' },
    });

    // Due soon: comp date is within next 7 days
    const dueSoon = await prisma.swapDay.findMany({
      where: {
        status: 'PENDING_COMPENSATION',
        compensationDate: { gte: now, lte: in7Days },
      },
      include: {
        employee: { select: { fullName: true, employeeId: true, department: true } },
      },
      orderBy: { compensationDate: 'asc' },
    });

    const totalPending = await prisma.swapDay.count({ where: { status: 'PENDING_COMPENSATION' } });

    if (totalPending === 0) {
      logger.info('[swapDayCron] No pending swap days — skipping digest.');
      return;
    }

    // Build HTML list of overdue rows for email
    const overdueListHtml = overdue.length > 0
      ? `<p style="font-weight:600;color:#7F1D1D;margin:0 0 8px 0;">⚠️ Overdue Swap Days (${overdue.length})</p>` +
        overdue.map((s) =>
          `<p style="margin:0 0 4px 0;font-size:13px;color:#374151;">• <strong>${s.employee.fullName}</strong> (${s.employee.employeeId}) — Absent: ${fmtDate(s.absentDate)}, Comp was due: ${s.compensationDate ? fmtDate(s.compensationDate) : 'Not set'}</p>`
        ).join('') +
        (dueSoon.length > 0
          ? `<p style="font-weight:600;color:#92400E;margin:16px 0 8px 0;">⏰ Due This Week (${dueSoon.length})</p>` +
            dueSoon.map((s) =>
              `<p style="margin:0 0 4px 0;font-size:13px;color:#374151;">• <strong>${s.employee.fullName}</strong> (${s.employee.employeeId}) — Absent: ${fmtDate(s.absentDate)}, Comp due: ${s.compensationDate ? fmtDate(s.compensationDate) : 'Not set'}</p>`
            ).join('')
          : '')
      : dueSoon.length > 0
        ? `<p style="font-weight:600;color:#92400E;margin:0 0 8px 0;">⏰ Due This Week (${dueSoon.length})</p>` +
          dueSoon.map((s) =>
            `<p style="margin:0 0 4px 0;font-size:13px;color:#374151;">• <strong>${s.employee.fullName}</strong> (${s.employee.employeeId}) — Absent: ${fmtDate(s.absentDate)}, Comp due: ${s.compensationDate ? fmtDate(s.compensationDate) : 'Not set'}</p>`
          ).join('')
        : '';

    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { email: true, id: true },
    });

    await sendSwapDayWeeklyDigestEmail(
      admins.map((a) => a.email),
      {
        pendingCount: totalPending,
        overdueCount: overdue.length,
        dueSoonCount: dueSoon.length,
        overdueListHtml,
      }
    );

    // In-app notification when there are overdue swap days
    if (overdue.length > 0) {
      for (const admin of admins) {
        await createNotification(
          admin.id,
          'SWAP_DAY_OVERDUE',
          `${overdue.length} swap day${overdue.length > 1 ? 's are' : ' is'} overdue — compensation date has passed without being marked.`,
          '/admin/swap-days'
        ).catch(() => {});
      }
    }

    await prisma.auditLog.create({
      data: {
        adminId: 'CRON',
        action: 'CRON_SWAP_DAY_WEEKLY_DIGEST',
        targetType: 'CRON',
        targetId: 'SWAP_DAY_DIGEST',
        meta: JSON.stringify({ pending: totalPending, overdue: overdue.length, dueSoon: dueSoon.length }),
      },
    }).catch(() => {});

    logger.info(`[swapDayCron] Digest sent — pending: ${totalPending}, overdue: ${overdue.length}, due soon: ${dueSoon.length}`);
  } catch (error: any) {
    logger.error('[swapDayCron] Error:', error);
  }
}

export function startSwapDayCron(): void {
  // Every Monday at 9:00 AM IST
  cron.schedule('0 9 * * 1', runSwapDayWeeklyDigest, { timezone: process.env.TZ || 'Asia/Kolkata' });
  logger.info('[swapDayCron] Scheduled every Monday at 09:00 AM.');
}

export { runSwapDayWeeklyDigest };
