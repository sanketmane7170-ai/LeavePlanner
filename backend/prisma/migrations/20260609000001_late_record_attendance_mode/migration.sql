-- Add attendanceMode to OrgSettings
ALTER TABLE "OrgSettings" ADD COLUMN IF NOT EXISTS "attendanceMode" TEXT NOT NULL DEFAULT 'AUTO_PRESENT';

-- Create LateRecord table
CREATE TABLE IF NOT EXISTS "LateRecord" (
  "id"          TEXT NOT NULL,
  "employeeId"  TEXT NOT NULL,
  "date"        TIMESTAMP(3) NOT NULL,
  "lateMinutes" INTEGER NOT NULL DEFAULT 0,
  "note"        TEXT,
  "source"      TEXT NOT NULL DEFAULT 'MANUAL',
  "markedById"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LateRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LateRecord_employeeId_date_key" ON "LateRecord"("employeeId", "date");
CREATE INDEX IF NOT EXISTS "LateRecord_employeeId_idx" ON "LateRecord"("employeeId");
CREATE INDEX IF NOT EXISTS "LateRecord_date_idx" ON "LateRecord"("date");

ALTER TABLE "LateRecord" ADD CONSTRAINT "LateRecord_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
