-- #75: campos de propiedad y latido de los jobs, y como mucho un job "running" por tipo.
ALTER TABLE "Job" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Job" ADD COLUMN "heartbeatAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "cancelRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN "parentId" INTEGER;

-- Un job "running" que quedo colgado sin mas: si hay varios del mismo tipo, se
-- conserva el mas nuevo y los demas pasan a failed antes de crear el indice.
UPDATE "Job" SET "status" = 'failed', "message" = COALESCE("message", 'interrumpido antes de la migracion 20261021240000'), "finishedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'running' AND "id" NOT IN (SELECT MAX("id") FROM "Job" WHERE "status" = 'running' GROUP BY "type");

CREATE UNIQUE INDEX "Job_one_running_per_type" ON "Job"("type") WHERE "status" = 'running';
