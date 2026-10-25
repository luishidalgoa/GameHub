-- AlterTable
ALTER TABLE "Game" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'local';
ALTER TABLE "Game" ADD COLUMN "externalKey" TEXT;
ALTER TABLE "Game" ADD COLUMN "releaseDate" DATETIME;

-- AlterTable
ALTER TABLE "ExternalGame" ADD COLUMN "gameId" INTEGER REFERENCES "Game" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "Game_externalKey_key" ON "Game"("externalKey");
