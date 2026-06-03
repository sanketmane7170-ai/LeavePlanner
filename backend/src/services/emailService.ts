import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma';
import { EMAIL_TEMPLATE_DEFAULTS, STATUS_BADGE_HTML } from '../data/emailTemplateDefaults';

// ── Transport ─────────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const FROM = process.env.EMAIL_FROM || 'Innovizia <noreply@innovizia.com>';
const APP_URL = (process.env.FRONTEND_URL || 'http://localhost:3005').replace(/\/$/, '');

// ── OrgName cache (1 min TTL) ─────────────────────────────────────────────────

let _orgNameCache: { value: string; at: number } | null = null;

async function getOrgName(): Promise<string> {
  if (_orgNameCache && Date.now() - _orgNameCache.at < 60_000) return _orgNameCache.value;
  try {
    const s = await prisma.orgSettings.findUnique({ where: { id: 'global' } });
    const name = s?.orgName ?? 'Innovizia';
    _orgNameCache = { value: name, at: Date.now() };
    return name;
  } catch {
    return 'Innovizia';
  }
}

// ── Template cache (5 min TTL) ────────────────────────────────────────────────

interface CachedTemplate { subject: string; bodyHtml: string; at: number }
const _templateCache = new Map<string, CachedTemplate>();
const CACHE_TTL = 5 * 60 * 1000;

export function clearTemplateCache(key?: string): void {
  if (key) _templateCache.delete(key);
  else _templateCache.clear();
}

async function getTemplate(key: string): Promise<{ subject: string; bodyHtml: string }> {
  const cached = _templateCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached;

  try {
    const t = await prisma.emailTemplate.findUnique({
      where: { key },
      select: { subject: true, bodyHtml: true, isActive: true },
    });
    if (t?.isActive) {
      const entry = { subject: t.subject, bodyHtml: t.bodyHtml, at: Date.now() };
      _templateCache.set(key, entry);
      return entry;
    }
  } catch (e) {
    console.warn('[emailService] DB template fetch failed, using default:', (e as Error).message);
  }

  const def = EMAIL_TEMPLATE_DEFAULTS.find((d) => d.key === key);
  if (!def) throw new Error(`[emailService] No template found for key: ${key}`);
  return { subject: def.subject, bodyHtml: def.bodyHtml };
}

// ── Core helpers ──────────────────────────────────────────────────────────────

function interpolate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

// Templates are fully self-contained (include their own header/footer via WRAP).
// We only add the outer DOCTYPE shell here.
function buildHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;">${body}</body>
</html>`;
}

async function send(to: string | string[], templateKey: string, vars: Record<string, string>): Promise<void> {
  const orgName = await getOrgName();
  const { subject: subjectTpl, bodyHtml: bodyTpl } = await getTemplate(templateKey);

  const allVars = { orgName, ...vars };
  const subject = interpolate(subjectTpl, allVars);
  const body    = interpolate(bodyTpl,    allVars);
  const html    = buildHtml(body);
  const toAddr  = Array.isArray(to) ? to.join(', ') : to;

  try {
    await transporter.sendMail({ from: FROM, to: toAddr, subject, html });
    await prisma.auditLog.create({
      data: {
        adminId: 'SYSTEM',
        action: 'EMAIL_SEND_SUCCESS',
        targetType: 'EMAIL',
        targetId: typeof toAddr === 'string' ? toAddr.slice(0, 100) : 'Multiple Recipients',
        meta: JSON.stringify({ templateKey, subject }),
      },
    }).catch(e => console.error('Failed to log email success to auditLog:', e));
  } catch (err: any) {
    await prisma.auditLog.create({
      data: {
        adminId: 'SYSTEM',
        action: 'EMAIL_SEND_FAILED',
        targetType: 'EMAIL',
        targetId: typeof toAddr === 'string' ? toAddr.slice(0, 100) : 'Multiple Recipients',
        meta: JSON.stringify({ templateKey, subject, error: err?.message || String(err) }),
      },
    }).catch(e => console.error('Failed to log email failure to auditLog:', e));
    throw err;
  }
}

// ── Shared value helpers ──────────────────────────────────────────────────────

const LEAVE_TYPE_LABELS: Record<string, string> = {
  GENERAL:            'Annual Leave',
  SICK:               'Sick Leave',
  TRANSPORT_WEATHER:  'Transport / Weather Leave',
  PERSONAL:           'Personal Leave',
};

const HALF_DAY_SLOT_LABELS: Record<string, string> = {
  FIRST_HALF:  'First Half (Morning)',
  SECOND_HALF: 'Second Half (Afternoon)',
};

function formatDuration(isHalfDay: boolean, halfDaySlot: string | null | undefined, totalDays: number): string {
  if (isHalfDay) {
    const slot = halfDaySlot ? ` — ${HALF_DAY_SLOT_LABELS[halfDaySlot] ?? halfDaySlot}` : '';
    return `Half Day${slot}`;
  }
  return `${totalDays} working day(s)`;
}

function statusBadgeHtml(status: string): string {
  return STATUS_BADGE_HTML[status as keyof typeof STATUS_BADGE_HTML]
    ?? `<span style="background:#f3f4f6;color:#374151;padding:4px 14px;border-radius:999px;font-size:12px;font-weight:700;display:inline-block;">${status}</span>`;
}

function adminCommentBox(comment?: string): string {
  if (!comment) return '';
  return `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-left:3px solid #F59E0B;border-radius:6px;padding:14px 16px;margin:0 0 24px 0;"><p style="margin:0;color:#92400E;font-size:13px;line-height:1.6;"><strong>Admin Comment:</strong> ${comment}</p></div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

