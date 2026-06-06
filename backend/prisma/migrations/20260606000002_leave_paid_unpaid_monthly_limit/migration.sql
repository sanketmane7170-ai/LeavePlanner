-- LeaveApplication: paid/unpaid split columns
ALTER TABLE "LeaveApplication" ADD COLUMN IF NOT EXISTS "paidDays" FLOAT;
ALTER TABLE "LeaveApplication" ADD COLUMN IF NOT EXISTS "unpaidDays" FLOAT;

-- OrgSettings: monthly leave hard limit
ALTER TABLE "OrgSettings" ADD COLUMN IF NOT EXISTS "monthlyLeaveLimitEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrgSettings" ADD COLUMN IF NOT EXISTS "monthlyLeaveLimit" FLOAT;
