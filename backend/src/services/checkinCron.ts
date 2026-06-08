import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { generateCode, toDateStr } from '../controllers/checkin';

function parseHHMM(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

// Generate daily check-in code at the configured time (default 09:00)
// Runs every minute and checks if now matches the configured time
async function maybeGenerateDailyCode(): Promise<void> {
  try {
    const settings = await (prisma.orgSettings as any).upsert({
      where:  { id: 'global' },
      create: { id: 'global', orgName: 'Innovizia', timezone: 'Asia/Kolkata' },
      update: {},
    });

    if (!settings.checkInEnabled) return;

    const { h, m } = parseHHMM(settings.checkInCodeTime ?? '09:00');
    const now = new Date();
    if (now.getHours() !== h || now.getMinutes() !== m) return;

    const today = toDateStr();
    const existing = await (prisma as any).dailyCheckInCode.findUnique({ where: { date: today } });
    if (existing) return; // already generated

    const code = generateCode();
    const expiresAt = new Date();
    expiresAt.setHours(23, 59, 59, 999);

    await (prisma as any).dailyCheckInCode.create({
      data: { code, date: today, expiresAt, createdBy: null },
    });
    logger.info(`[CheckIn Cron] Daily code generated: ${code} for ${today}`);
  } catch (err) {
    logger.error('[CheckIn Cron] maybeGenerateDailyCode error:', err);
  }
}

// Auto-mark absent: runs at midnight + 5 min, marks all NOT_CHECKED_IN employees as ABSENT
async function markAbsentees(): Promise<void> {
  try {
    const settings = await (prisma.orgSettings as any).upsert({
      where:  { id: 'global' },
      create: { id: 'global', orgName: 'Innovizia', timezone: 'Asia/Kolkata' },
      update: {},
    });

    if (!settings.checkInEnabled) return;

    // Yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = toDateStr(yesterday);

    // Get all active employees
    const employees = await prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    // Get all existing records for yesterday
    const records = await (prisma as any).checkInRecord.findMany({
      where: { date: dateStr },
      select: { employeeId: true, status: true },
    });
    const recordedSet = new Set(records.map((r: any) => r.employeeId));

    // Find employees on approved leave or WFH for yesterday
    const onLeave = await prisma.leaveApplication.findMany({
      where: {
        fromDate: { lte: yesterday },
        toDate:   { gte: yesterday },
        status:   'APPROVED',
      },
      select: { employeeId: true },
    });
    const onWfh = await prisma.wfhApplication.findMany({
      where: {
        date:   { lte: yesterday },
        toDate: { gte: yesterday },
        status: 'APPROVED',
      },
      select: { employeeId: true },
    });

    const onLeaveSet = new Set(onLeave.map((l: any) => l.employeeId));
    const onWfhSet  = new Set(onWfh.map((w: any) => w.employeeId));

    const now = new Date();
    let absentCount = 0;

    for (const emp of employees) {
      if (recordedSet.has(emp.id)) continue; // already has a record

      if (onLeaveSet.has(emp.id)) {
        await (prisma as any).checkInRecord.upsert({
          where:  { employeeId_date: { employeeId: emp.id, date: dateStr } },
          update: { status: 'ON_LEAVE' },
          create: { employeeId: emp.id, date: dateStr, status: 'ON_LEAVE', updatedAt: now },
        });
      } else if (onWfhSet.has(emp.id)) {
        await (prisma as any).checkInRecord.upsert({
          where:  { employeeId_date: { employeeId: emp.id, date: dateStr } },
          update: { status: 'ON_WFH' },
          create: { employeeId: emp.id, date: dateStr, status: 'ON_WFH', updatedAt: now },
        });
      } else {
        await (prisma as any).checkInRecord.upsert({
          where:  { employeeId_date: { employeeId: emp.id, date: dateStr } },
          update: { status: 'ABSENT' },
          create: { employeeId: emp.id, date: dateStr, status: 'ABSENT', updatedAt: now },
        });
        absentCount++;
      }
    }

    logger.info(`[CheckIn Cron] Absent marked for ${dateStr}: ${absentCount} employees`);
  } catch (err) {
    logger.error('[CheckIn Cron] markAbsentees error:', err);
  }
}

export function startCheckInCrons(): void {
  // Every minute: check if it's time to generate the daily code
  cron.schedule('* * * * *', maybeGenerateDailyCode, { timezone: 'Asia/Kolkata' });

  // 00:05 every night: mark absentees for the previous day
  cron.schedule('5 0 * * *', markAbsentees, { timezone: 'Asia/Kolkata' });

  logger.info('[CheckIn Cron] Scheduled: daily code generation + midnight absent marking');
}
