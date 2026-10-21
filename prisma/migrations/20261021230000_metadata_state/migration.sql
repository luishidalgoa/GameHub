-- #110: estado de metadatos por juego en lugar de solo el sello de fecha.
ALTER TABLE "Game" ADD COLUMN "metadataStatus" TEXT;
ALTER TABLE "Game" ADD COLUMN "metadataAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Game" ADD COLUMN "metadataNextRetryAt" DATETIME;
