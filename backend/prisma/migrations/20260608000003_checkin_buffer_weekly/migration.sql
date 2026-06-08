-- Add buffer minutes and weekly email flag to OrgSettings
ALTER TABLE "OrgSettings"
  ADD COLUMN IF NOT EXISTS "checkInBufferMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "weeklyEmailEnabled"   BOOLEAN NOT NULL DEFAULT false;
