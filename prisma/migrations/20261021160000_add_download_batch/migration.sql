-- Lote de descargas: los tokens de un mismo lote comparten batchId, así el servidor
-- sabe qué archivos forman el lote y el cliente solo necesita ese id.
ALTER TABLE "DownloadToken" ADD COLUMN "batchId" TEXT;
CREATE INDEX "DownloadToken_batchId_idx" ON "DownloadToken"("batchId");
