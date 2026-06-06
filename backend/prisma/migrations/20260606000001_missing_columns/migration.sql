-- LeaveApplication: add isUnpaid and noticeViolation columns
ALTER TABLE "LeaveApplication" ADD COLUMN IF NOT EXISTS "isUnpaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeaveApplication" ADD COLUMN IF NOT EXISTS "noticeViolation" BOOLEAN NOT NULL DEFAULT false;
