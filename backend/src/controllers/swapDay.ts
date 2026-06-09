import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/authenticate';
import { createNotification } from '../services/notificationService';
import {
  sendSwapDayCreatedEmail,
  sendSwapDayCompensatedEmail,
  sendSwapDayDefaultedEmail,
} from '../services/emailService';

// ── helpers ───────────────────────────────────────────────────────────────────

function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

async function getAdminUsers() {
  return prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, email: true } });
}

function enrichRow(r: { status: string; compensationDate: Date | null; deadline: Date | null; [k: string]: any }) {
  const now = new Date();
  return {
    ...r,
    isOverdue: r.status === 'PENDING_COMPENSATION' && !!r.compensationDate && r.compensationDate < now,
    isDueSoon:
      r.status === 'PENDING_COMPENSATION' &&
      !!r.compensationDate &&
      r.compensationDate >= now &&
      !!r.deadline &&
      r.deadline.getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000,
  };
}

// ── GET /api/admin/swap-days ──────────────────────────────────────────────────
export const listSwapDays = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const {
      status,
      search,
      page = '1',
      limit = '20',
      dateFrom,
      dateTo,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(limit, 10));

    const where: any = {};

    if (status && status !== 'ALL') where.status = status;
    if (dateFrom) where.absentDate = { ...where.absentDate, gte: new Date(dateFrom) };
    if (dateTo)   where.absentDate = { ...where.absentDate, lte: new Date(dateTo) };

    if (search) {
      where.employee = {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { employeeId: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [rows, total] = await Promise.all([
      prisma.swapDay.findMany({
        where,
        include: {
          employee: { select: { id: true, fullName: true, employeeId: true, department: true, designation: true } },
        },
        orderBy: [{ status: 'asc' }, { deadline: 'asc' }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.swapDay.count({ where }),
    ]);

    return res.json({ data: rows.map(enrichRow), total, page: pageNum, limit: limitNum });
  } catch (err) {
    logger.error('listSwapDays error', err);
    return res.status(500).json({ message: 'Failed to fetch swap days' });
  }
};

// ── GET /api/admin/swap-days/stats ────────────────────────────────────────────
export const getSwapDayStats = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    const now = new Date();
    const [pending, overdue, compensated, defaulted] = await Promise.all([
      prisma.swapDay.count({ where: { status: 'PENDING_COMPENSATION' } }),
      prisma.swapDay.count({ where: { status: 'PENDING_COMPENSATION', compensationDate: { lt: now } } }),
      prisma.swapDay.count({ where: { status: 'COMPENSATED' } }),
      prisma.swapDay.count({ where: { status: 'DEFAULTED' } }),
    ]);
    return res.json({ pending, overdue, compensated, defaulted });
  } catch (err) {
    logger.error('getSwapDayStats error', err);
    return res.status(500).json({ message: 'Failed to get stats' });
  }
};

// ── GET /api/admin/swap-days/employee/:employeeId ─────────────────────────────
export const getEmployeeSwapDays = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const rows = await prisma.swapDay.findMany({
      where: { employeeId: req.params.employeeId as string },
      orderBy: { absentDate: 'desc' },
    });
    return res.json(rows.map(enrichRow));
  } catch (err) {
    logger.error('getEmployeeSwapDays error', err);
    return res.status(500).json({ message: 'Failed to fetch employee swap days' });
  }
};

// ── GET /api/admin/swap-days/:id ──────────────────────────────────────────────
export const getSwapDayById = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const row = await prisma.swapDay.findUnique({
      where: { id: req.params.id as string },
      include: {
        employee: {
          select: {
            id: true, fullName: true, employeeId: true,
            department: true, designation: true,
            user: { select: { email: true } },
          },
        },
      },
    });
    if (!row) return res.status(404).json({ message: 'Swap day not found' });
    return res.json(enrichRow(row));
  } catch (err) {
    logger.error('getSwapDayById error', err);
    return res.status(500).json({ message: 'Failed to fetch swap day' });
  }
};

