-- Repositorio de imagenes por juego (LaunchBox) y estado del arte de cada juego.
ALTER TABLE "Game" ADD COLUMN "artStatus" TEXT;

CREATE TABLE "GameImage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gameId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "region" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "s3Key" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameImage_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GameImage_gameId_sourceUrl_key" ON "GameImage"("gameId", "sourceUrl");
CREATE INDEX "GameImage_gameId_kind_idx" ON "GameImage"("gameId", "kind");
