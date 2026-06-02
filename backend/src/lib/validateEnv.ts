import { logger } from './logger';

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL'] as const;
const WEAK_SECRETS = ['supersecret_jwt_key_please_change', 'secret', 'password', '12345'];

export function validateEnv(): void {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    logger.error('Set these in your .env file. See .env.example for reference.');
    process.exit(1);
  }

  const secret = process.env.JWT_SECRET!;
  if (WEAK_SECRETS.includes(secret)) {
    logger.error('JWT_SECRET is set to a known weak/default value. Generate a secure secret before deploying.');
    logger.error('Run: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    process.exit(1);
  }
  if (secret.length < 32) {
    logger.error('JWT_SECRET must be at least 32 characters. Current length: ' + secret.length);
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      logger.warn('SMTP credentials not fully configured — emails will not be sent in production.');
    }
  }

  logger.info('Environment validation passed.');
}