// Admin-directed emails

export async function sendLeaveAppliedAdminEmail(
  adminEmails: string[],
  employee: { fullName: string; employeeId: string; department?: string | null },
  details: { leaveType: string; fromDate: string; toDate: string; isHalfDay: boolean; halfDaySlot?: string | null; totalDays: number; reason: string }
): Promise<void> {
  if (!adminEmails.length) return;
  await send(adminEmails, 'LEAVE_APPLIED_ADMIN', {
    employeeName: employee.fullName,
    employeeId:   employee.employeeId,
    department:   employee.department || '—',
    leaveType:    LEAVE_TYPE_LABELS[details.leaveType] ?? details.leaveType,
    fromDate:     details.fromDate,
    toDate:       details.toDate,
    duration:     formatDuration(details.isHalfDay, details.halfDaySlot, details.totalDays),
    reason:       details.reason,
    statusBadge:  statusBadgeHtml('PENDING'),
    reviewUrl:    `${APP_URL}/admin/leave-requests`,
  });
}

export async function sendWfhAppliedAdminEmail(
  adminEmails: string[],
  employee: { fullName: string; employeeId: string; department?: string | null },
  details: { fromDate: string; toDate: string; isHalfDay: boolean; halfDaySlot?: string | null; totalDays: number; reason: string }
): Promise<void> {
  if (!adminEmails.length) return;
  await send(adminEmails, 'WFH_APPLIED_ADMIN', {
    employeeName: employee.fullName,
    employeeId:   employee.employeeId,
    department:   employee.department || '—',
    fromDate:     details.fromDate,
    toDate:       details.toDate,
    duration:     formatDuration(details.isHalfDay, details.halfDaySlot, details.totalDays),
    reason:       details.reason,
    statusBadge:  statusBadgeHtml('PENDING'),
    reviewUrl:    `${APP_URL}/admin/leave-requests`,
  });
}

export async function sendLeaveCancelledAdminEmail(
  adminEmails: string[],
  employee: { fullName: string; employeeId: string },
  details: { leaveType: string; fromDate: string; toDate: string; totalDays: number }
): Promise<void> {
  if (!adminEmails.length) return;
  await send(adminEmails, 'LEAVE_CANCELLED_ADMIN', {
    employeeName: employee.fullName,
    employeeId:   employee.employeeId,
    leaveType:    LEAVE_TYPE_LABELS[details.leaveType] ?? details.leaveType,
    fromDate:     details.fromDate,
    toDate:       details.toDate,
    totalDays:    String(details.totalDays),
    statusBadge:  statusBadgeHtml('CANCELLED'),
  });
}

