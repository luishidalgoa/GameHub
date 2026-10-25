-- AlterTable
ALTER TABLE "ExternalGame" ADD COLUMN "titleKey" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "ExternalGame_platformId_titleKey_idx" ON "ExternalGame"("platformId", "titleKey");
