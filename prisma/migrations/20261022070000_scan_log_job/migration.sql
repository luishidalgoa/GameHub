-- Enlaza cada escaneo con el job que lo ejecuto, para leer su log persistente (#139).
ALTER TABLE "ScanLog" ADD COLUMN "jobId" INTEGER;
