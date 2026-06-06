-- Add unpaidDaysUsed to LeaveBalance for tracking total unpaid leave consumed
ALTER TABLE "LeaveBalance" ADD COLUMN IF NOT EXISTS "unpaidDaysUsed" FLOAT NOT NULL DEFAULT 0;

-- Add paidLeaveDays and unpaidLeaveDays to MonthlyReport for accurate reporting
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "paidLeaveDays" FLOAT NOT NULL DEFAULT 0;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "unpaidLeaveDays" FLOAT NOT NULL DEFAULT 0;
