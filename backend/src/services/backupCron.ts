import cron from 'node-cron';
import { createBackup } from './backupService';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

export function startBackupCron(): void {
  // Runs every day at 02:00 AM IST
  cron.schedule(
    '0 2 * * *',
    async () => {
      logger.info('[backup-cron] Daily backup starting…');
      try {
        await prisma.auditLog.create({
          data: {
            adminId: 'CRON',
            action: 'CRON_BACKUP_START',
            targetType: 'CRON',
            targetId: 'BACKUP',
            meta: 'Daily database backup started',
          },
        }).catch((e) => console.error('Failed to log backup start:', e));

        const result = await createBackup('DAILY');
        logger.info(
          `[backup-cron] Done — id=${result.id}, ` +
          `${result.employeeCount} employees, ${result.leaveCount} leaves, ` +
          `${(result.sizeBytes / 1024).toFixed(1)} KB.`
        );

        // Housekeeping: purge expired password-reset tokens so they don't accumulate
        const purged = await prisma.passwordResetToken.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
        if (purged.count > 0) {
          logger.info(`[backup-cron] Purged ${purged.count} expired password-reset token(s).`);
        }

        await prisma.auditLog.create({
          data: {
            adminId: 'CRON',
            action: 'CRON_BACKUP_SUCCESS',
            targetType: 'CRON',
            targetId: 'BACKUP',
            meta: JSON.stringify({
              backupId: result.id,
              employeeCount: result.employeeCount,
              leaveCount: result.leaveCount,
              sizeBytes: result.sizeBytes,
            }),
          },
        }).catch((e) => console.error('Failed to log backup success:', e));
      } catch (err: any) {
        logger.error('[backup-cron] Backup failed:', err);
        await prisma.auditLog.create({
          data: {
            adminId: 'CRON',
            action: 'CRON_BACKUP_FAILED',
            targetType: 'CRON',
            targetId: 'BACKUP',
            meta: err?.message || String(err),
          },
        }).catch((e) => console.error('Failed to log backup failure:', e));
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  logger.info('[backup-cron] Scheduled daily at 02:00 AM IST.');
}
