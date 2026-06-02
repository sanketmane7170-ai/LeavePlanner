import type { Response } from 'express';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/authenticate';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/emailService';
import { createNotification } from '../services/notificationService';
import { logger } from '../lib/logger';

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$';
  // Use cryptographically secure random bytes — Math.random() is not safe for credentials
  const bytes = randomBytes(length);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join('');
}

async function generateEmployeeId(): Promise<string> {
  const last = await prisma.employee.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { employeeId: true },
  });

  if (!last || !last.employeeId.startsWith('INV-')) {
    return 'INV-0001';
  }

  const num = parseInt(last.employeeId.replace('INV-', ''), 10);
  return `INV-${String(num + 1).padStart(4, '0')}`;
}

export const getEmployees = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const search = req.query.search as string | undefined;
    const department = req.query.department as string | undefined;
    const isActiveRaw = req.query.isActive as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));

    const where: Record<string, any> = {};

    if (search) {
      where['OR'] = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { designation: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (department) where['department'] = department;
    if (isActiveRaw !== undefined && isActiveRaw !== '') {
      where['isActive'] = isActiveRaw === 'true';
    }

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: {
          user: { select: { email: true, role: true, isFirstLogin: true } },
          leavePolicy: { select: { id: true, name: true, leaveType: true } },
          wfhPolicy: { select: { id: true, name: true } },
          reportingManager: { select: { id: true, fullName: true, employeeId: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.employee.count({ where }),
    ]);

    return res.json({
      data: employees,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error('getEmployees error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const getEmployee = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, role: true, isFirstLogin: true } },
        leavePolicy: true,
        wfhPolicy: true,
        workingSchedule: true,
        reportingManager: { select: { id: true, fullName: true, employeeId: true } },
        leaveBalances: { where: { isArchived: false }, orderBy: [{ year: 'desc' as const }, { leaveType: 'asc' as const }], take: 10 },
      },
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    return res.json(employee);
  } catch (error) {
    logger.error('getEmployee error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const createEmployee = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const {
      fullName,
      email,
      personalEmail,
      mobile,
      department,
      designation,
      dateOfJoining,
      birthday,
      probationMonths = 6,
      reportingManagerId,
      canViewTeamCalendar = false,
    } = req.body as {
      fullName: string;
      email: string;
      personalEmail?: string;
      mobile?: string;
      department?: string;
      designation?: string;
      dateOfJoining?: string;
      birthday?: string;
      probationMonths?: number;
      reportingManagerId?: string;
      canViewTeamCalendar?: boolean;
    };

    if (!fullName || !email) {
      return res.status(400).json({ message: 'Full name and email are required' });
    }

    // Store emails lowercase so login is case-insensitive
    const normalizedEmail = String(email).trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const tempPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    const employeeId = await generateEmployeeId();

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        role: 'EMPLOYEE',
        isFirstLogin: true,
        employee: {
          create: {
            employeeId,
            fullName,
            personalEmail: personalEmail || undefined,
            mobile: mobile || undefined,
            department: department || undefined,
            designation: designation || undefined,
            dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : undefined,
            birthday: birthday ? new Date(birthday) : undefined,
            probationMonths: Number(probationMonths),
            reportingManagerId: reportingManagerId || undefined,
            canViewTeamCalendar: Boolean(canViewTeamCalendar),
          },
        },
      },
      include: { employee: true },
    });

    try {
      await sendWelcomeEmail(normalizedEmail, fullName, employeeId, tempPassword);
    } catch (emailErr) {
      logger.error('Welcome email failed:', emailErr);
    }

    return res.status(201).json({
      message: 'Employee created successfully',
      employee: user.employee,
    });
  } catch (error) {
    logger.error('createEmployee error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateEmployee = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    const {
      fullName,
      personalEmail,
      mobile,
      department,
      designation,
      dateOfJoining,
      birthday,
      probationMonths,
      reportingManagerId,
      isActive,
      leavePolicyId,
      wfhPolicyId,
      canViewTeamCalendar,
    } = req.body as Record<string, any>;

    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const previousLeavePolicyId = employee.leavePolicyId;
    const previousWfhPolicyId = employee.wfhPolicyId;
    const isBeingDeactivated = isActive !== undefined && Boolean(isActive) === false && employee.isActive === true;

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        ...(fullName !== undefined && { fullName: String(fullName) }),
        ...(personalEmail !== undefined && { personalEmail: personalEmail || null }),
        ...(mobile !== undefined && { mobile: mobile || null }),
        ...(department !== undefined && { department: department || null }),
        ...(designation !== undefined && { designation: designation || null }),
        ...(dateOfJoining !== undefined && {
          dateOfJoining: dateOfJoining ? new Date(String(dateOfJoining)) : null,
        }),
        ...(birthday !== undefined && {
          birthday: birthday ? new Date(String(birthday)) : null,
        }),
        ...(probationMonths !== undefined && { probationMonths: Number(probationMonths) }),
        ...(reportingManagerId !== undefined && {
          reportingManagerId: reportingManagerId || null,
        }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        ...(leavePolicyId !== undefined && { leavePolicyId: leavePolicyId || null }),
        ...(wfhPolicyId !== undefined && { wfhPolicyId: wfhPolicyId || null }),
        ...(canViewTeamCalendar !== undefined && { canViewTeamCalendar: Boolean(canViewTeamCalendar) }),
      },
      include: {
        user: { select: { email: true, role: true } },
        leavePolicy: true,
        wfhPolicy: true,
      },
    });

    const newLeavePolicyId = updated.leavePolicyId;
    const newWfhPolicyId = updated.wfhPolicyId;

    // Deactivation → invalidate all live sessions immediately (bump tokenVersion)
    if (isBeingDeactivated) {
      await prisma.user.update({
        where: { id: employee.userId },
        data: { tokenVersion: { increment: 1 } },
      });
    }

    // Policy removed → archive all current-year active balances for this employee
    if (leavePolicyId !== undefined && !newLeavePolicyId && previousLeavePolicyId) {
      const currentYear = new Date().getFullYear();
      await prisma.leaveBalance.updateMany({
        where: { employeeId: id, year: currentYear, isArchived: false },
        data: { isArchived: true, archivedAt: new Date() },
      });
    }

    // Policy assigned or changed → archive stale balance, then notify employee
    if (leavePolicyId !== undefined && newLeavePolicyId && newLeavePolicyId !== previousLeavePolicyId) {
      // Archive any active balance from the previous policy
      if (previousLeavePolicyId) {
        const currentYear = new Date().getFullYear();
        await prisma.leaveBalance.updateMany({
          where: { employeeId: id, year: currentYear, isArchived: false },
          data: { isArchived: true, archivedAt: new Date() },
        });
      }

      const policy = updated.leavePolicy as { name: string; daysAllowed: number } | null;
      if (policy) {
        await createNotification(
          updated.userId,
          'POLICY_ASSIGNED',
          `Your leave policy has been updated. You are now enrolled under "${policy.name}", entitling you to ${policy.daysAllowed} day${policy.daysAllowed !== 1 ? 's' : ''} of leave per year. Please reach out to HR if you have any questions.`,
          '/employee/my-leaves'
        );
      }
    }

    // WFH Policy assigned or changed → notify employee
    if (wfhPolicyId !== undefined && newWfhPolicyId && newWfhPolicyId !== previousWfhPolicyId) {
      const policy = updated.wfhPolicy as { name: string; daysAllowed: number } | null;
      if (policy) {
        await createNotification(
          updated.userId,
          'WFH_POLICY_ASSIGNED',
          `Your WFH policy has been updated. You are now enrolled under "${policy.name}", entitling you to ${policy.daysAllowed} WFH day${policy.daysAllowed !== 1 ? 's' : ''} per year. Please reach out to HR if you have any questions.`,
          '/employee/my-leaves'
        );
      }
    }

    return res.json({ message: 'Employee updated successfully', employee: updated });
  } catch (error) {
    logger.error('updateEmployee error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const resetPassword = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const tempPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await prisma.user.update({
      where: { id: employee.userId },
      data: { password: hashedPassword, isFirstLogin: true },
    });

    const userEmail = (employee as any).user?.email as string | undefined;

    if (userEmail) {
      try {
        await sendPasswordResetEmail(userEmail, employee.fullName, tempPassword);
      } catch (emailErr) {
        logger.error('Password reset email failed:', emailErr);
      }
    }

    return res.json({ message: 'Password reset successfully. Email sent to employee.' });
  } catch (error) {
    logger.error('resetPassword error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const getDepartments = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const departments = await prisma.employee.findMany({
      where: { department: { not: null } },
      select: { department: true },
      distinct: ['department'],
      orderBy: { department: 'asc' },
    });

    return res.json(departments.map((e) => e.department).filter(Boolean));
  } catch (error) {
    logger.error('getDepartments error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/employees/:id/policies ──────────────────────────────────────────
export const getEmployeePoliciesAdmin = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const employeeId = String(req.params['id']);

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        leavePolicy: {
          include: { rules: { orderBy: { minDays: 'asc' } } },
        },
        wfhPolicy: true,
        leaveBalances: {
          where: { year: new Date().getFullYear() },
        },
      },
    });

    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // WFH this year usage
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const yearEnd   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    const wfhUsed = await prisma.wfhApplication.aggregate({
      _sum: { totalDays: true },
      where: {
        employeeId: employee.id,
        status: 'APPROVED',
        date: { gte: yearStart, lte: yearEnd },
      },
    });

    return res.json({
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        employeeId: employee.employeeId,
        probationMonths: employee.probationMonths,
        dateOfJoining: employee.dateOfJoining,
      },
      leavePolicy: employee.leavePolicy,
      wfhPolicy: employee.wfhPolicy,
      leaveBalances: employee.leaveBalances,
      wfhUsedThisMonth: wfhUsed._sum.totalDays ?? 0,
    });
  } catch (error) {
    logger.error('getEmployeePoliciesAdmin error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/employees/:id/policy-explain ───────────────────────────────────
export const explainEmployeePolicyAdmin = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const employeeId = String(req.params['id']);

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        leavePolicy: { include: { rules: { orderBy: { minDays: 'asc' } } } },
        wfhPolicy: true,
        leaveBalances: { where: { year: new Date().getFullYear() } },
      },
    });

    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const yearEnd   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    const wfhUsed = await prisma.wfhApplication.aggregate({
      _sum: { totalDays: true },
      where: { employeeId: employee.id, status: 'APPROVED', date: { gte: yearStart, lte: yearEnd } },
    });

    const lp = employee.leavePolicy;
    const wp = employee.wfhPolicy;
    const balances = employee.leaveBalances;

    const policyContext = `
Employee: ${employee.fullName} (${employee.employeeId})
Date of Joining: ${employee.dateOfJoining ? new Date(employee.dateOfJoining).toDateString() : 'Not set'}
Probation Period: ${employee.probationMonths} months

LEAVE POLICY: ${lp?.name ?? 'No leave policy assigned'}
${lp ? `
- Leave Type: ${lp.leaveType}
- Total Days Allowed Per Year: ${lp.daysAllowed}
- Approval Required: ${lp.approvalRequired ? 'Yes' : 'No'}
- Notice Required: ${lp.noticeRequired ? `Yes (${lp.minNoticeDays} days)` : 'No'}
- Half Day Allowed: ${lp.halfDayAllowed ? 'Yes' : 'No'}
- Carry Forward: ${lp.carryForward ? 'Yes' : 'No'}
- Probation Rule: ${lp.probationRule}
${lp.rules.length > 0 ? `- Special Rules:\n${lp.rules.map(r => `  * If leave >= ${r.minDays} days: approval=${r.approvalRequired}, notice=${r.noticeRequired ? `${r.minNoticeDays} days` : 'none'}${r.exception ? ` (Exception: ${r.exception})` : ''}`).join('\n')}` : ''}
` : ''}

CURRENT YEAR LEAVE BALANCES:
${balances.length > 0 ? balances.map(b => `- ${b.leaveType}: ${b.usedDays} used / ${b.totalDays} allocated (${b.remainingDays} remaining)`).join('\n') : 'No leave balances recorded yet.'}

WFH POLICY: ${wp?.name ?? 'No WFH policy assigned'}
${wp ? `
- WFH Days Allowed: ${wp.daysAllowed}
- Approval Required: ${wp.approvalRequired ? 'Yes' : 'No'}
- Notice Required: ${wp.noticeRequired ? `Yes (${wp.minNoticeDays} days)` : 'No'}
- Half Day WFH Allowed: ${wp.halfDayAllowed ? 'Yes' : 'No'}
- WFH Days Used: ${wfhUsed._sum.totalDays ?? 0} / ${wp.daysAllowed}
- WFH Days Remaining: ${Math.max(0, wp.daysAllowed - (wfhUsed._sum.totalDays ?? 0))}
` : ''}
    `.trim();

    const { question } = req.body as { question?: string };

    const systemPrompt = `You are an HR AI assistant for Innovizia. Your job is to explain company leave and WFH policies to employees or admins in a clear, friendly, and helpful way. Use simple language. When explaining policy details, use numbered bullet points — one point per line. Be concise but thorough. Address the employee by their name. Always be encouraging and supportive.`;

    const userMessage = question
      ? `Here is the policy information for ${employee.fullName}:\n\n${policyContext}\n\nQuestion: ${question}`
      : `Here is the policy information for ${employee.fullName}:\n\n${policyContext}\n\nPlease explain all the leave and WFH policies in a clear, friendly way. Give key insights about what they are entitled to, what they have used so far, and any important rules they should know about. Format as numbered bullet points.`;

    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    const explanation = completion.choices[0]?.message?.content ?? 'Unable to generate explanation.';

    return res.json({ explanation, policyContext });
  } catch (error: any) {
    logger.error('explainEmployeePolicyAdmin error:', error);
    return res.status(500).json({ message: error?.message ?? 'Internal server error' });
  }
};

