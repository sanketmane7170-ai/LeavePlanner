-- Check-In/Check-Out Module

-- OrgSettings: add check-in configuration columns
ALTER TABLE "OrgSettings"
  ADD COLUMN IF NOT EXISTS "checkInEnabled"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "checkInCodeTime"   TEXT    NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS "checkInStartTime"  TEXT    NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS "checkInDeadline"   TEXT    NOT NULL DEFAULT '10:30',
  ADD COLUMN IF NOT EXISTS "checkOutExpected"  TEXT    NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS "checkInWindowEnd"  TEXT    NOT NULL DEFAULT '13:00';

-- CheckInStatus enum
DO $$ BEGIN
  CREATE TYPE "CheckInStatus" AS ENUM (
    'NOT_CHECKED_IN','CHECKED_IN','CHECKED_OUT','ABSENT','ON_LEAVE','ON_WFH'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- DailyCheckInCode: one row per calendar date
CREATE TABLE IF NOT EXISTS "DailyCheckInCode" (
  "id"        TEXT        NOT NULL,
  "code"      TEXT        NOT NULL,
  "date"      TEXT        NOT NULL,   -- YYYY-MM-DD
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyCheckInCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyCheckInCode_date_key" ON "DailyCheckInCode"("date");
CREATE INDEX IF NOT EXISTS "DailyCheckInCode_date_idx" ON "DailyCheckInCode"("date");

-- CheckInRecord: one row per employee per calendar date
CREATE TABLE IF NOT EXISTS "CheckInRecord" (
  "id"              TEXT             NOT NULL,
  "employeeId"      TEXT             NOT NULL,
  "date"            TEXT             NOT NULL,   -- YYYY-MM-DD
  "checkInTime"     TIMESTAMP(3),
  "checkOutTime"    TIMESTAMP(3),
  "checkInLat"      DOUBLE PRECISION,
  "checkInLng"      DOUBLE PRECISION,
  "checkInAddress"  TEXT,
  "checkOutLat"     DOUBLE PRECISION,
  "checkOutLng"     DOUBLE PRECISION,
  "checkOutAddress" TEXT,
  "checkInIp"       TEXT,
  "checkOutIp"      TEXT,
  "isLate"          BOOLEAN          NOT NULL DEFAULT false,
  "lateMinutes"     INTEGER,
  "earlyCheckout"   BOOLEAN          NOT NULL DEFAULT false,
  "earlyMinutes"    INTEGER,
  "workingHours"    DOUBLE PRECISION,
  "status"          "CheckInStatus"  NOT NULL DEFAULT 'NOT_CHECKED_IN',
  "adminOverride"   BOOLEAN          NOT NULL DEFAULT false,
  "adminNote"       TEXT,
  "createdAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "CheckInRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CheckInRecord_employeeId_date_key" ON "CheckInRecord"("employeeId","date");
CREATE INDEX IF NOT EXISTS "CheckInRecord_date_idx"       ON "CheckInRecord"("date");
CREATE INDEX IF NOT EXISTS "CheckInRecord_employeeId_idx" ON "CheckInRecord"("employeeId");
CREATE INDEX IF NOT EXISTS "CheckInRecord_status_idx"     ON "CheckInRecord"("status");
ALTER TABLE "CheckInRecord"
  ADD CONSTRAINT "CheckInRecord_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
