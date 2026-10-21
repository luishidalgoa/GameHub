-- Indices segun las consultas de trafico y metricas (#93).
CREATE INDEX "DownloadLog_completed_idx" ON "DownloadLog"("completed");
CREATE INDEX "DownloadLog_client_idx" ON "DownloadLog"("client");
CREATE INDEX "RequestLog_path_idx" ON "RequestLog"("path");