// ── GET /api/admin/employees/:id/balance ──────────────────────────────────────
export const getEmployeeBalanceSummary = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id   = String(req.params['id']);
    const year = parseInt((req.query.year as string) || '') || new Date().getFullYear();

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        wfhPolicy:           { select: { daysAllowed: true, name: true } },
        wfhPolicyExceptions: { select: { policyId: true, overrideDays: true } },
      },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // ── Leave balance ─────────────────────────────────────────────────────────
    const leaveBalance = await prisma.leaveBalance.findFirst({
      where: { employeeId: id, year, isArchived: false },
    });

    // ── WFH balance (yearly) ──────────────────────────────────────────────────
    const yearStart = new Date(year, 0, 1, 0, 0, 0, 0);
    const yearEnd   = new Date(year, 11, 31, 23, 59, 59, 999);
    const wfhApps   = await prisma.wfhApplication.findMany({
      where: {
        employeeId: id,
        status: { in: ['APPROVED', 'PENDING'] },
        date: { gte: yearStart, lte: yearEnd },
      },
      select: { status: true, totalDays: true },
    });

    const wfhUsed    = wfhApps.filter((a) => a.status === 'APPROVED').reduce((s, a) => s + a.totalDays, 0);
    const wfhPending = wfhApps.filter((a) => a.status === 'PENDING').reduce((s, a) => s + a.totalDays, 0);
    const exception  = employee.wfhPolicyExceptions?.find((ex) => ex.policyId === employee.wfhPolicyId);
    const wfhAllowed = exception ? exception.overrideDays : (employee.wfhPolicy?.daysAllowed ?? 0);

    return res.json({
      year,
      leaveBalance: leaveBalance
        ? { totalDays: leaveBalance.totalDays, usedDays: leaveBalance.usedDays, remainingDays: leaveBalance.remainingDays }
        : null,
      wfhBalance: employee.wfhPolicy
        ? { allowedDays: wfhAllowed, usedDays: wfhUsed, pendingDays: wfhPending, remainingDays: Math.max(0, wfhAllowed - wfhUsed - wfhPending) }
        : null,
    });
  } catch (error) {
    logger.error('getEmployeeBalanceSummary error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
