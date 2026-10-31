-- AlterTable
ALTER TABLE "Game" ADD COLUMN "variantOfId" INTEGER REFERENCES "Game" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Game_variantOfId_idx" ON "Game"("variantOfId");
