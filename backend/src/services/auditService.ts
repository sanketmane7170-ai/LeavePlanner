import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/authenticate';

// ── Auto-generate human-readable descriptions ─────────────────────────────────
const DESCRIPTIONS: Record<string, (m: Record<string, any>) => string> = {
  // Employee
  EMPLOYEE_CREATED:        (m) => `Created employee ${m.fullName} (${m.employeeId})`,
  EMPLOYEE_UPDATED:        (m) => `Updated ${m.fullName ?? m.employeeId} — ${m.changes?.join(', ') || 'info updated'}`,
  EMPLOYEE_DEACTIVATED:    (m) => `Deactivated employee ${m.fullName} (${m.employeeId})`,
  EMPLOYEE_ACTIVATED:      (m) => `Activated employee ${m.fullName} (${m.employeeId})`,
  EMPLOYEE_PASSWORD_RESET: (m) => `Reset password for ${m.fullName} (${m.employeeId})`,
  ALLOWANCE_UPDATED:       (m) => `Updated allowances for ${m.fullName} — ${[m.leaveAllowance != null ? `Leave: ${m.leaveAllowance}d` : null, m.wfhAllowance != null ? `WFH: ${m.wfhAllowance}d` : null].filter(Boolean).join(', ')}`,

  // Leave (admin)
  APPROVE_LEAVE:      (m) => `Approved ${m.leaveType || ''} leave for ${m.employeeName} (${m.totalDays}d, ${m.fromDate} → ${m.toDate})`,
  REJECT_LEAVE:       (m) => `Rejected leave for ${m.employeeName}`,
  BULK_APPROVE_LEAVE: (m) => `Bulk-approved ${m.count} leave requests`,
  BULK_REJECT_LEAVE:  (m) => `Bulk-rejected ${m.count} leave requests`,
  ABSENT_OVERRIDE:    (m) => `Marked ${m.employeeName} as absent (${m.date})`,
  LEAVE_IMPORTED:     (m) => `Imported leave record for ${m.employeeName}`,
  LEAVE_BULK_IMPORT:  (m) => `Bulk-imported ${m.count} leave records`,

  // WFH
  WFH_APPROVED: (m) => `Approved WFH for ${m.employeeName} (${m.totalDays}d, ${m.date})`,
  WFH_REJECTED: (m) => `Rejected WFH for ${m.employeeName}`,

  // Policies
  LEAVE_POLICY_CREATED: (m) => `Created leave policy "${m.name}" (${m.leaveType}, ${m.daysAllowed}d/yr)`,
  LEAVE_POLICY_UPDATED: (m) => `Updated leave policy "${m.name}"`,
  LEAVE_POLICY_DELETED: (m) => `Deleted leave policy "${m.name}"`,
  WFH_POLICY_CREATED:   (m) => `Created WFH policy "${m.name}" (${m.daysAllowed}d/yr)`,
  WFH_POLICY_UPDATED:   (m) => `Updated WFH policy "${m.name}"`,
  WFH_POLICY_DELETED:   (m) => `Deleted WFH policy "${m.name}"`,
  POLICY_EMPLOYEE_ASSIGNED:   (m) => `Assigned policy "${m.policyName}" to ${m.employeeName}`,
  POLICY_EMPLOYEE_UNASSIGNED: (m) => `Unassigned policy "${m.policyName}" from ${m.employeeName}`,
  POLICY_EXCEPTION_ADDED:     (m) => `Added exception for ${m.employeeName} on policy "${m.policyName}" (${m.overrideDays}d override)`,
  POLICY_EXCEPTION_DELETED:   (m) => `Removed exception for ${m.employeeName}`,
  POLICY_RULE_ADDED:          (m) => `Added rule to policy "${m.policyName}" — if ${m.operator} ${m.minDays}d`,
  POLICY_RULE_UPDATED:        (m) => `Updated rule in policy "${m.policyName}"`,
  POLICY_RULE_DELETED:        (m) => `Deleted rule from policy "${m.policyName}"`,

  // Attendance
  ATTENDANCE_CORRECTION:          (m) => `Corrected attendance for ${m.employeeName} on ${m.date}: ${m.originalStatus} → ${m.correctedStatus}`,
  ATTENDANCE_CORRECTION_REVERTED: (m) => `Reverted attendance correction for ${m.date} (${m.correctedStatus})`,

  // Notice period
  NOTICE_PERIOD_SET:     (m) => `Set notice period for ${m.fullName ?? 'employee'} — ${m.noticeType} (${m.startDate} → ${m.endDate})`,
  NOTICE_PERIOD_CLEARED: () => 'Cleared notice period for employee',

  // Settings
  DEPARTMENT_CREATED: (m) => `Created department "${m.name}"`,
  DEPARTMENT_DELETED: (m) => `Deleted department "${m.name}"`,
  ROLE_CREATED:       (m) => `Created role "${m.name}"`,
  ROLE_DELETED:       (m) => `Deleted role "${m.name}"`,
  HOLIDAY_CREATED:    (m) => `Added public holiday "${m.name}" on ${m.date}`,
  HOLIDAY_DELETED:    (m) => `Removed public holiday "${m.name}"`,
  ORG_SETTINGS_UPDATED: (m) => `Updated org settings — ${m.orgName ? `name: "${m.orgName}"` : ''} ${m.timezone ? `timezone: ${m.timezone}` : ''}`.trim(),

  // Announcements
  ANNOUNCEMENT_CREATED: (m) => `Created announcement "${m.title}"`,
  ANNOUNCEMENT_UPDATED: (m) => `Updated announcement "${m.title}"`,
  ANNOUNCEMENT_DELETED: (m) => `Deleted announcement "${m.title}"`,

  // Schedule
  WORKING_SCHEDULE_UPDATED: (m) => `Updated working schedule for ${m.employeeName ?? 'employee'}`,

  // Admins
  ADMIN_CREATED:         (m) => `Created admin account for ${m.fullName ?? m.email}`,
  ADMIN_STATUS_CHANGED:  (m) => `${m.isActive ? 'Activated' : 'Deactivated'} admin ${m.fullName ?? m.email}`,

  // Email
  EMAIL_SEND_SUCCESS: (m) => `Email sent via template ${m.templateKey}`,
  EMAIL_SEND_FAILED:  (m) => `Email failed via template ${m.templateKey}`,
};

