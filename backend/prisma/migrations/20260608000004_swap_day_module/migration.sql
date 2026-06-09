-- CreateEnum
CREATE TYPE "SwapDayStatus" AS ENUM ('PENDING_COMPENSATION', 'COMPENSATED', 'DEFAULTED');

-- CreateTable
CREATE TABLE "SwapDay" (
    "id"               TEXT NOT NULL,
    "employeeId"       TEXT NOT NULL,
    "absentDate"       TIMESTAMP(3) NOT NULL,
    "compensationDate" TIMESTAMP(3) NOT NULL,
    "deadline"         TIMESTAMP(3) NOT NULL,
    "status"           "SwapDayStatus" NOT NULL DEFAULT 'PENDING_COMPENSATION',
    "absentMarked"     BOOLEAN NOT NULL DEFAULT false,
    "absentRecordId"   TEXT,
    "note"             TEXT,
    "createdById"      TEXT NOT NULL,
    "resolvedById"     TEXT,
    "resolvedAt"       TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwapDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SwapDay_employeeId_status_idx" ON "SwapDay"("employeeId", "status");

-- CreateIndex
CREATE INDEX "SwapDay_status_deadline_idx" ON "SwapDay"("status", "deadline");

-- CreateIndex
CREATE INDEX "SwapDay_compensationDate_idx" ON "SwapDay"("compensationDate");

-- AddForeignKey
ALTER TABLE "SwapDay" ADD CONSTRAINT "SwapDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
