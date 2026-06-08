import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/authenticate';
import { audit } from '../services/auditService';
import { createNotification } from '../services/notificationService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function parseHHMM(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

function todayAt(hhmm: string): Date {
  const { h, m } = parseHHMM(hhmm);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

async function getSettings() {
  return prisma.orgSettings.upsert({
    where:  { id: 'global' },
    create: { id: 'global', orgName: 'Innovizia', timezone: 'Asia/Kolkata' },
    update: {},
  }) as any;
}

async function getOrCreateTodayCode(adminId?: string): Promise<string> {
  const today = toDateStr();
  const existing = await (prisma as any).dailyCheckInCode.findUnique({ where: { date: today } });
  if (existing) return existing.code;

  const code      = generateCode();
  const expiresAt = new Date();
  expiresAt.setHours(23, 59, 59, 999);

  await (prisma as any).dailyCheckInCode.create({
    data: { code, date: today, expiresAt, createdBy: adminId ?? null },
  });
  return code;
}

// ── ADMIN: get today's code ───────────────────────────────────────────────────
export const getAdminCheckInCode = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const today = toDateStr();
    const code  = await (prisma as any).dailyCheckInCode.findUnique({ where: { date: today } });
    return res.json({ date: today, code: code?.code ?? null, hasCode: !!code });
  } catch (error) {
    logger.error('getAdminCheckInCode error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── ADMIN: generate / regenerate today's code ─────────────────────────────────
export const generateCheckInCode = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const adminId = req.user!.userId;
    const today   = toDateStr();
    const code    = generateCode();
    const expiresAt = new Date();
    expiresAt.setHours(23, 59, 59, 999);

    await (prisma as any).dailyCheckInCode.upsert({
      where:  { date: today },
      update: { code, createdBy: adminId },
      create: { code, date: today, expiresAt, createdBy: adminId },
    });

    audit(req, 'CHECKIN_CODE_GENERATED', 'SETTINGS', today, { code });
    return res.json({ message: 'Code generated', date: today, code });
  } catch (error) {
    logger.error('generateCheckInCode error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── ADMIN: today's attendance dashboard ──────────────────────────────────────
export const getAdminTodayAttendance = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const date       = (req.query.date as string) || toDateStr();
    const search     = req.query.search as string | undefined;
    const department = req.query.department as string | undefined;
    const status     = req.query.status as string | undefined;
    const page       = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit      = Math.min(100, parseInt((req.query.limit as string) || '30', 10));

    // Get all active employees
    const empWhere: Record<string, any> = { isActive: true };
    if (search)     empWhere['OR'] = [
      { fullName:   { contains: search, mode: 'insensitive' } },
      { employeeId: { contains: search, mode: 'insensitive' } },
    ];
    if (department) empWhere['department'] = { contains: department, mode: 'insensitive' };

    const [allEmployees, total] = await Promise.all([
      prisma.employee.findMany({
        where: empWhere,
        select: { id: true, fullName: true, employeeId: true, department: true, designation: true },
        orderBy: { fullName: 'asc' },
      }),
      prisma.employee.count({ where: empWhere }),
    ]);

    // Get check-in records for this date
    const records = await (prisma as any).checkInRecord.findMany({
      where: { date },
      select: {
        id: true, employeeId: true, checkInTime: true, checkOutTime: true,
        isLate: true, lateMinutes: true, earlyCheckout: true, earlyMinutes: true,
        workingHours: true, status: true, adminOverride: true, adminNote: true,
        checkInAddress: true, checkOutAddress: true, checkInLat: true, checkInLng: true,
      },
    });

    const recordMap = new Map(records.map((r: any) => [r.employeeId, r]));

    let rows = allEmployees.map((emp) => {
      const rec = recordMap.get(emp.id) as any ?? null;
      return {
        employeeId:   emp.id,
        empId:        emp.employeeId,
        fullName:     emp.fullName,
        department:   emp.department,
        designation:  emp.designation,
        record:       rec,
        status:       rec?.status ?? 'NOT_CHECKED_IN',
        checkInTime:  rec?.checkInTime  ?? null,
        checkOutTime: rec?.checkOutTime ?? null,
        isLate:       rec?.isLate       ?? false,
        lateMinutes:  rec?.lateMinutes  ?? null,
        earlyCheckout: rec?.earlyCheckout ?? false,
        workingHours:  rec?.workingHours  ?? null,
        checkInAddress: rec?.checkInAddress ?? null,
      };
    });

    // Filter by status
    if (status) {
      rows = rows.filter(r => r.status === status);
    }

    // Stats
    const stats = {
      total:          allEmployees.length,
      checkedIn:      rows.filter(r => r.status === 'CHECKED_IN').length,
      checkedOut:     rows.filter(r => r.status === 'CHECKED_OUT').length,
      late:           rows.filter(r => r.isLate).length,
      absent:         rows.filter(r => r.status === 'ABSENT').length,
      notCheckedIn:   rows.filter(r => r.status === 'NOT_CHECKED_IN').length,
      onLeave:        rows.filter(r => r.status === 'ON_LEAVE').length,
      onWfh:          rows.filter(r => r.status === 'ON_WFH').length,
    };

    // Paginate
    const paginated = rows.slice((page - 1) * limit, page * limit);

    return res.json({ date, stats, data: paginated, total: rows.length, page, limit });
  } catch (error) {
    logger.error('getAdminTodayAttendance error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── ADMIN: manual override ────────────────────────────────────────────────────
export const adminOverrideCheckIn = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { employeeId, date, checkInTime, checkOutTime, status, adminNote } = req.body as {
      employeeId:   string;
      date:         string;
      checkInTime?: string;
      checkOutTime?: string;
      status?:      string;
      adminNote?:   string;
    };

    if (!employeeId || !date) return res.status(400).json({ message: 'employeeId and date are required' });

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const settings  = await getSettings();
    const deadline  = todayAt(settings.checkInDeadline ?? '10:30');
    const checkInDt = checkInTime ? new Date(checkInTime) : undefined;
    const checkOutDt = checkOutTime ? new Date(checkOutTime) : undefined;

    let workingHours: number | null = null;
    if (checkInDt && checkOutDt) {
      workingHours = Math.round(((checkOutDt.getTime() - checkInDt.getTime()) / 3600000) * 10) / 10;
    }

    const isLate      = checkInDt ? checkInDt > deadline : false;
    const lateMinutes = isLate && checkInDt ? Math.round((checkInDt.getTime() - deadline.getTime()) / 60000) : null;

    const record = await (prisma as any).checkInRecord.upsert({
      where:  { employeeId_date: { employeeId, date } },
      update: {
        ...(checkInDt  && { checkInTime:  checkInDt  }),
        ...(checkOutDt && { checkOutTime: checkOutDt }),
        ...(status     && { status }),
        isLate, lateMinutes, workingHours,
        adminOverride: true,
        adminNote: adminNote ?? null,
        updatedAt: new Date(),
      },
      create: {
        employeeId, date,
        checkInTime:  checkInDt  ?? null,
        checkOutTime: checkOutDt ?? null,
        status: (status ?? 'CHECKED_OUT') as any,
        isLate, lateMinutes, workingHours,
        adminOverride: true,
        adminNote: adminNote ?? null,
        updatedAt: new Date(),
      },
    });

    audit(req, 'CHECKIN_ADMIN_OVERRIDE', 'EMPLOYEE', employeeId, { date, checkInTime, checkOutTime, status, adminNote });
    return res.json({ message: 'Override saved', record });
  } catch (error) {
    logger.error('adminOverrideCheckIn error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── ADMIN: export CSV ─────────────────────────────────────────────────────────
export const exportAttendanceCsv = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const date  = (req.query.date as string) || toDateStr();
    const from  = req.query.from  as string | undefined;
    const to    = req.query.to    as string | undefined;

    const where: Record<string, any> = {};
    if (from && to) where['date'] = { gte: from, lte: to };
    else where['date'] = date;

    const records = await (prisma as any).checkInRecord.findMany({
      where,
      include: {
        employee: { select: { fullName: true, employeeId: true, department: true, designation: true } },
      },
      orderBy: [{ date: 'asc' }, { checkInTime: 'asc' }],
    });

    const header = 'Date,Employee ID,Name,Department,Designation,Check-In,Check-Out,Status,Late,Late Minutes,Working Hours,Location,Admin Override\n';
    const rows = records.map((r: any) => {
      const fmt = (d: Date | null) => d ? new Date(d).toLocaleTimeString('en-IN', { hour12: false }) : '';
      return [
        r.date,
        r.employee.employeeId,
        `"${r.employee.fullName}"`,
        `"${r.employee.department ?? ''}"`,
        `"${r.employee.designation ?? ''}"`,
        fmt(r.checkInTime),
        fmt(r.checkOutTime),
        r.status,
        r.isLate ? 'Yes' : 'No',
        r.lateMinutes ?? '',
        r.workingHours ?? '',
        `"${r.checkInAddress ?? ''}"`,
        r.adminOverride ? 'Yes' : 'No',
      ].join(',');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${from || date}.csv"`);
    return res.send(header + rows);
  } catch (error) {
    logger.error('exportAttendanceCsv error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── ADMIN: get checkin settings ───────────────────────────────────────────────
export const getCheckInSettings = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    const settings = await getSettings();
    return res.json({
      checkInEnabled:       settings.checkInEnabled,
      checkInCodeTime:      settings.checkInCodeTime,
      checkInStartTime:     settings.checkInStartTime,
      checkInDeadline:      settings.checkInDeadline,
      checkInBufferMinutes: (settings as any).checkInBufferMinutes ?? 0,
      checkOutExpected:     settings.checkOutExpected,
      checkInWindowEnd:     settings.checkInWindowEnd,
      weeklyEmailEnabled:   (settings as any).weeklyEmailEnabled ?? false,
    });
  } catch (error) {
    logger.error('getCheckInSettings error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── ADMIN: update checkin settings ────────────────────────────────────────────
export const updateCheckInSettings = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const {
      checkInEnabled, checkInCodeTime, checkInStartTime, checkInDeadline,
      checkInBufferMinutes, checkOutExpected, checkInWindowEnd, weeklyEmailEnabled,
    } = req.body as Record<string, any>;

    const updated = await prisma.orgSettings.update({
      where: { id: 'global' },
      data: {
        ...(checkInEnabled        !== undefined && { checkInEnabled:        Boolean(checkInEnabled)        }),
        ...(checkInCodeTime       !== undefined && { checkInCodeTime:       String(checkInCodeTime)        }),
        ...(checkInStartTime      !== undefined && { checkInStartTime:      String(checkInStartTime)       }),
        ...(checkInDeadline       !== undefined && { checkInDeadline:       String(checkInDeadline)        }),
        ...(checkInBufferMinutes  !== undefined && { checkInBufferMinutes:  Number(checkInBufferMinutes)   }),
        ...(checkOutExpected      !== undefined && { checkOutExpected:      String(checkOutExpected)       }),
        ...(checkInWindowEnd      !== undefined && { checkInWindowEnd:      String(checkInWindowEnd)       }),
        ...(weeklyEmailEnabled    !== undefined && { weeklyEmailEnabled:    Boolean(weeklyEmailEnabled)    }),
      },
    });

    audit(req, 'CHECKIN_SETTINGS_UPDATED', 'SETTINGS', 'global', { checkInEnabled, checkInDeadline, checkInBufferMinutes });
    return res.json({ message: 'Check-in settings updated', settings: updated });
  } catch (error) {
    logger.error('updateCheckInSettings error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── EMPLOYEE: get today's status ─────────────────────────────────────────────
export const getMyCheckInStatus = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId   = req.user!.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const settings = await getSettings();
    const today    = toDateStr();
    const record   = await (prisma as any).checkInRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
    });

    return res.json({
      date:       today,
      record:     record ?? null,
      status:     record?.status ?? 'NOT_CHECKED_IN',
      settings: {
        checkInEnabled:   settings.checkInEnabled,
        checkInDeadline:  settings.checkInDeadline,
        checkOutExpected: settings.checkOutExpected,
        checkInStartTime: settings.checkInStartTime,
        checkInWindowEnd: settings.checkInWindowEnd,
      },
    });
  } catch (error) {
    logger.error('getMyCheckInStatus error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── EMPLOYEE: check in ───────────────────────────────────────────────────────
export const employeeCheckIn = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    const { code, lat, lng, address } = req.body as {
      code:     string;
      lat?:     number;
      lng?:     number;
      address?: string;
    };

    if (!code) return res.status(400).json({ message: 'Check-in code is required' });

    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const settings  = await getSettings();
    if (!settings.checkInEnabled) {
      return res.status(403).json({ message: 'Check-in is currently disabled by admin' });
    }

    const today   = toDateStr();
    const now     = new Date();
    const nowHHMM = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    // Validate check-in time window
    if (nowHHMM < (settings.checkInStartTime ?? '07:00')) {
      return res.status(400).json({ message: `Check-in not allowed before ${settings.checkInStartTime}` });
    }
    if (nowHHMM > (settings.checkInWindowEnd ?? '13:00')) {
      return res.status(400).json({ message: `Check-in window has closed for today (after ${settings.checkInWindowEnd})` });
    }

    // Validate daily code
    const todayCode = await (prisma as any).dailyCheckInCode.findUnique({ where: { date: today } });
    if (!todayCode) {
      return res.status(400).json({ message: "Today's check-in code hasn't been generated yet. Please contact your admin." });
    }
    if (code.trim().toUpperCase() !== todayCode.code) {
      return res.status(400).json({ message: 'Invalid check-in code. Please check with your admin and try again.' });
    }

    // Check if already checked in today
    const existing = await (prisma as any).checkInRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
    });
    if (existing && (existing.status === 'CHECKED_IN' || existing.status === 'CHECKED_OUT')) {
      return res.status(400).json({ message: 'You have already checked in today.' });
    }

    // Late detection (deadline + configurable buffer grace period)
    const deadline      = todayAt(settings.checkInDeadline ?? '10:30');
    const bufferMs      = ((settings as any).checkInBufferMinutes ?? 0) * 60000;
    const effectiveLate = new Date(deadline.getTime() + bufferMs);
    const isLate        = now > effectiveLate;
    const lateMinutes   = isLate ? Math.round((now.getTime() - deadline.getTime()) / 60000) : null;

    // Client IP
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || null;

    const record = await (prisma as any).checkInRecord.upsert({
      where:  { employeeId_date: { employeeId: employee.id, date: today } },
      update: {
        checkInTime: now, status: 'CHECKED_IN',
        isLate, lateMinutes,
        checkInLat: lat ?? null, checkInLng: lng ?? null, checkInAddress: address ?? null,
        checkInIp: ip,
        updatedAt: now,
      },
      create: {
        employeeId: employee.id, date: today,
        checkInTime: now, status: 'CHECKED_IN',
        isLate, lateMinutes,
        checkInLat: lat ?? null, checkInLng: lng ?? null, checkInAddress: address ?? null,
        checkInIp: ip,
        updatedAt: now,
      },
    });

    return res.json({
      message:    isLate ? `Checked in (${lateMinutes} min late)` : 'Checked in successfully!',
      record,
      isLate,
      lateMinutes,
    });
  } catch (error) {
    logger.error('employeeCheckIn error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── EMPLOYEE: check out ──────────────────────────────────────────────────────
export const employeeCheckOut = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    const { lat, lng, address } = req.body as { lat?: number; lng?: number; address?: string };

    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const today  = toDateStr();
    const now    = new Date();
    const record = await (prisma as any).checkInRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
    });

    if (!record || record.status !== 'CHECKED_IN') {
      return res.status(400).json({ message: 'You must check in first before checking out.' });
    }

    const settings     = await getSettings();
    const expectedOut  = todayAt(settings.checkOutExpected ?? '18:00');
    const earlyCheckout = now < expectedOut;
    const earlyMinutes  = earlyCheckout ? Math.round((expectedOut.getTime() - now.getTime()) / 60000) : null;

    const workingHours = record.checkInTime
      ? Math.round(((now.getTime() - new Date(record.checkInTime).getTime()) / 3600000) * 10) / 10
      : null;

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || null;

    const updated = await (prisma as any).checkInRecord.update({
      where: { id: record.id },
      data: {
        checkOutTime: now, status: 'CHECKED_OUT',
        earlyCheckout, earlyMinutes, workingHours,
        checkOutLat: lat ?? null, checkOutLng: lng ?? null, checkOutAddress: address ?? null,
        checkOutIp: ip,
        updatedAt: now,
      },
    });

    return res.json({
      message:      earlyCheckout ? `Checked out (${earlyMinutes} min early)` : 'Checked out successfully!',
      record:       updated,
      workingHours,
      earlyCheckout,
      earlyMinutes,
    });
  } catch (error) {
    logger.error('employeeCheckOut error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── EMPLOYEE: my check-in history ────────────────────────────────────────────
export const getMyCheckInHistory = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId   = req.user!.userId;
    const page     = Math.max(1, parseInt((req.query.page  as string) || '1', 10));
    const limit    = Math.min(60, parseInt((req.query.limit as string) || '20', 10));
    const month    = req.query.month ? parseInt(req.query.month as string, 10) : null;
    const year     = req.query.year  ? parseInt(req.query.year  as string, 10) : new Date().getFullYear();

    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const where: Record<string, any> = { employeeId: employee.id };
    if (month) {
      const mm  = String(month).padStart(2, '0');
      const yyy = String(year);
      where['date'] = { gte: `${yyy}-${mm}-01`, lte: `${yyy}-${mm}-31` };
    } else {
      where['date'] = { gte: `${year}-01-01`, lte: `${year}-12-31` };
    }

    const [records, total] = await Promise.all([
      (prisma as any).checkInRecord.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      (prisma as any).checkInRecord.count({ where }),
    ]);

    return res.json({ data: records, total, page, limit });
  } catch (error) {
    logger.error('getMyCheckInHistory error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Exported helper for cron ──────────────────────────────────────────────────
export { getOrCreateTodayCode, generateCode, toDateStr };
