-- Identifica el origen de cada descarga. Nullable a proposito: las filas
-- historicas no tienen forma de saberlo y NULL las distingue de las nuevas.
ALTER TABLE "DownloadLog" ADD COLUMN "client" TEXT;
ALTER TABLE "DownloadLog" ADD COLUMN "clientVersion" TEXT;
