import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { sendMailWithAttachment } from './emailService';

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatTime(dt: Date | null): string {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

async function sendWeeklyAttendanceSummaries(): Promise<void> {
  try {
    const settings = await (prisma.orgSettings as any).findUnique({ where: { id: 'global' } });
    if (!settings?.weeklyEmailEnabled) return;

    // Last 7 days (Mon–Sun of previous week)
    const today    = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun
    // Go back to last Sunday, then subtract 6 more to get last Monday
    const lastSun = new Date(today);
    lastSun.setDate(today.getDate() - (dayOfWeek === 0 ? 0 : dayOfWeek));
    const lastMon = new Date(lastSun);
    lastMon.setDate(lastSun.getDate() - 6);

    const fromStr = toDateStr(lastMon);
    const toStr   = toDateStr(lastSun);

    const employees = await prisma.employee.findMany({
      where:   { isActive: true },
      include: { user: { select: { email: true } } },
    });

    let sent = 0;
    for (const emp of employees) {
      const email = emp.user?.email;
      if (!email) continue;

      const records = await (prisma as any).checkInRecord.findMany({
        where: { employeeId: emp.id, date: { gte: fromStr, lte: toStr } },
        orderBy: { date: 'asc' },
      });

      const present   = records.filter((r: any) => r.status === 'CHECKED_IN' || r.status === 'CHECKED_OUT').length;
      const absent    = records.filter((r: any) => r.status === 'ABSENT').length;
      const lateCount = records.filter((r: any) => r.isLate).length;
      const totalHrs  = records.reduce((s: number, r: any) => s + (r.workingHours ?? 0), 0);
      const avgHrs    = present > 0 ? (totalHrs / present).toFixed(1) : '0';

      const rowsHtml = records.map((r: any) => {
        const statusColor = r.status === 'ABSENT' ? '#ef4444' : r.isLate ? '#f59e0b' : '#22c55e';
        const statusLabel = r.status === 'ABSENT' ? 'Absent'
          : r.status === 'ON_LEAVE' ? 'On Leave'
          : r.status === 'ON_WFH'   ? 'WFH'
          : r.status === 'CHECKED_OUT' ? 'Present' : 'Checked In';

        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569;">${r.date}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">
            <span style="color:${statusColor};font-weight:600;">${statusLabel}</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569;">${formatTime(r.checkInTime)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569;">${formatTime(r.checkOutTime)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569;">${r.workingHours != null ? `${r.workingHours}h` : '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:${r.isLate ? '#f59e0b' : '#94a3b8'};">
            ${r.isLate ? `Late +${r.lateMinutes}m` : '—'}
          </td>
        </tr>`;
      }).join('');

      const html = `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;font-family:'Segoe UI',Arial,sans-serif;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr>
        <td style="background:#6366f1;padding:28px 32px;">
          <p style="margin:0;color:#c7d2fe;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Weekly Report</p>
          <h1 style="margin:6px 0 0;color:#fff;font-size:22px;font-weight:700;">Attendance Summary</h1>
          <p style="margin:4px 0 0;color:#c7d2fe;font-size:14px;">${fromStr} &ndash; ${toStr}</p>
        </td>
      </tr>
      <!-- Greeting -->
      <tr>
        <td style="padding:24px 32px 16px;">
          <p style="margin:0;color:#1e293b;font-size:16px;">Hi <strong>${emp.fullName.split(' ')[0]}</strong>,</p>
          <p style="margin:8px 0 0;color:#64748b;font-size:14px;line-height:1.5;">Here is your attendance summary for last week. Review your check-in and check-out times below.</p>
        </td>
      </tr>
      <!-- Stats -->
      <tr>
        <td style="padding:0 32px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${[
                { label: 'Present', value: present, color: '#22c55e' },
                { label: 'Absent', value: absent, color: '#ef4444' },
                { label: 'Late', value: lateCount, color: '#f59e0b' },
                { label: 'Avg Hours', value: `${avgHrs}h`, color: '#6366f1' },
              ].map(s => `
              <td width="25%" style="padding:4px;">
                <div style="background:#f8fafc;border-radius:10px;padding:14px 12px;text-align:center;border:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:22px;font-weight:700;color:${s.color};">${s.value}</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">${s.label}</p>
                </div>
              </td>`).join('')}
            </tr>
          </table>
        </td>
      </tr>
      <!-- Table -->
      <tr>
        <td style="padding:0 32px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
            <thead>
              <tr style="background:#f8fafc;">
                ${['Date','Status','Check-In','Check-Out','Hours','Late'].map(h =>
                  `<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;">${h}</th>`
                ).join('')}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8;">No attendance records this week</td></tr>'}
            </tbody>
          </table>
        </td>
      </tr>
      <!-- Footer -->
      <tr>
        <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
            This is an automated weekly attendance report from Innovizia LeavePlanner.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>`;

      try {
        await sendMailWithAttachment({
          to:      email,
          subject: `Weekly Attendance Summary — ${fromStr} to ${toStr}`,
          html,
        });
        sent++;
      } catch (e) {
        logger.error(`[WeeklyAttCron] Failed to send to ${email}:`, e);
      }
    }

    logger.info(`[WeeklyAttCron] Sent ${sent} weekly attendance emails for ${fromStr} – ${toStr}`);
  } catch (err) {
    logger.error('[WeeklyAttCron] Error:', err);
  }
}

export function startWeeklyAttendanceEmailCron(): void {
  // Every Monday at 08:00 AM IST — send summary for previous Mon–Sun
  cron.schedule('0 8 * * 1', sendWeeklyAttendanceSummaries, { timezone: 'Asia/Kolkata' });
  logger.info('[WeeklyAttCron] Scheduled: Monday 08:00 IST');
}
