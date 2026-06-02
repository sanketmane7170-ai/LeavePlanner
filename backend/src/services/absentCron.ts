import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { sendLeaveStatusEmail } from './emailService';

async function runAbsentCheck(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`[absentCron] Running at ${new Date().toISOString()}`);

  try {
    // All PENDING leaves whose range includes today
    const pendingLeaves = await prisma.leaveApplication.findMany({
      where: {
        status: 'PENDING',
        fromDate: { lte: today },
        toDate: { gte: today },
      },
      include: {
        employee: {
          include: {
            user: { select: { email: true } },
            leavePolicy: { select: { leaveType: true } },
          },
        },
      },
    });

    if (pendingLeaves.length === 0) {
      console.log('[absentCron] No pending leaves to process.');
      return;
    }

    let processed = 0;

    for (const leave of pendingLeaves) {
      try {
        // Mark the leave as ABSENT
        await prisma.leaveApplication.update({
          where: { id: leave.id },
          data: { status: 'ABSENT' },
        });

        // Create an AbsentRecord for today
        await prisma.absentRecord.create({
          data: {
            employeeId: leave.employeeId,
            date: today,
            reason: `Auto-absent: Leave application #${leave.id.slice(-8)} was not approved`,
          },
        });

        // Deduct from balance (only for paid leaves)
        if (!leave.isUnpaid) {
          const year = today.getFullYear();
          const balanceType = (leave.employee as any).leavePolicy?.leaveType ?? leave.leaveType;
          const balance = await prisma.leaveBalance.findFirst({
            where: { employeeId: leave.employeeId, leaveType: balanceType, year, isArchived: false },
          });
          if (balance) {
            const newRemaining = Math.max(0, balance.remainingDays - leave.totalDays);
            await prisma.leaveBalance.update({
              where: { id: balance.id },
              data: { usedDays: { increment: leave.totalDays }, remainingDays: newRemaining },
            });
          }
        }

        // Email notification
        sendLeaveStatusEmail(
          leave.employee.user.email,
          leave.employee.fullName,
          { leaveType: leave.leaveType, fromDate: leave.fromDate.toLocaleDateString('en-IN'), toDate: leave.toDate.toLocaleDateString('en-IN'), isHalfDay: leave.isHalfDay, halfDaySlot: leave.halfDaySlot ?? null, totalDays: leave.totalDays },
          'ABSENT'
        ).catch((emailErr) => {
          console.error(`[absentCron] Email failed for leave ${leave.id}:`, emailErr);
        });

        processed++;
      } catch (leaveErr) {
        console.error(`[absentCron] Error processing leave ${leave.id}:`, leaveErr);
      }
    }

    console.log(`[absentCron] Processed ${processed}/${pendingLeaves.length} leaves.`);
  } catch (error) {
    console.error('[absentCron] Fatal error:', error);
  }
}

export function startAbsentCron(): void {
  // Runs daily at 23:59
  cron.schedule('59 23 * * *', runAbsentCheck, {
    timezone: process.env.TZ || 'Asia/Kolkata',
  });
  console.log('[absentCron] Scheduled at 23:59 daily.');
}

// Allow manual trigger for testing
export { runAbsentCheck };
