import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const DAILY_RETENTION = 30; // keep last 30 daily backups

export async function createBackup(type: 'DAILY' | 'MANUAL' = 'DAILY'): Promise<{
  id: string;
  sizeBytes: number;
  employeeCount: number;
  leaveCount: number;
  policyCount: number;
}> {
  const now = new Date();
  const year = now.getFullYear();
  const prevYear = year - 1;

  // Snapshot all critical tables in parallel
  const [employees, leavePolicies, wfhPolicies, leaveBalances, leaveApplications, wfhApplications, holidays] =
    await Promise.all([
      prisma.employee.findMany({
        include: {
          user: { select: { email: true, role: true } },
          leavePolicy: { select: { id: true, name: true, leaveType: true } },
          wfhPolicy:   { select: { id: true, name: true } },
        },
      }),
      prisma.leavePolicy.findMany({
        include: {
          rules:      true,
          exceptions: { include: { employee: { select: { id: true, employeeId: true, fullName: true } } } },
        },
      }),
      prisma.wfhPolicy.findMany({
        include: {
          rules:      true,
          exceptions: { include: { employee: { select: { id: true, employeeId: true, fullName: true } } } },
        },
      }),
      // Active balances for this year and last year
      prisma.leaveBalance.findMany({
        where: { year: { gte: prevYear }, isArchived: false },
      }),
      // Leave applications from previous year onwards (capped to bound JSON blob size)
      prisma.leaveApplication.findMany({
        where: { fromDate: { gte: new Date(`${prevYear}-01-01`) } },
        orderBy: { createdAt: 'desc' },
        take: 10000,
      }),
      prisma.wfhApplication.findMany({
        where: { date: { gte: new Date(`${prevYear}-01-01`) } },
        orderBy: { createdAt: 'desc' },
        take: 10000,
      }),
      prisma.publicHoliday.findMany({ orderBy: { date: 'asc' } }),
    ]);

  const snapshot = {
    capturedAt:        now.toISOString(),
    version:           '1',
    employees,
    leavePolicies,
    wfhPolicies,
    leaveBalances,
    leaveApplications,
    wfhApplications,
    holidays,
  };

  const json      = JSON.stringify(snapshot);
  const sizeBytes = Buffer.byteLength(json, 'utf8');
  const label     = type === 'DAILY'
    ? `Daily backup — ${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : `Manual backup — ${now.toLocaleString('en-IN')}`;

  const record = await prisma.dataBackup.create({
    data: {
      type,
      label,
      employeeCount: employees.length,
      policyCount:   leavePolicies.length,
      leaveCount:    leaveApplications.length,
      sizeBytes,
      data:          snapshot as any,
    },
  });

  // Prune old daily backups — keep only the most recent DAILY_RETENTION
  if (type === 'DAILY') {
    const toDelete = await prisma.dataBackup.findMany({
      where:   { type: 'DAILY' },
      orderBy: { createdAt: 'desc' },
      skip:    DAILY_RETENTION,
      select:  { id: true },
    });
    if (toDelete.length > 0) {
      await prisma.dataBackup.deleteMany({
        where: { id: { in: toDelete.map((b) => b.id) } },
      });
      logger.info(`[backup] Pruned ${toDelete.length} old daily backup(s).`);
    }
  }

  logger.info(
    `[backup] ${type} backup created — id=${record.id}, ` +
    `${employees.length} employees, ${leaveApplications.length} leave apps, ` +
    `${(sizeBytes / 1024).toFixed(1)} KB.`
  );

  return {
    id:            record.id,
    sizeBytes,
    employeeCount: employees.length,
    leaveCount:    leaveApplications.length,
    policyCount:   leavePolicies.length,
  };
}
