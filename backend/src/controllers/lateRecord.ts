import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/authenticate';

function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ── GET /api/admin/late-records?month=&year= ──────────────────────────────────
export const listLateRecords = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { month, year, employeeId } = req.query as Record<string, string>;
    const y = parseInt(year ?? String(new Date().getFullYear()), 10);
    const m = parseInt(month ?? String(new Date().getMonth() + 1), 10);

    const from = new Date(Date.UTC(y, m - 1, 1));
    const to   = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    const where: any = { date: { gte: from, lte: to } };
    if (employeeId) where.employeeId = employeeId;

    const rows = await prisma.lateRecord.findMany({
      where,
      include: {
        employee: { select: { id: true, fullName: true, employeeId: true, department: true } },
      },
      orderBy: [{ date: 'asc' }, { employee: { fullName: 'asc' } }],
    });

    return res.json(rows);
  } catch (err) {
    logger.error('listLateRecords error', err);
    return res.status(500).json({ message: 'Failed to fetch late records' });
  }
};

// ── POST /api/admin/late-records ──────────────────────────────────────────────
export const createLateRecord = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { employeeId, date, lateMinutes, note } = req.body;

    if (!employeeId || !date) {
      return res.status(400).json({ message: 'employeeId and date are required' });
    }

    const dateOnly = toDateOnly(new Date(date));
    const minutes  = Math.max(0, parseInt(lateMinutes ?? '0', 10));

    const emp = await prisma.employee.findUnique({ where: { id: employeeId as string }, select: { id: true } });
    if (!emp) return res.status(404).json({ message: 'Employee not found' });

    const record = await prisma.lateRecord.upsert({
      where: { employeeId_date: { employeeId: employeeId as string, date: dateOnly } },
      update: { lateMinutes: minutes, note: (note as string | undefined) ?? null, source: 'MANUAL', markedById: req.user!.userId },
      create: { employeeId: employeeId as string, date: dateOnly, lateMinutes: minutes, note: (note as string | undefined) ?? null, source: 'MANUAL', markedById: req.user!.userId },
    });

    return res.status(201).json(record);
  } catch (err) {
    logger.error('createLateRecord error', err);
    return res.status(500).json({ message: 'Failed to create late record' });
  }
};

// ── DELETE /api/admin/late-records/:id ────────────────────────────────────────
export const deleteLateRecord = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const existing = await prisma.lateRecord.findUnique({ where: { id: req.params.id as string } });
    if (!existing) return res.status(404).json({ message: 'Late record not found' });

    await prisma.lateRecord.delete({ where: { id: req.params.id as string } });
    return res.json({ message: 'Late record removed' });
  } catch (err) {
    logger.error('deleteLateRecord error', err);
    return res.status(500).json({ message: 'Failed to delete late record' });
  }
};

// ── DELETE by employeeId + date ───────────────────────────────────────────────
export const deleteLateRecordByDate = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { employeeId, date } = req.body;
    if (!employeeId || !date) return res.status(400).json({ message: 'employeeId and date required' });

    const dateOnly = toDateOnly(new Date(date));
    await prisma.lateRecord.deleteMany({
      where: { employeeId: employeeId as string, date: dateOnly },
    });
    return res.json({ message: 'Late record removed' });
  } catch (err) {
    logger.error('deleteLateRecordByDate error', err);
    return res.status(500).json({ message: 'Failed to remove late record' });
  }
};
