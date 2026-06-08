-- Add onboardingCompleted flag to Employee
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
