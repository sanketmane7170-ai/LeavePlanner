-- Add probationRule column to WfhPolicy (was missing from earlier migrations)
ALTER TABLE "WfhPolicy" ADD COLUMN IF NOT EXISTS "probationRule" "ProbationRule" NOT NULL DEFAULT 'NONE';