// ── POST /api/admin/swap-days ─────────────────────────────────────────────────
export const createSwapDay = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { employeeId, absentDate, compensationDate, note } = req.body;

    if (!employeeId || !absentDate) {
      return res.status(400).json({ message: 'employeeId and absentDate are required' });
    }

    const absent = toDateOnly(new Date(absentDate));
    let comp: Date | null = null;
    let deadline: Date | null = null;

    if (compensationDate) {
      comp     = toDateOnly(new Date(compensationDate));
      deadline = addDays(absent, 30);
      if (comp <= absent) {
        return res.status(400).json({ message: 'Compensation date must be after the absent date' });
      }
    }

    const emp = await prisma.employee.findUnique({
      where: { id: employeeId as string },
      select: { id: true, fullName: true, employeeId: true, department: true },
    });
    if (!emp) return res.status(404).json({ message: 'Employee not found' });

    const existing = await prisma.swapDay.findFirst({
      where: { employeeId: employeeId as string, absentDate: absent, status: 'PENDING_COMPENSATION' },
    });
    if (existing) {
      return res.status(409).json({ message: 'An active swap day already exists for this employee on that absent date' });
    }

    const adminId = req.user!.userId;

    const record = await prisma.swapDay.create({
      data: {
        employeeId: employeeId as string,
        absentDate: absent,
        compensationDate: comp ?? undefined,
        deadline: deadline ?? undefined,
        note: (note as string | undefined)?.trim() || null,
        createdById: adminId,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId,
        action: 'SWAP_DAY_CREATED',
        targetType: 'SWAP_DAY',
        targetId: record.id,
        meta: JSON.stringify({ employeeId, absentDate: absent, compensationDate: comp }),
      },
    });

    const admins = await getAdminUsers();
    await sendSwapDayCreatedEmail(
      admins.map((a) => a.email),
      emp,
      {
        absentDate: fmtDate(absent),
        compensationDate: comp ? fmtDate(comp) : 'Not set',
        deadline: deadline ? fmtDate(deadline) : 'Not set',
        note: (note as string | undefined)?.trim() || '',
        swapDayId: record.id,
      }
    ).catch((e) => logger.warn('sendSwapDayCreatedEmail failed', e));

    await Promise.all(
      admins.map((a) =>
        createNotification(
          a.id,
          'SWAP_DAY_CREATED',
          `Swap day created for ${emp.fullName} — absent: ${fmtDate(absent)}${comp ? `, comp: ${fmtDate(comp)}` : ' (comp date TBD)'}`,
          `/admin/swap-days/${record.id}`
        )
      )
    );

    return res.status(201).json(record);
  } catch (err) {
    logger.error('createSwapDay error', err);
    return res.status(500).json({ message: 'Failed to create swap day' });
  }
};

// ── PATCH /api/admin/swap-days/:id/compensated ────────────────────────────────
export const markCompensated = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const record = await prisma.swapDay.findUnique({ where: { id: req.params.id as string } });
    if (!record) return res.status(404).json({ message: 'Swap day not found' });
    if (record.status !== 'PENDING_COMPENSATION') {
      return res.status(400).json({ message: `Cannot mark compensated — current status is ${record.status}` });
    }

    const emp = await prisma.employee.findUnique({
      where: { id: record.employeeId },
      select: { id: true, fullName: true, employeeId: true, department: true },
    });

    const adminId = req.user!.userId;
    const updated = await prisma.swapDay.update({
      where: { id: record.id },
      data: { status: 'COMPENSATED', resolvedById: adminId, resolvedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        adminId,
        action: 'SWAP_DAY_COMPENSATED',
        targetType: 'SWAP_DAY',
        targetId: record.id,
        meta: JSON.stringify({ employeeId: record.employeeId }),
      },
    });

    if (emp) {
      const admins = await getAdminUsers();
      await sendSwapDayCompensatedEmail(
        admins.map((a) => a.email),
        emp,
        { absentDate: fmtDate(record.absentDate), compensationDate: record.compensationDate ? fmtDate(record.compensationDate) : 'Not set', swapDayId: record.id }
      ).catch((e) => logger.warn('sendSwapDayCompensatedEmail failed', e));
    }

    return res.json(updated);
  } catch (err) {
    logger.error('markCompensated error', err);
    return res.status(500).json({ message: 'Failed to mark as compensated' });
  }
};

