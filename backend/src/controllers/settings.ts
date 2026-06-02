import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/authenticate';

// ── Org Settings ──────────────────────────────────────────────────────────────

export const getOrgSettings = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const settings = await prisma.orgSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', orgName: 'Innovizia', timezone: 'Asia/Kolkata' },
      update: {},
    });
    return res.json(settings);
  } catch (error) {
    console.error('getOrgSettings error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateOrgSettings = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { orgName, timezone } = req.body as { orgName?: string; timezone?: string };

    const settings = await prisma.orgSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', orgName: orgName ?? 'Innovizia', timezone: timezone ?? 'Asia/Kolkata' },
      update: {
        ...(orgName !== undefined && { orgName }),
        ...(timezone !== undefined && { timezone }),
      },
    });

    return res.json({ message: 'Settings updated', settings });
  } catch (error) {
    console.error('updateOrgSettings error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Public Holidays ───────────────────────────────────────────────────────────

export const getHolidays = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const year = parseInt((req.query.year as string) || '') || new Date().getFullYear();
    const holidays = await prisma.publicHoliday.findMany({
      where: { year },
      orderBy: { date: 'asc' },
    });
    return res.json(holidays);
  } catch (error) {
    console.error('getHolidays error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const addHoliday = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { date, name, year: yearParam } = req.body as { date: string; name: string; year?: number };
    if (!date || !name) return res.status(400).json({ message: 'date and name are required' });

    const d = new Date(date);
    const year = yearParam ?? d.getFullYear();

    const holiday = await prisma.publicHoliday.create({
      data: { date: d, name, year },
    });
    return res.status(201).json(holiday);
  } catch (error) {
    console.error('addHoliday error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteHoliday = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    await prisma.publicHoliday.delete({ where: { id } });
    return res.json({ message: 'Holiday deleted' });
  } catch (error) {
    console.error('deleteHoliday error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Departments ───────────────────────────────────────────────────────────────

export const getDepartments = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
    });
    return res.json(departments);
  } catch (error) {
    console.error('getDepartments error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const addDepartment = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { name } = req.body as { name: string };
    if (!name || !name.trim()) return res.status(400).json({ message: 'Department name is required' });

    const existing = await prisma.department.findUnique({ where: { name: name.trim() } });
    if (existing) return res.status(409).json({ message: 'Department already exists' });

    const department = await prisma.department.create({ data: { name: name.trim() } });
    return res.status(201).json(department);
  } catch (error) {
    console.error('addDepartment error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteDepartment = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    await prisma.department.delete({ where: { id } });
    return res.json({ message: 'Department deleted' });
  } catch (error) {
    console.error('deleteDepartment error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Employee Roles ────────────────────────────────────────────────────────────

export const getRoles = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const roles = await prisma.employeeRole.findMany({ orderBy: { name: 'asc' } });
    return res.json(roles);
  } catch (error) {
    console.error('getRoles error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const addRole = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { name } = req.body as { name: string };
    if (!name || !name.trim()) return res.status(400).json({ message: 'Role name is required' });

    const existing = await prisma.employeeRole.findUnique({ where: { name: name.trim() } });
    if (existing) return res.status(409).json({ message: 'Role already exists' });

    const role = await prisma.employeeRole.create({ data: { name: name.trim() } });
    return res.status(201).json(role);
  } catch (error) {
    console.error('addRole error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteRole = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    await prisma.employeeRole.delete({ where: { id } });
    return res.json({ message: 'Role deleted' });
  } catch (error) {
    console.error('deleteRole error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Audit Log ─────────────────────────────────────────────────────────────────

export const getAuditLog = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const page  = Math.max(1, parseInt((req.query.page  as string) || '1', 10));
    const limit = Math.min(50, parseInt((req.query.limit as string) || '20', 10));

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count(),
    ]);

    // Resolve admin names
    const adminIds = [...new Set(logs.map((l) => l.adminId))];
    const admins = await prisma.user.findMany({
      where: { id: { in: adminIds } },
      include: { employee: { select: { fullName: true, employeeId: true } } },
    });
    const adminMap = new Map(
      admins.map((a) => [a.id, a.employee?.fullName ?? a.email])
    );

    const enriched = logs.map((l) => ({ ...l, adminName: adminMap.get(l.adminId) ?? 'Unknown' }));

    return res.json({ data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('getAuditLog error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
