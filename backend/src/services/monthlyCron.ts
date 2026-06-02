import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { generateAndSaveAllMonthlyReports } from './reportCalculator';
import { generateExcelBuffer, sendEmployeeMonthlyReport, sendAdminMonthlyReport } from './reportEmailService';

async function runMonthlyReport(): Promise<void> {
  // Report is for the PREVIOUS calendar month
  const now  = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = prev.getMonth() + 1; // 1–12
  const year  = prev.getFullYear();

  logger.info(`[monthly-cron] Generating report for ${month}/${year}…`);

  try {
    await prisma.auditLog.create({
      data: {
        adminId: 'CRON',
        action: 'CRON_MONTHLY_REPORT_START',
        targetType: 'CRON',
        targetId: 'MONTHLY_REPORT',
        meta: `Generating report for ${month}/${year}`,
      },
    }).catch((e) => console.error('Failed to log monthly report start:', e));

    // ── 1. Calculate & persist reports ────────────────────────────────────
    const reports = await generateAndSaveAllMonthlyReports(month, year);
    logger.info(`[monthly-cron] Calculated ${reports.length} employee reports.`);

    if (reports.length === 0) {
      logger.info('[monthly-cron] No active employees — skipping emails.');
      await prisma.auditLog.create({
        data: {
          adminId: 'CRON',
          action: 'CRON_MONTHLY_REPORT_SUCCESS',
          targetType: 'CRON',
          targetId: 'MONTHLY_REPORT',
          meta: `No active employees — reports complete for ${month}/${year}`,
        },
      }).catch((e) => console.error('Failed to log monthly report success empty:', e));
      return;
    }

    // ── 2. Send individual emails to each employee ────────────────────────
    const orgSettings = await prisma.orgSettings.findUnique({ where: { id: 'global' } });
    const orgName     = orgSettings?.orgName ?? 'Innovizia';

    let emailsSent = 0;
    for (const report of reports) {
      if (!report.email) continue;
      try {
        await sendEmployeeMonthlyReport(report, orgName);
        emailsSent++;
      } catch (err) {
        logger.error(`[monthly-cron] Employee email failed for ${report.fullName}:`, err);
      }
    }
    logger.info(`[monthly-cron] Sent ${emailsSent}/${reports.length} employee emails.`);

    // ── 3. Generate Excel & send admin summary ────────────────────────────
    const excelBuffer  = await generateExcelBuffer(reports, month, year);
    const adminUsers   = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { email: true } });
    const adminEmails  = adminUsers.map((u) => u.email).filter(Boolean);

    if (adminEmails.length > 0) {
      await sendAdminMonthlyReport(reports, month, year, adminEmails, orgName, excelBuffer);
    }

    logger.info(`[monthly-cron] Monthly report complete for ${month}/${year}.`);
    await prisma.auditLog.create({
      data: {
        adminId: 'CRON',
        action: 'CRON_MONTHLY_REPORT_SUCCESS',
        targetType: 'CRON',
        targetId: 'MONTHLY_REPORT',
        meta: `Reports complete for ${month}/${year}. Calculated ${reports.length} reports.`,
      },
    }).catch((e) => console.error('Failed to log monthly report success:', e));
  } catch (err: any) {
    logger.error('[monthly-cron] Report generation failed:', err);
    await prisma.auditLog.create({
      data: {
        adminId: 'CRON',
        action: 'CRON_MONTHLY_REPORT_FAILED',
        targetType: 'CRON',
        targetId: 'MONTHLY_REPORT',
        meta: err?.message || String(err),
      },
    }).catch((e) => console.error('Failed to log monthly report failure:', e));
  }
}

export function startMonthlyCron(): void {
  // 1st of every month at 10:00 AM IST
  cron.schedule('0 10 1 * *', runMonthlyReport, { timezone: 'Asia/Kolkata' });
  logger.info('[monthly-cron] Scheduled for 10:00 AM IST on the 1st of each month.');
}