// ── PATCH /api/admin/swap-days/:id/defaulted ──────────────────────────────────
export const markDefaulted = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const record = await prisma.swapDay.findUnique({ where: { id: req.params.id as string } });
    if (!record) return res.status(404).json({ message: 'Swap day not found' });
    if (record.status !== 'PENDING_COMPENSATION') {
      return res.status(400).json({ message: `Cannot mark defaulted — current status is ${record.status}` });
    }

    const emp = await prisma.employee.findUnique({
      where: { id: record.employeeId },
      select: { id: true, fullName: true, employeeId: true, department: true },
    });

    const adminId = req.user!.userId;

    // Create AbsentRecord so muster shows 'A' and monthly report counts it
    let absentRecord = await prisma.absentRecord.findFirst({
      where: { employeeId: record.employeeId, date: record.absentDate },
    });
    if (!absentRecord) {
      absentRecord = await prisma.absentRecord.create({
        data: {
          employeeId: record.employeeId,
          date: record.absentDate,
          reason: `Swap day defaulted — compensation not served${record.deadline ? ` by ${fmtDate(record.deadline)}` : ''}`,
          overrideById: adminId,
        },
      });
    }

    const updated = await prisma.swapDay.update({
      where: { id: record.id },
      data: {
        status: 'DEFAULTED',
        absentMarked: true,
        absentRecordId: absentRecord.id,
        resolvedById: adminId,
        resolvedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId,
        action: 'SWAP_DAY_DEFAULTED',
        targetType: 'SWAP_DAY',
        targetId: record.id,
        meta: JSON.stringify({ employeeId: record.employeeId, absentRecordId: absentRecord.id }),
      },
    });

    if (emp) {
      const admins = await getAdminUsers();
      await sendSwapDayDefaultedEmail(
        admins.map((a) => a.email),
        emp,
        {
          absentDate: fmtDate(record.absentDate),
          compensationDate: record.compensationDate ? fmtDate(record.compensationDate) : 'Not set',
          deadline: record.deadline ? fmtDate(record.deadline) : 'Not set',
          swapDayId: record.id,
        }
      ).catch((e) => logger.warn('sendSwapDayDefaultedEmail failed', e));

      await Promise.all(
        admins.map((a) =>
          createNotification(
            a.id,
            'SWAP_DAY_DEFAULTED',
            `${emp.fullName} marked absent for ${fmtDate(record.absentDate)} — swap day defaulted`,
            `/admin/swap-days/${record.id}`
          )
        )
      );
    }

    return res.json(updated);
  } catch (err) {
    logger.error('markDefaulted error', err);
    return res.status(500).json({ message: 'Failed to mark as defaulted' });
  }
};

// ── DELETE /api/admin/swap-days/:id ──────────────────────────────────────────
export const deleteSwapDay = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const record = await prisma.swapDay.findUnique({ where: { id: req.params.id as string } });
    if (!record) return res.status(404).json({ message: 'Swap day not found' });
    if (record.status !== 'PENDING_COMPENSATION') {
      return res.status(400).json({ message: 'Only pending swap days can be deleted' });
    }

    await prisma.swapDay.delete({ where: { id: record.id } });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.userId,
        action: 'SWAP_DAY_DELETED',
        targetType: 'SWAP_DAY',
        targetId: record.id,
        meta: JSON.stringify({ employeeId: record.employeeId }),
      },
    });

    return res.json({ message: 'Swap day deleted' });
  } catch (err) {
    logger.error('deleteSwapDay error', err);
    return res.status(500).json({ message: 'Failed to delete swap day' });
  }
};

// ── PATCH /api/admin/swap-days/:id/set-compensation ───────────────────────────
export const setCompensationDate = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { compensationDate } = req.body;
    if (!compensationDate) {
      return res.status(400).json({ message: 'compensationDate is required' });
    }

    const record = await prisma.swapDay.findUnique({ where: { id: req.params.id as string } });
    if (!record) return res.status(404).json({ message: 'Swap day not found' });
    if (record.status !== 'PENDING_COMPENSATION') {
      return res.status(400).json({ message: 'Can only set compensation date on pending swap days' });
    }

    const comp     = toDateOnly(new Date(compensationDate));
    const deadline = addDays(record.absentDate, 30);

    if (comp <= record.absentDate) {
      return res.status(400).json({ message: 'Compensation date must be after the absent date' });
    }

    const updated = await prisma.swapDay.update({
      where: { id: record.id },
      data: { compensationDate: comp, deadline },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.user!.userId,
        action: 'SWAP_DAY_COMP_DATE_SET',
        targetType: 'SWAP_DAY',
        targetId: record.id,
        meta: JSON.stringify({ compensationDate: comp, deadline }),
      },
    });

    return res.json(updated);
  } catch (err) {
    logger.error('setCompensationDate error', err);
    return res.status(500).json({ message: 'Failed to set compensation date' });
  }
};
