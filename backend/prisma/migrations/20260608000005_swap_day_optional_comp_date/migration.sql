-- Make compensationDate and deadline nullable on SwapDay
ALTER TABLE "SwapDay" ALTER COLUMN "compensationDate" DROP NOT NULL;
ALTER TABLE "SwapDay" ALTER COLUMN "deadline" DROP NOT NULL;
