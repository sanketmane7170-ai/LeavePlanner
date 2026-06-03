import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/authenticate';
import { calculateEmployeeMonthReport } from '../services/reportCalculator';
import { getOrInitBalance } from './leaves';
import { calculateProRatedDays } from '../services/leaveCalculator';

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── GET /api/employee/portal/dashboard ───────────────────────────────────────
export const getEmployeeDashboard = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd   = new Date(year, month, 0, 23, 59, 59, 999);
    const today      = new Date();
    today.setHours(0, 0, 0, 0);
    const threeMonthsLater = new Date(today);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    const employee = await prisma.employee.findUnique({
      where: { userId },
      include: {
        leavePolicy: true,
        wfhPolicy: true,
        reportingManager: { select: { fullName: true } },
        workingSchedule: { select: { workingDays: true, saturdayRule: true } },
      },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // Self-heal: archive leftover active balances when employee has no policy
    if (!employee.leavePolicy) {
      await prisma.leaveBalance.updateMany({
        where: { employeeId: employee.id, year, isArchived: false },
        data: { isArchived: true, archivedAt: new Date() },
      });
    }

    let [
      leaveBalances,
      wfhAppsThisYear,
      recentLeaves,
      recentWfh,
      upcomingHolidays,
      monthLeaves,
      monthWfh,
      monthHolidays,
      announcements,
    ] = await Promise.all([
      // Current year leave balances — only active (non-archived) rows
      prisma.leaveBalance.findMany({ where: { employeeId: employee.id, year, isArchived: false } }),

      // WFH apps this year for balance calculation
      prisma.wfhApplication.findMany({
        where: {
          employeeId: employee.id,
          status: { in: ['APPROVED', 'PENDING'] },
          date: {
            gte: new Date(year, 0, 1, 0, 0, 0, 0),
            lte: new Date(year, 11, 31, 23, 59, 59, 999),
          },
        },
        select: { status: true, totalDays: true },
      }),

      // Last 5 leave applications
      prisma.leaveApplication.findMany({
        where: { employeeId: employee.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),

      // Last 5 WFH applications
      prisma.wfhApplication.findMany({
        where: { employeeId: employee.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),

      // Upcoming holidays (next 3 months)
      prisma.publicHoliday.findMany({
        where: { date: { gte: today, lte: threeMonthsLater } },
        orderBy: { date: 'asc' },
        take: 6,
      }),

      // This month's leaves for calendar
      prisma.leaveApplication.findMany({
        where: {
          employeeId: employee.id,
          status: { in: ['APPROVED', 'PENDING'] },
          fromDate: { lte: monthEnd },
          toDate:   { gte: monthStart },
        },
        select: { fromDate: true, toDate: true, status: true, leaveType: true },
      }),

      // This month's WFH for calendar
      prisma.wfhApplication.findMany({
        where: {
          employeeId: employee.id,
          status: { in: ['APPROVED', 'PENDING'] },
          date: { gte: monthStart, lte: monthEnd },
        },
        select: { date: true, status: true },
      }),

      // This month's holidays for calendar
      prisma.publicHoliday.findMany({
        where: { date: { gte: monthStart, lte: monthEnd } },
        select: { date: true, name: true },
      }),

      // Active, non-dismissed announcements
      prisma.announcement.findMany({
        where: {
          isActive: true,
          AND: [
            {
              OR: [
                { scheduledAt: null },
                { scheduledAt: { lte: now } },
              ],
            },
            {
              OR: [
                { expiresAt: null },
                { expiresAt: { gte: now } },
              ],
            },
          ],
          dismissals: {
            none: {
              employeeId: employee.id,
            },
          },
        },
        orderBy: [
          { priority: 'asc' },
          { createdAt: 'desc' },
        ],
      }),
    ]);

    if (leaveBalances.length === 0 && employee.leavePolicy) {
      const allocatedDays = calculateProRatedDays(
        employee.leavePolicy.daysAllowed,
        employee.dateOfJoining,
        year
      );
      const b = await getOrInitBalance(
        employee.id,
        employee.leavePolicy.leaveType,
        year,
        allocatedDays,
        employee.leavePolicy.carryForward
      );
      leaveBalances = [b];
    }

    // WFH balance
    const wfhUsed    = wfhAppsThisYear.filter((a) => a.status === 'APPROVED').reduce((s, a) => s + a.totalDays, 0);
    const wfhPending = wfhAppsThisYear.filter((a) => a.status === 'PENDING').reduce((s, a) => s + a.totalDays, 0);
    const wfhBalance = {
      policy: employee.wfhPolicy,
      usedDays: wfhUsed,
      pendingDays: wfhPending,
      remainingDays: Math.max(0, (employee.wfhPolicy?.daysAllowed ?? 0) - wfhUsed - wfhPending),
      month,
      year,
    };

    // Build calendar events
    const calendarEvents: Array<{
      date: string;
      type: 'LEAVE' | 'WFH' | 'HOLIDAY';
      status?: string;
      leaveType?: string;
      name?: string;
    }> = [];

    for (const leave of monthLeaves) {
      const cur = new Date(leave.fromDate);
      cur.setHours(0, 0, 0, 0);
      const end = new Date(leave.toDate);
      end.setHours(23, 59, 59, 999);
      while (cur <= end && cur <= monthEnd) {
        if (cur >= monthStart) {
          calendarEvents.push({
            date: toDateStr(cur),
            type: 'LEAVE',
            status: leave.status,
            leaveType: leave.leaveType,
          });
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    for (const wfh of monthWfh) {
      calendarEvents.push({ date: toDateStr(new Date(wfh.date)), type: 'WFH', status: wfh.status });
    }

    for (const h of monthHolidays) {
      calendarEvents.push({ date: toDateStr(new Date(h.date)), type: 'HOLIDAY', name: h.name });
    }

    // Combine and sort recent applications
    const recentApplications = [
      ...recentLeaves.map((l) => ({ ...l, appType: 'LEAVE' as const })),
      ...recentWfh.map((w) => ({
        ...w,
        appType: 'WFH' as const,
        fromDate: w.date,
        toDate: w.date,
        leaveType: undefined,
        totalDays: w.totalDays,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    return res.json({
      leaveBalances,
      wfhBalance,
      recentApplications,
      upcomingHolidays,
      calendarEvents,
      announcements,
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        employeeId: employee.employeeId,
        leavePolicy: employee.leavePolicy,
        wfhPolicy: employee.wfhPolicy,
        reportingManager: employee.reportingManager,
        workingSchedule: employee.workingSchedule,
        probationMonths: employee.probationMonths,
        dateOfJoining: employee.dateOfJoining,
        isOnNoticePeriod:  (employee as any).isOnNoticePeriod  ?? false,
        noticePeriodStart: (employee as any).noticePeriodStart ?? null,
        noticePeriodEnd:   (employee as any).noticePeriodEnd   ?? null,
        earlyReleaseDate:  (employee as any).earlyReleaseDate  ?? null,
      },
      currentMonth: month,
      currentYear: year,
    });
  } catch (error) {
    logger.error('getEmployeeDashboard error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/employee/portal/profile ─────────────────────────────────────────
export const getEmployeeProfile = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        employee: {
          include: {
            reportingManager: { select: { fullName: true, employeeId: true } },
            leavePolicy: { select: { id: true, name: true, leaveType: true, daysAllowed: true } },
            wfhPolicy:   { select: { id: true, name: true, daysAllowed: true } },
            workingSchedule: { select: { workingDays: true, saturdayRule: true } },
          },
        },
      },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json({
      user: { id: user.id, email: user.email, role: user.role },
      employee: user.employee,
    });
  } catch (error) {
    logger.error('getEmployeeProfile error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/employee/portal/my-policies ─────────────────────────────────────
export const getMyPolicies = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;

    const employee = await prisma.employee.findUnique({
      where: { userId },
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
    logger.error('getMyPolicies error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/employee/portal/policy-explain ──────────────────────────────────
export const explainPolicy = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;

    const employee = await prisma.employee.findUnique({
      where: { userId },
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
- WFH Days Allowed Per Month: ${wp.daysAllowed}
- Approval Required: ${wp.approvalRequired ? 'Yes' : 'No'}
- Notice Required: ${wp.noticeRequired ? `Yes (${wp.minNoticeDays} days)` : 'No'}
- Half Day WFH Allowed: ${wp.halfDayAllowed ? 'Yes' : 'No'}
- WFH Days Used: ${wfhUsed._sum.totalDays ?? 0} / ${wp.daysAllowed}
- WFH Days Remaining: ${Math.max(0, wp.daysAllowed - (wfhUsed._sum.totalDays ?? 0))}
` : ''}
    `.trim();

    const { question } = req.body as { question?: string };

    const systemPrompt = `You are an HR AI assistant for Innovizia. Your job is to explain company leave and WFH policies to employees in a clear, friendly, and helpful way. Use simple language. When explaining policy details, use numbered bullet points — one point per line. Be concise but thorough. Address the employee by their first name. Always be encouraging and supportive.`;

    const userMessage = question
      ? `Here is my policy information:\n\n${policyContext}\n\nMy question: ${question}`
      : `Here is my policy information:\n\n${policyContext}\n\nPlease explain all my leave and WFH policies in a clear, friendly way. Give me key insights about what I'm entitled to, what I've used so far, and any important rules I should know about. Format as numbered bullet points.`;

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
    logger.error('explainPolicy error:', error);
    return res.status(500).json({ message: error?.message ?? 'Internal server error' });
  }
};


// ── GET /api/employee/portal/monthly-calendar ─────────────────────────────────
export const getMonthlyCalendar = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    const now    = new Date();
    const month  = Math.max(1, Math.min(12, parseInt((req.query.month as string) || '') || now.getMonth() + 1));
    const year   = parseInt((req.query.year  as string) || '') || now.getFullYear();

    // Block future months
    const requestedDate = new Date(year, month - 1, 1);
    const currentMonth  = new Date(now.getFullYear(), now.getMonth(), 1);
    if (requestedDate > currentMonth) {
      return res.status(400).json({ message: 'Cannot view reports for future months.' });
    }

    const employee = await prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const report = await calculateEmployeeMonthReport(employee.id, month, year);
    if (!report) {
      return res.json({
        month, year, days: [], summary: null,
        message: 'No report data available for this period.',
      });
    }

    return res.json({
      month,
      year,
      days: report.days,
      summary: {
        totalWorkingDays: report.totalWorkingDays,
        presentDays:      report.presentDays,
        leaveDays:        report.leaveDays,
        absentDays:       report.absentDays,
        wfhDays:          report.wfhDays,
        attendancePct:    report.attendancePct,
        leaveBreakdown:   report.leaveBreakdown,
      },
    });
  } catch (error) {
    logger.error('getMonthlyCalendar error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