// Employee-directed emails

export async function sendWelcomeEmail(to: string, fullName: string, employeeId: string, tempPassword: string): Promise<void> {
  await send(to, 'EMPLOYEE_WELCOME', {
    employeeName: fullName,
    employeeId,
    loginEmail:   to,
    tempPassword,
    loginUrl:     `${APP_URL}/login`,
  });
}

export async function sendPasswordResetEmail(to: string, fullName: string, tempPassword: string): Promise<void> {
  await send(to, 'PASSWORD_RESET', {
    employeeName: fullName,
    tempPassword,
    loginUrl:     `${APP_URL}/login`,
  });
}

export async function sendLeaveSubmittedEmail(
  to: string,
  fullName: string,
  details: { leaveType: string; fromDate: string; toDate: string; isHalfDay: boolean; halfDaySlot?: string | null; totalDays: number; reason: string; requiresApproval: boolean }
): Promise<void> {
  const pending = details.requiresApproval;
  await send(to, 'LEAVE_SUBMITTED_EMPLOYEE', {
    employeeName:         fullName,
    submissionStatusLabel: pending ? 'Submitted' : 'Auto-Approved',
    submissionMessage:    pending
      ? 'Your leave request has been submitted successfully and is pending admin review.'
      : 'Your leave request has been automatically approved as per your policy.',
    leaveType: LEAVE_TYPE_LABELS[details.leaveType] ?? details.leaveType,
    fromDate:  details.fromDate,
    toDate:    details.toDate,
    duration:  formatDuration(details.isHalfDay, details.halfDaySlot, details.totalDays),
    reason:    details.reason,
    statusBadge: statusBadgeHtml(pending ? 'PENDING' : 'APPROVED'),
    myLeavesUrl: `${APP_URL}/employee/my-leaves`,
  });
}

export async function sendWfhSubmittedEmail(
  to: string,
  fullName: string,
  details: { fromDate: string; toDate: string; isHalfDay: boolean; halfDaySlot?: string | null; totalDays: number; reason: string; requiresApproval: boolean }
): Promise<void> {
  const pending = details.requiresApproval;
  await send(to, 'WFH_SUBMITTED_EMPLOYEE', {
    employeeName:         fullName,
    submissionStatusLabel: pending ? 'Submitted' : 'Auto-Approved',
    submissionMessage:    pending
      ? 'Your WFH request has been submitted and is pending admin review.'
      : 'Your WFH request has been automatically approved as per your policy.',
    fromDate:  details.fromDate,
    toDate:    details.toDate,
    duration:  formatDuration(details.isHalfDay, details.halfDaySlot, details.totalDays),
    reason:    details.reason,
    statusBadge: statusBadgeHtml(pending ? 'PENDING' : 'APPROVED'),
    myLeavesUrl: `${APP_URL}/employee/my-leaves`,
  });
}

export async function sendLeaveStatusEmail(
  to: string,
  fullName: string,
  details: { leaveType: string; fromDate: string; toDate: string; isHalfDay: boolean; halfDaySlot?: string | null; totalDays: number },
  status: 'APPROVED' | 'REJECTED' | 'ABSENT',
  adminComment?: string
): Promise<void> {
  const statusMessages: Record<string, string> = {
    APPROVED: 'Great news! Your leave request has been approved.',
    REJECTED: 'Your leave request has been reviewed and unfortunately rejected.',
    ABSENT:   'You have been marked absent for the following period as your leave was not approved.',
  };
  const statusLabels: Record<string, string> = {
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    ABSENT:   'Marked Absent',
  };
  await send(to, 'LEAVE_STATUS_UPDATE', {
    employeeName:   fullName,
    statusLabel:    statusLabels[status] ?? status,
    statusMessage:  statusMessages[status] ?? '',
    leaveType:      LEAVE_TYPE_LABELS[details.leaveType] ?? details.leaveType,
    fromDate:       details.fromDate,
    toDate:         details.toDate,
    duration:       formatDuration(details.isHalfDay, details.halfDaySlot, details.totalDays),
    adminCommentBox: adminCommentBox(adminComment),
    statusBadge:    statusBadgeHtml(status),
    myLeavesUrl:    `${APP_URL}/employee/my-leaves`,
  });
}

