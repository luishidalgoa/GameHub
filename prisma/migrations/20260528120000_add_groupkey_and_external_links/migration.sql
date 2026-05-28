-- AlterTable
ALTER TABLE "Game" ADD COLUMN "externalLinks" TEXT;
ALTER TABLE "Game" ADD COLUMN "groupKey" TEXT;

-- CreateIndex
CREATE INDEX "Game_platformId_groupKey_idx" ON "Game"("platformId", "groupKey");
