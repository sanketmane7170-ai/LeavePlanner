import ExcelJS from 'exceljs';
import { sendMailWithAttachment } from './emailService';
import { MONTH_NAMES, type MonthlyReportData } from './reportCalculator';
import { logger } from '../lib/logger';

// ── Excel generation ──────────────────────────────────────────────────────────

export async function generateExcelBuffer(
  reports: MonthlyReportData[],
  month: number,
  year: number,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator   = 'Innovizia HR';
  wb.created   = new Date();
  wb.modified  = new Date();

  const ws = wb.addWorksheet(`${MONTH_NAMES[month - 1]} ${year}`);

  // ── Title rows ─────────────────────────────────────────────────────────────
  ws.mergeCells('A1:K1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `Monthly Attendance Report — ${MONTH_NAMES[month - 1]} ${year}`;
  titleCell.font  = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:K2');
  const subCell = ws.getCell('A2');
  subCell.value = `Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  subCell.font  = { italic: true, color: { argb: 'FF555555' } };
  subCell.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 18;

  ws.addRow([]); // blank row

  // ── Header row ─────────────────────────────────────────────────────────────
  const headerRow = ws.addRow([
    '#', 'Employee Name', 'Employee ID', 'Department', 'Designation',
    'Working Days', 'Present', 'Leaves', 'Absent', 'WFH', 'Attendance %',
  ]);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border    = {
      top: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } },
    };
  });

  // ── Data rows ──────────────────────────────────────────────────────────────
  reports.forEach((r, i) => {
    const row = ws.addRow([
      i + 1,
      r.fullName,
      r.employeeIdStr,
      r.department ?? '—',
      r.designation ?? '—',
      r.totalWorkingDays,
      r.presentDays,
      r.leaveDays,
      r.absentDays,
      r.wfhDays,
      r.attendancePct,
    ]);
    row.height = 18;

    const isEven = i % 2 === 1;
    row.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'middle', horizontal: colNumber <= 5 ? 'left' : 'center' };
      if (isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      }
    });

    // Attendance % column — conditional colour
    const pctCell = row.getCell(11);
    const pct     = r.attendancePct;
    pctCell.value = `${pct}%`;
    pctCell.font  = {
      bold:  true,
      color: { argb: pct >= 90 ? 'FF15803D' : pct >= 75 ? 'FFB45309' : 'FFDC2626' },
    };
  });

  // ── Totals / summary row ───────────────────────────────────────────────────
  ws.addRow([]);
  const totals = ws.addRow([
    '', 'TOTAL / AVG', '', '', '',
    reports.reduce((s, r) => s + r.totalWorkingDays, 0) / (reports.length || 1),
    reports.reduce((s, r) => s + r.presentDays, 0) / (reports.length || 1),
    reports.reduce((s, r) => s + r.leaveDays, 0) / (reports.length || 1),
    reports.reduce((s, r) => s + r.absentDays, 0) / (reports.length || 1),
    reports.reduce((s, r) => s + r.wfhDays, 0) / (reports.length || 1),
    `${(reports.reduce((s, r) => s + r.attendancePct, 0) / (reports.length || 1)).toFixed(1)}%`,
  ]);
  totals.font = { bold: true };
  totals.getCell(2).font = { bold: true, color: { argb: 'FF1E3A5F' } };

  // ── Column widths ──────────────────────────────────────────────────────────
  ws.columns = [
    { key: 'no',    width: 5  },
    { key: 'name',  width: 26 },
    { key: 'id',    width: 12 },
    { key: 'dept',  width: 18 },
    { key: 'desig', width: 18 },
    { key: 'wd',    width: 14 },
    { key: 'pres',  width: 10 },
    { key: 'leave', width: 10 },
    { key: 'abs',   width: 10 },
    { key: 'wfh',   width: 10 },
    { key: 'pct',   width: 14 },
  ];

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

// ── Email HTML helpers ────────────────────────────────────────────────────────

function statBox(label: string, value: string | number, color: string): string {
  return `
    <td style="text-align:center;padding:12px 16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;min-width:90px;">
      <div style="font-size:24px;font-weight:700;color:${color};">${value}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px;">${label}</div>
    </td>`;
}

function emailWrapper(orgName: string, body: string): string {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
    <div style="background:#1e3a5f;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">${orgName}</h1>
      <p style="color:#93c5fd;margin:4px 0 0;font-size:13px;">HR Management System</p>
    </div>
    <div style="padding:28px 32px;">${body}</div>
    <div style="background:#f1f5f9;padding:16px 32px;text-align:center;font-size:11px;color:#94a3b8;">
      This is an automated message from ${orgName} HR. Please do not reply.
    </div>
  </div>`;
}

// ── Send individual employee email ────────────────────────────────────────────

export async function sendEmployeeMonthlyReport(
  report: MonthlyReportData,
  orgName: string,
): Promise<void> {
  const monthLabel = `${MONTH_NAMES[report.month - 1]} ${report.year}`;
  const subject    = `Your Attendance Report — ${monthLabel}`;

  const leaveBreakdownHtml = report.leaveBreakdown.length > 0
    ? `<p style="margin:16px 0 8px;font-size:13px;color:#475569;font-weight:600;">Leave Breakdown</p>
       <ul style="margin:0;padding-left:20px;font-size:13px;color:#475569;">
         ${report.leaveBreakdown.map((l) => `<li>${l.label}: <strong>${l.days} day${l.days !== 1 ? 's' : ''}</strong></li>`).join('')}
       </ul>`
    : '';

  const body = emailWrapper(orgName, `
    <h2 style="color:#1e293b;margin:0 0 4px;">Attendance Report</h2>
    <p style="color:#64748b;margin:0 0 24px;font-size:14px;">${monthLabel}</p>

    <p style="color:#334155;font-size:14px;margin:0 0 20px;">
      Dear <strong>${report.fullName}</strong>, here is your attendance summary for <strong>${monthLabel}</strong>.
    </p>

    <table cellspacing="8" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:8px;">
      <tr>
        ${statBox('Working Days', report.totalWorkingDays, '#1e293b')}
        ${statBox('Present', report.presentDays, '#15803d')}
        ${statBox('On Leave', report.leaveDays, '#b45309')}
        ${statBox('Absent', report.absentDays, '#dc2626')}
        ${statBox('WFH', report.wfhDays, '#2563eb')}
      </tr>
    </table>

    <div style="margin:16px 0;padding:12px 16px;background:${report.attendancePct >= 90 ? '#f0fdf4' : report.attendancePct >= 75 ? '#fffbeb' : '#fef2f2'};border-left:4px solid ${report.attendancePct >= 90 ? '#22c55e' : report.attendancePct >= 75 ? '#f59e0b' : '#ef4444'};border-radius:4px;">
      <span style="font-size:15px;font-weight:700;color:${report.attendancePct >= 90 ? '#15803d' : report.attendancePct >= 75 ? '#b45309' : '#dc2626'};">
        ${report.attendancePct}% Attendance Rate
      </span>
    </div>

    ${leaveBreakdownHtml}

    <p style="color:#64748b;font-size:13px;margin-top:24px;">
      If you notice any discrepancies, please contact HR immediately.
    </p>
  `);

  await sendMailWithAttachment({ to: report.email, subject, html: body });
}

// ── Send admin summary email with Excel attachment ────────────────────────────

export async function sendAdminMonthlyReport(
  reports: MonthlyReportData[],
  month: number,
  year: number,
  adminEmails: string[],
  orgName: string,
  excelBuffer: Buffer,
): Promise<void> {
  if (adminEmails.length === 0) return;

  const monthLabel   = `${MONTH_NAMES[month - 1]} ${year}`;
  const subject      = `Monthly Attendance Report — ${monthLabel}`;
  const totalEmp     = reports.length;
  const allPresent   = reports.filter((r) => r.absentDays === 0 && r.leaveDays === 0).length;
  const withLeaves   = reports.filter((r) => r.leaveDays  > 0).length;
  const withAbsences = reports.filter((r) => r.absentDays > 0).length;
  const avgPct       = reports.length
    ? (reports.reduce((s, r) => s + r.attendancePct, 0) / reports.length).toFixed(1)
    : '100';

  // Build employee table (show only first 50 in email — full data in Excel)
  const tableRows = reports.slice(0, 50).map((r, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};">
      <td style="${TD}">${i + 1}</td>
      <td style="${TD};font-weight:500;">${r.fullName}</td>
      <td style="${TD};color:#64748b;">${r.employeeIdStr}</td>
      <td style="${TD};color:#64748b;">${r.department ?? '—'}</td>
      <td style="${TD};text-align:center;">${r.totalWorkingDays}</td>
      <td style="${TD};text-align:center;color:#15803d;font-weight:600;">${r.presentDays}</td>
      <td style="${TD};text-align:center;color:#b45309;">${r.leaveDays}</td>
      <td style="${TD};text-align:center;color:#dc2626;">${r.absentDays}</td>
      <td style="${TD};text-align:center;color:#2563eb;">${r.wfhDays}</td>
      <td style="${TD};text-align:center;font-weight:600;color:${r.attendancePct >= 90 ? '#15803d' : r.attendancePct >= 75 ? '#b45309' : '#dc2626'};">${r.attendancePct}%</td>
    </tr>`).join('');

  const TH = 'padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#fff;background:#1e3a5f;';
  const TD = 'padding:8px 12px;font-size:12px;border-bottom:1px solid #f1f5f9;';

  const body = emailWrapper(orgName, `
    <h2 style="color:#1e293b;margin:0 0 4px;">Monthly Attendance Report</h2>
    <p style="color:#64748b;margin:0 0 24px;font-size:14px;">${monthLabel} — Full report attached as Excel file</p>

    <table cellspacing="8" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:24px;">
      <tr>
        ${statBox('Total Employees', totalEmp, '#1e293b')}
        ${statBox('All Present', allPresent, '#15803d')}
        ${statBox('With Leaves', withLeaves, '#b45309')}
        ${statBox('With Absences', withAbsences, '#dc2626')}
        ${statBox('Avg Attendance', `${avgPct}%`, '#2563eb')}
      </tr>
    </table>

    <p style="font-size:13px;color:#475569;margin:0 0 8px;font-weight:600;">Employee Summary${reports.length > 50 ? ` (top 50 of ${reports.length} — see Excel for full list)` : ''}</p>

    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr>
        <th style="${TH}">#</th>
        <th style="${TH}">Name</th>
        <th style="${TH}">ID</th>
        <th style="${TH}">Dept</th>
        <th style="${TH};text-align:center;">Working</th>
        <th style="${TH};text-align:center;">Present</th>
        <th style="${TH};text-align:center;">Leave</th>
        <th style="${TH};text-align:center;">Absent</th>
        <th style="${TH};text-align:center;">WFH</th>
        <th style="${TH};text-align:center;">Att.%</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    </div>

    <p style="font-size:12px;color:#94a3b8;margin-top:16px;">
      The complete report with all employees is attached as an Excel file.
    </p>
  `);

  await sendMailWithAttachment({
    to: adminEmails,
    subject,
    html: body,
    attachments: [{
      filename:    `Attendance_Report_${MONTH_NAMES[month - 1]}_${year}.xlsx`,
      content:     excelBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }],
  });

  logger.info(`[report-email] Admin report sent to ${adminEmails.length} admin(s) for ${monthLabel}.`);
}
