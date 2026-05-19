-- Add per-platform breakdown JSON column to ScanLog
ALTER TABLE "ScanLog" ADD COLUMN "platformBreakdown" TEXT;