function buildDescription(action: string, meta: Record<string, any>): string {
  const fn = DESCRIPTIONS[action];
  if (fn) {
    try { return fn(meta); } catch { /* fall through */ }
  }
  // Fallback: humanise the action name
  return action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Categorise action ─────────────────────────────────────────────────────────
export function getActionCategory(action: string): string {
  const a = action.toUpperCase();
  if (a.includes('CREAT') || a.includes('ADD') || a.includes('IMPORT') || a.includes('ACTIVATED')) return 'CREATE';
  if (a.includes('UPDAT') || a.includes('EDIT') || a.includes('CORRECT') || a.includes('RESET') || a.includes('ASSIGN') || a.includes('SET')) return 'UPDATE';
  if (a.includes('DELET') || a.includes('REMOV') || a.includes('REVERT') || a.includes('CLEAR') || a.includes('DEACTIVAT') || a.includes('UNASSIGN')) return 'DELETE';
  if (a.includes('APPROV')) return 'APPROVE';
  if (a.includes('REJECT') || a.includes('ABSENT')) return 'REJECT';
  if (a.includes('EMAIL') || a.includes('CRON') || a.includes('SYSTEM') || a.includes('BACKUP')) return 'SYSTEM';
  return 'OTHER';
}

// ── Admin name cache (in-memory, process-lifetime) ────────────────────────────
const nameCache = new Map<string, string>();

async function resolveAdminName(adminId: string): Promise<string> {
  if (adminId === 'SYSTEM' || adminId === 'CRON' || adminId === 'AUTOMATED') return 'System / Automated';
  if (nameCache.has(adminId)) return nameCache.get(adminId)!;
  try {
    const user = await prisma.user.findUnique({
      where: { id: adminId },
      select: { email: true, employee: { select: { fullName: true } } },
    });
    const name = (user?.employee as any)?.fullName ?? user?.email ?? 'Unknown';
    nameCache.set(adminId, name);
    return name;
  } catch {
    return 'Unknown';
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export function audit(
  req: Pick<AuthRequest, 'user'> & { ip?: string },
  action: string,
  targetType: string,
  targetId: string,
  meta: Record<string, any> = {}
): void {
  const adminId = req.user?.userId ?? 'SYSTEM';
  const ip      = req.ip ?? null;

  // Fire-and-forget — never block the main response
  resolveAdminName(adminId).then((adminName) => {
    return prisma.auditLog.create({
      data: {
        adminId,
        adminName,
        action,
        targetType,
        targetId,
        meta: JSON.stringify({ ...meta, description: buildDescription(action, meta) }),
        ipAddress: ip,
      },
    });
  }).catch(() => { /* silent — audit failure must never break main flow */ });
}