export async function sendWfhStatusEmail(
  to: string,
  fullName: string,
  details: { fromDate: string; toDate: string; isHalfDay: boolean; halfDaySlot?: string | null; totalDays: number },
  status: 'APPROVED' | 'REJECTED',
  adminComment?: string
): Promise<void> {
  const statusMessages: Record<string, string> = {
    APPROVED: 'Your Work From Home request has been approved.',
    REJECTED: 'Your Work From Home request has been reviewed and unfortunately rejected.',
  };
  const statusLabels: Record<string, string> = {
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
  };
  await send(to, 'WFH_STATUS_UPDATE', {
    employeeName:   fullName,
    statusLabel:    statusLabels[status] ?? status,
    statusMessage:  statusMessages[status] ?? '',
    fromDate:       details.fromDate,
    toDate:         details.toDate,
    duration:       formatDuration(details.isHalfDay, details.halfDaySlot, details.totalDays),
    adminCommentBox: adminCommentBox(adminComment),
    statusBadge:    statusBadgeHtml(status),
    myLeavesUrl:    `${APP_URL}/employee/my-leaves`,
  });
}

// ── Raw send with attachment support (used by report emails) ─────────────────

export async function sendMailWithAttachment(opts: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}): Promise<void> {
  const toAddr = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to;
  await transporter.sendMail({
    from:        FROM,
    to:          toAddr,
    subject:     opts.subject,
    html:        buildHtml(opts.html),
    attachments: opts.attachments,
  });
}

export async function sendAdminImportedLeaveEmail(
  to: string,
  fullName: string,
  details: { leaveType: string; fromDate: string; toDate: string; isHalfDay: boolean; halfDaySlot?: string | null; totalDays: number; reason: string }
): Promise<void> {
  await send(to, 'ADMIN_IMPORTED_LEAVE', {
    employeeName: fullName,
    leaveType:    LEAVE_TYPE_LABELS[details.leaveType] ?? details.leaveType,
    fromDate:     details.fromDate,
    toDate:       details.toDate,
    duration:     formatDuration(details.isHalfDay, details.halfDaySlot, details.totalDays),
    reason:       details.reason,
    statusBadge:  statusBadgeHtml('APPROVED'),
    myLeavesUrl:  `${APP_URL}/employee/my-leaves`,
  });
}

export async function sendNoticePeriodEmployeeEmail(
  to: string,
  employee: { fullName: string; employeeId: string },
  notice: { noticeType: string; startDate: string; endDate: string; earlyReleaseDate?: string | null }
): Promise<void> {
  const typeLabels: Record<string, string> = { RESIGNED: 'Resigned', TERMINATED: 'Terminated', MUTUAL: 'Mutual Separation' };
  await send(to, 'NOTICE_PERIOD_STARTED', {
    employeeName:     employee.fullName,
    employeeId:       employee.employeeId,
    noticeType:       typeLabels[notice.noticeType] ?? notice.noticeType,
    startDate:        notice.startDate,
    endDate:          notice.endDate,
    earlyReleaseDate: notice.earlyReleaseDate ?? 'Not applicable',
  });
}

export async function sendNoticePeriodManagerEmail(
  to: string,
  managerName: string,
  employee: { fullName: string; employeeId: string; department?: string | null },
  notice: { noticeType: string; startDate: string; endDate: string }
): Promise<void> {
  const typeLabels: Record<string, string> = { RESIGNED: 'Resigned', TERMINATED: 'Terminated', MUTUAL: 'Mutual Separation' };
  await send(to, 'NOTICE_PERIOD_MANAGER', {
    managerName,
    employeeName: employee.fullName,
    employeeId:   employee.employeeId,
    department:   employee.department ?? '—',
    noticeType:   typeLabels[notice.noticeType] ?? notice.noticeType,
    startDate:    notice.startDate,
    endDate:      notice.endDate,
  });
}

