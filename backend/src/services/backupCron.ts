import cron from 'node-cron';
import { createBackup } from './backupService';
import { logger } from '../lib/logger';

export function startBackupCron(): void {
  // Runs every day at 02:00 AM IST
  cron.schedule(
    '0 2 * * *',
    async () => {
      logger.info('[backup-cron] Daily backup starting…');
      try {
        const result = await createBackup('DAILY');
        logger.info(
          `[backup-cron] Done — id=${result.id}, ` +
          `${result.employeeCount} employees, ${result.leaveCount} leaves, ` +
          `${(result.sizeBytes / 1024).toFixed(1)} KB.`
        );
      } catch (err) {
        logger.error('[backup-cron] Backup failed:', err);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  logger.info('[backup-cron] Scheduled daily at 02:00 AM IST.');
}
