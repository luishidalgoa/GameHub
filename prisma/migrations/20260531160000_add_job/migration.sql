-- Background job state for scan / auto-metadata (progress + auto-resume).
CREATE TABLE "Job" (
    "id"         INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type"       TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'running',
    "params"     TEXT,
    "phase"      TEXT,
    "total"      INTEGER NOT NULL DEFAULT 0,
    "processed"  INTEGER NOT NULL DEFAULT 0,
    "applied"    INTEGER NOT NULL DEFAULT 0,
    "skipped"    INTEGER NOT NULL DEFAULT 0,
    "failed"     INTEGER NOT NULL DEFAULT 0,
    "cursorId"   INTEGER,
    "lastTitle"  TEXT,
    "message"    TEXT,
    "startedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  DATETIME NOT NULL,
    "finishedAt" DATETIME
);
CREATE INDEX "Job_type_status_idx" ON "Job"("type", "status");
CREATE INDEX "Job_status_idx" ON "Job"("status");
