import 'dotenv/config';
import { validateEnv } from './lib/validateEnv';
validateEnv(); // exit-fast if config is invalid — must run before anything else

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import authRoutes from './routes/auth';
import employeeRoutes from './routes/employees';
import policyRoutes from './routes/policies';
import scheduleRoutes from './routes/schedules';
import leaveRoutes from './routes/leaves';
import adminLeaveRoutes from './routes/adminLeaves';
import employeeWfhRoutes from './routes/employeeWfh';
import adminWfhRoutes from './routes/adminWfh';
import dashboardRoutes from './routes/dashboard';
import settingsRoutes from './routes/settings';
import employeePortalRoutes from './routes/employeePortal';
import notificationRoutes from './routes/notifications';
import teamCalendarRoutes from './routes/teamCalendar';
import adminsRoutes from './routes/admins';
import supportRoutes from './routes/support';
import adminSupportRoutes from './routes/adminSupport';
import announcementRoutes from './routes/announcements';
import attendanceRoutes from './routes/attendance';
import systemLogsRoutes from './routes/systemLogs';
import analyticsRoutes from './routes/analytics';
import adminCheckinRoutes   from './routes/adminCheckin';
import employeeCheckinRoutes from './routes/employeeCheckin';
import swapDayRoutes    from './routes/swapDay';
import lateRecordRoutes from './routes/lateRecord';
import { startAbsentCron } from './services/absentCron';
import { startBackupCron } from './services/backupCron';
import { startMonthlyCron } from './services/monthlyCron';
import { startAnnouncementCron } from './services/announcementCron';
import { startNoticePeriodCron }  from './services/noticePeriodCron';
import { startYearStartCron }     from './services/yearStartCron';
import { startProbationCron }     from './services/probationCron';
import { startYearEndWarnCron }   from './services/yearEndWarnCron';
import { startHolidayReminderCron } from './services/holidayReminderCron';
import { startWfhReminderCron }   from './services/wfhReminderCron';
import { startMaintenanceCron }   from './services/maintenanceCron';
import { startCheckInCrons }             from './services/checkinCron';
import { startWeeklyAttendanceEmailCron } from './services/weeklyAttendanceEmailCron';
import { startSwapDayCron } from './services/swapDayCron';
import { seedEmailTemplates } from './services/emailTemplateSeed';

const app = express();
const PORT = process.env.PORT ?? 3001;
const isProd = process.env.NODE_ENV === 'production';

// Behind nginx reverse proxy: trust the first proxy hop so secure cookies,
// req.ip, and rate-limiting see the real client IP (not nginx's).
if (isProd) app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-site' },
  contentSecurityPolicy: isProd ? undefined : false,
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigin = process.env.FRONTEND_URL!;
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin.startsWith('http://localhost:')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// ── Request parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ── HTTP request logging ──────────────────────────────────────────────────────
app.use(morgan(isProd ? 'combined' : 'dev', {
  stream: { write: (msg) => logger.http(msg.trimEnd()) },
  skip: (req) => req.url === '/health',
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.url === '/health',
});

app.use('/api/auth/login', loginLimiter);
app.use('/api', apiLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',             authRoutes);
app.use('/api/admin/employees',  employeeRoutes);
app.use('/api/admin/policies',   policyRoutes);
app.use('/api/admin/schedules',  scheduleRoutes);
app.use('/api/employee/leaves',  leaveRoutes);
app.use('/api/admin/leaves',     adminLeaveRoutes);
app.use('/api/employee/wfh',     employeeWfhRoutes);
app.use('/api/admin/wfh',        adminWfhRoutes);
app.use('/api/admin/dashboard',  dashboardRoutes);
app.use('/api/admin/settings',   settingsRoutes);
app.use('/api/admin/admins',     adminsRoutes);
app.use('/api/admin/support',    adminSupportRoutes);
app.use('/api/admin/announcements', announcementRoutes);
app.use('/api/admin/attendance',   attendanceRoutes);
app.use('/api/admin/system-logs',  systemLogsRoutes);
app.use('/api/admin/reports',      analyticsRoutes);
app.use('/api/admin/checkin',      adminCheckinRoutes);
app.use('/api/employee/checkin',   employeeCheckinRoutes);
app.use('/api/admin/swap-days',    swapDayRoutes);
app.use('/api/admin/late-records', lateRecordRoutes);
app.use('/api/support',          supportRoutes);
app.use('/api/employee/portal',  employeePortalRoutes);
app.use('/api/notifications',    notificationRoutes);
app.use('/api/team-calendar',    teamCalendarRoutes);

// ── Health check (DB ping included) ──────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status ?? err.statusCode ?? 500;
  logger.error({ message: err.message, stack: err.stack, status });
  res.status(status).json({ message: isProd ? 'Something went wrong.' : (err.message ?? 'Internal server error') });
});

// ── Server ────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV ?? 'development'}]`);
  startAbsentCron();
  startBackupCron();
  startMonthlyCron();
  startAnnouncementCron();
  startNoticePeriodCron();
  startYearStartCron();
  startProbationCron();
  startYearEndWarnCron();
  startHolidayReminderCron();
  startWfhReminderCron();
  startMaintenanceCron();
  startCheckInCrons();
  startWeeklyAttendanceEmailCron();
  startSwapDayCron();
  seedEmailTemplates().catch((e) => logger.error('[emailTemplateSeed]', e));
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('DB disconnected, server closed');
    process.exit(0);
  });
  setTimeout(() => { logger.error('Forced shutdown after timeout'); process.exit(1); }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
});
