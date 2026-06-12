-- AlterTable: add detected languages to a game (CSV of ISO-639-1 codes)
ALTER TABLE "Game" ADD COLUMN "languages" TEXT;

-- AlterTable: region/languages for region-variant editions stored as GameDlc
-- rows (type = 'region'). Nullable; ignored for dlc/update/mod rows.
ALTER TABLE "GameDlc" ADD COLUMN "region" TEXT;
ALTER TABLE "GameDlc" ADD COLUMN "languages" TEXT;
