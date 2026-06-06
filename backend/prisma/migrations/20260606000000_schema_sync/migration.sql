-- Schema sync migration: adds all tables/columns/enums missing from initial migrations

-- ── Enum updates ───────────────────────────────────────────────────────────────
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'GENERAL';
ALTER TYPE "ProbationRule" ADD VALUE IF NOT EXISTS 'UNPAID_ALLOWED';
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "AnnouncementPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- ── User: add tokenVersion ─────────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- ── Employee: add missing columns ──────────────────────────────────────────────
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "birthday" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "canViewTeamCalendar" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "isOnNoticePeriod" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "noticePeriodStart" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "noticePeriodEnd" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "noticePeriodType" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "earlyReleaseDate" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "allowLeaveOverride" BOOLEAN NOT NULL DEFAULT false;

-- ── PolicyException: add allowedLeaveTypes ─────────────────────────────────────
ALTER TABLE "PolicyException" ADD COLUMN IF NOT EXISTS "allowedLeaveTypes" "LeaveType"[] NOT NULL DEFAULT '{}';

-- ── PolicyRule table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PolicyRule" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "operator" TEXT NOT NULL DEFAULT 'GTE',
    "minDays" DOUBLE PRECISION NOT NULL,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "noticeRequired" BOOLEAN NOT NULL DEFAULT false,
    "minNoticeDays" INTEGER NOT NULL DEFAULT 0,
    "exception" TEXT,
    "applicableLeaveTypes" "LeaveType"[] NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PolicyRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PolicyRule" ADD CONSTRAINT "PolicyRule_policyId_fkey"
    FOREIGN KEY ("policyId") REFERENCES "LeavePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE
    NOT DEFERRABLE INITIALLY IMMEDIATE;

-- ── WfhPolicyException table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "WfhPolicyException" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "overrideDays" DOUBLE PRECISION NOT NULL,
    "blackoutFrom" TIMESTAMP(3) NOT NULL,
    "blackoutTo" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WfhPolicyException_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WfhPolicyException" ADD CONSTRAINT "WfhPolicyException_policyId_fkey"
    FOREIGN KEY ("policyId") REFERENCES "WfhPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE
    NOT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "WfhPolicyException" ADD CONSTRAINT "WfhPolicyException_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
    NOT DEFERRABLE INITIALLY IMMEDIATE;

-- ── WfhPolicyRule table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "WfhPolicyRule" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "operator" TEXT NOT NULL DEFAULT 'GTE',
    "minDays" DOUBLE PRECISION NOT NULL,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "noticeRequired" BOOLEAN NOT NULL DEFAULT false,
    "minNoticeDays" INTEGER NOT NULL DEFAULT 0,
    "exception" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WfhPolicyRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WfhPolicyRule" ADD CONSTRAINT "WfhPolicyRule_policyId_fkey"
    FOREIGN KEY ("policyId") REFERENCES "WfhPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE
    NOT DEFERRABLE INITIALLY IMMEDIATE;

-- ── EmployeeRole table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EmployeeRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeRole_name_key" ON "EmployeeRole"("name");

-- ── LeaveBalance: add isArchived, archivedAt, update unique constraint ─────────
ALTER TABLE "LeaveBalance" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeaveBalance" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- Drop old unique index if it exists, add new one including isArchived
DROP INDEX IF EXISTS "LeaveBalance_employeeId_leaveType_year_key";
CREATE UNIQUE INDEX IF NOT EXISTS "LeaveBalance_employeeId_leaveType_year_isArchived_key"
    ON "LeaveBalance"("employeeId", "leaveType", "year", "isArchived");

-- ── MonthlyReport table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MonthlyReport" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "totalWorkingDays" INTEGER NOT NULL,
    "presentDays" DOUBLE PRECISION NOT NULL,
    "leaveDays" DOUBLE PRECISION NOT NULL,
    "absentDays" DOUBLE PRECISION NOT NULL,
    "wfhDays" DOUBLE PRECISION NOT NULL,
    "attendancePct" DOUBLE PRECISION NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonthlyReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyReport_employeeId_month_year_key"
    ON "MonthlyReport"("employeeId", "month", "year");
ALTER TABLE "MonthlyReport" ADD CONSTRAINT "MonthlyReport_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
    NOT DEFERRABLE INITIALLY IMMEDIATE;

-- ── AttendanceCorrection table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AttendanceCorrection" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "correctedStatus" TEXT NOT NULL,
    "originalStatus" TEXT NOT NULL,
    "reason" TEXT,
    "correctedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceCorrection_employeeId_date_key"
    ON "AttendanceCorrection"("employeeId", "date");
CREATE INDEX IF NOT EXISTS "AttendanceCorrection_employeeId_date_idx"
    ON "AttendanceCorrection"("employeeId", "date");
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
    NOT DEFERRABLE INITIALLY IMMEDIATE;

-- ── DataBackup table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DataBackup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL DEFAULT 'DAILY',
    "label" TEXT,
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "policyCount" INTEGER NOT NULL DEFAULT 0,
    "leaveCount" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" INTEGER,
    "data" JSONB NOT NULL,
    CONSTRAINT "DataBackup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DataBackup_type_createdAt_idx" ON "DataBackup"("type", "createdAt");

-- ── PasswordResetToken table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- ── SupportTicket table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SupportTicket" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT,
    "reason" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- ── Announcement table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" "AnnouncementPriority" NOT NULL DEFAULT 'MEDIUM',
    "scheduledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBirthday" BOOLEAN NOT NULL DEFAULT false,
    "targetEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- ── AnnouncementDismissal table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AnnouncementDismissal" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnouncementDismissal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementDismissal_announcementId_employeeId_key"
    ON "AnnouncementDismissal"("announcementId", "employeeId");
ALTER TABLE "AnnouncementDismissal" ADD CONSTRAINT "AnnouncementDismissal_announcementId_fkey"
    FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE
    NOT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "AnnouncementDismissal" ADD CONSTRAINT "AnnouncementDismissal_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
    NOT DEFERRABLE INITIALLY IMMEDIATE;

-- ── Missing indexes from schema ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "LeaveApplication_employeeId_status_idx" ON "LeaveApplication"("employeeId", "status");
CREATE INDEX IF NOT EXISTS "LeaveApplication_employeeId_fromDate_idx" ON "LeaveApplication"("employeeId", "fromDate");
CREATE INDEX IF NOT EXISTS "LeaveApplication_status_fromDate_idx" ON "LeaveApplication"("status", "fromDate");
CREATE INDEX IF NOT EXISTS "WfhApplication_employeeId_status_idx" ON "WfhApplication"("employeeId", "status");
CREATE INDEX IF NOT EXISTS "WfhApplication_employeeId_date_idx" ON "WfhApplication"("employeeId", "date");
CREATE INDEX IF NOT EXISTS "WfhApplication_status_date_idx" ON "WfhApplication"("status", "date");
CREATE INDEX IF NOT EXISTS "AbsentRecord_employeeId_date_idx" ON "AbsentRecord"("employeeId", "date");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_adminId_idx" ON "AuditLog"("adminId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_targetType_idx" ON "AuditLog"("targetType");
