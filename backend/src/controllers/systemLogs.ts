import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/authenticate';
import { getActionCategory } from '../services/auditService';

// ── GET /api/admin/system-logs ────────────────────────────────────────────────
export const getSystemLogs = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const page       = Math.max(1, parseInt((req.query.page  as string) || '1', 10));
    const limit      = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '50', 10)));
    const action     = (req.query.action     as string) || undefined;
    const targetType = (req.query.targetType as string) || undefined;
    const adminId    = (req.query.adminId    as string) || undefined;
    const category   = (req.query.category  as string) || undefined;
    const search     = (req.query.search    as string) || undefined;
    const dateFrom   = (req.query.dateFrom  as string) || undefined;
    const dateTo     = (req.query.dateTo    as string) || undefined;

    const where: Record<string, any> = {};

    if (action)     where.action     = action;
    if (targetType) where.targetType = targetType;
    if (adminId)    where.adminId    = adminId;

    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom && { gte: new Date(dateFrom + 'T00:00:00.000Z') }),
        ...(dateTo   && { lte: new Date(dateTo   + 'T23:59:59.999Z') }),
      };
    }

    if (search) {
      where.OR = [
        { action:     { contains: search, mode: 'insensitive' } },
        { targetType: { contains: search, mode: 'insensitive' } },
        { targetId:   { contains: search, mode: 'insensitive' } },
        { adminName:  { contains: search, mode: 'insensitive' } },
        { meta:       { contains: search, mode: 'insensitive' } },
      ];
    }

    // Category filter — filter by derived category
    // Since category is computed from action, we use a contains filter on common patterns
    if (category) {
      const patterns: Record<string, string[]> = {
        CREATE:  ['CREAT', 'ADD', 'IMPORT', 'ACTIVATED'],
        UPDATE:  ['UPDAT', 'EDIT', 'CORRECT', 'RESET', 'ASSIGN', '_SET'],
        DELETE:  ['DELET', 'REMOV', 'REVERT', 'CLEAR', 'DEACTIVAT', 'UNASSIGN'],
        APPROVE: ['APPROV'],
        REJECT:  ['REJECT', 'ABSENT'],
        SYSTEM:  ['EMAIL', 'CRON', 'SYSTEM', 'BACKUP'],
      };
      const terms = patterns[category] ?? [];
      if (terms.length) {
        where.OR = [
          ...(where.OR ?? []),
          ...terms.map((t) => ({ action: { contains: t, mode: 'insensitive' } })),
        ];
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Enrich: resolve admin names for old records that don't have adminName stored
    const unresolvedIds = [...new Set(
      logs
        .filter((l) => !l.adminName && l.adminId !== 'SYSTEM' && l.adminId !== 'CRON')
        .map((l) => l.adminId)
    )];
    const resolvedMap = new Map<string, string>();
    if (unresolvedIds.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: unresolvedIds } },
        select: { id: true, email: true, employee: { select: { fullName: true } } },
      });
      for (const u of users) {
        resolvedMap.set(u.id, (u.employee as any)?.fullName ?? u.email);
      }
    }

    const enriched = logs.map((log) => {
      const adminName = log.adminName
        ?? (log.adminId === 'SYSTEM' || log.adminId === 'CRON' ? 'System / Automated' : resolvedMap.get(log.adminId) ?? 'Unknown');

      let parsedMeta: Record<string, any> | null = null;
      try { parsedMeta = log.meta ? JSON.parse(log.meta) : null; } catch { /* raw string */ }

      return {
        id:          log.id,
        adminId:     log.adminId,
        adminName,
        action:      log.action,
        category:    getActionCategory(log.action),
        targetType:  log.targetType,
        targetId:    log.targetId,
        description: parsedMeta?.description ?? null,
        meta:        parsedMeta,
        rawMeta:     log.meta,
        ipAddress:   log.ipAddress,
        createdAt:   log.createdAt,
      };
    });

    // ── Summary stats ──────────────────────────────────────────────────────
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);
    const weekStart  = new Date(); weekStart.setDate(weekStart.getDate() - 6); weekStart.setHours(0,0,0,0);

    const [todayCount, weekCount, distinctAdmins, actionBreakdown] = await Promise.all([
      prisma.auditLog.count({ where: { createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.auditLog.groupBy({ by: ['adminId'], _count: true, orderBy: { _count: { adminId: 'desc' } }, take: 5 }),
      prisma.auditLog.groupBy({ by: ['action'], _count: true, where: { createdAt: { gte: todayStart } }, orderBy: { _count: { action: 'desc' } }, take: 10 }),
    ]);

    // Resolve top admin names
    const topAdminIds = distinctAdmins.map((a) => a.adminId);
    const topAdminUsers = await prisma.user.findMany({
      where: { id: { in: topAdminIds } },
      select: { id: true, email: true, employee: { select: { fullName: true } } },
    });
    const topAdminMap = new Map(topAdminUsers.map((u) => [u.id, (u.employee as any)?.fullName ?? u.email]));

    return res.json({
      data: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        todayCount,
        weekCount,
        topAdmins: distinctAdmins.map((a) => ({
          adminId:   a.adminId,
          adminName: a.adminId === 'SYSTEM' || a.adminId === 'CRON' ? 'System' : (topAdminMap.get(a.adminId) ?? 'Unknown'),
          count:     a._count,
        })),
        todayActions: actionBreakdown.map((a) => ({
          action:   a.action,
          category: getActionCategory(a.action),
          count:    a._count,
        })),
      },
    });
  } catch (error) {
    logger.error('getSystemLogs error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/system-logs/admins ─────────────────────────────────────────
// Returns distinct admins who have log entries (for filter dropdown)
export const getLogAdmins = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    const groups = await prisma.auditLog.groupBy({
      by: ['adminId', 'adminName'],
      where: { adminId: { notIn: ['SYSTEM', 'CRON', 'AUTOMATED'] } },
      _count: true,
      orderBy: { _count: { adminId: 'desc' } },
    });

    const adminIds = [...new Set(groups.map((g) => g.adminId))];
    const users = await prisma.user.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, email: true, employee: { select: { fullName: true } } },
    });
    const userMap = new Map(users.map((u) => [u.id, { name: (u.employee as any)?.fullName ?? u.email, email: u.email }]));

    const admins = groups
      .reduce((acc: Record<string, any>, g) => {
        if (!acc[g.adminId]) {
          const u = userMap.get(g.adminId);
          acc[g.adminId] = {
            adminId:   g.adminId,
            adminName: g.adminName ?? u?.name ?? 'Unknown',
            email:     u?.email ?? null,
            count:     0,
          };
        }
        acc[g.adminId].count += g._count;
        return acc;
      }, {});

    return res.json(Object.values(admins));
  } catch (error) {
    logger.error('getLogAdmins error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