// ── Cron email helpers ────────────────────────────────────────────────────────

export async function sendProbationEndingAdminEmail(
  adminEmails: string[],
  employees: { fullName: string; employeeId: string; department?: string | null; probationEnds: string }[]
): Promise<void> {
  if (!adminEmails.length || !employees.length) return;

  // Build HTML table rows
  const rows = employees.map((e) =>
    `<tr>
      <td style="padding:10px 16px;font-size:13px;color:#0F172A;font-weight:600;border-bottom:1px solid #F8FAFC;">${e.fullName}</td>
      <td style="padding:10px 16px;font-size:13px;color:#374151;border-bottom:1px solid #F8FAFC;">${e.employeeId}</td>
      <td style="padding:10px 16px;font-size:13px;color:#374151;border-bottom:1px solid #F8FAFC;">${e.department ?? '—'}</td>
      <td style="padding:10px 16px;font-size:13px;color:#F59E0B;font-weight:600;border-bottom:1px solid #F8FAFC;">${e.probationEnds}</td>
    </tr>`
  ).join('');

  const employeeRows = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="width:100%;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;margin:0 0 24px 0;border-spacing:0;">
      <tr style="background:#E2E8F0;">
        <th style="padding:8px 16px;font-size:11px;text-align:left;color:#64748B;text-transform:uppercase;letter-spacing:.8px;">Name</th>
        <th style="padding:8px 16px;font-size:11px;text-align:left;color:#64748B;text-transform:uppercase;letter-spacing:.8px;">ID</th>
        <th style="padding:8px 16px;font-size:11px;text-align:left;color:#64748B;text-transform:uppercase;letter-spacing:.8px;">Department</th>
        <th style="padding:8px 16px;font-size:11px;text-align:left;color:#64748B;text-transform:uppercase;letter-spacing:.8px;">Probation Ends</th>
      </tr>
      ${rows}
    </table>`;

  await send(adminEmails, 'PROBATION_ENDING_ADMIN', {
    count:        String(employees.length),
    plural:       employees.length > 1 ? 's' : '',
    employeeRows,
    reviewUrl:    `${APP_URL}/admin/employees`,
  });
}

export async function sendLeaveExpiryWarningEmail(
  to: string,
  fullName: string,
  details: { policyName: string; totalDays: number; usedDays: number; remainingDays: number; year: number }
): Promise<void> {
  await send(to, 'LEAVE_EXPIRY_WARNING', {
    employeeName:  fullName,
    policyName:    details.policyName,
    totalDays:     String(details.totalDays),
    usedDays:      String(details.usedDays),
    remainingDays: String(details.remainingDays),
    plural:        details.remainingDays !== 1 ? 's' : '',
    year:          String(details.year),
    applyUrl:      `${APP_URL}/employee/apply-leave`,
  });
}

export async function sendWfhBalanceReminderEmail(
  to: string,
  fullName: string,
  details: { policyName: string; totalDays: number; usedDays: number; remainingDays: number; year: number }
): Promise<void> {
  await send(to, 'WFH_BALANCE_REMINDER', {
    employeeName:  fullName,
    policyName:    details.policyName,
    totalDays:     String(details.totalDays),
    usedDays:      String(details.usedDays),
    remainingDays: String(details.remainingDays),
    plural:        details.remainingDays !== 1 ? 's' : '',
    year:          String(details.year),
    applyUrl:      `${APP_URL}/employee/apply-wfh`,
  });
}

export async function sendYearStartRolloverEmail(
  adminEmails: string[],
  details: { year: number; count: number; carryCount: number; completedAt: string }
): Promise<void> {
  if (!adminEmails.length) return;
  await send(adminEmails, 'YEAR_START_BALANCE_ROLLOVER', {
    year:        String(details.year),
    prevYear:    String(details.year - 1),
    count:       String(details.count),
    carryCount:  String(details.carryCount),
    completedAt: details.completedAt,
    reviewUrl:   `${APP_URL}/admin/employees`,
  });
}
