-- CreateTable
CREATE TABLE "ExternalGame" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "platformId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "titleId" TEXT,
    "magnet" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "size" TEXT,
    "format" TEXT,
    "hasDlc" BOOLEAN NOT NULL DEFAULT false,
    "cover" TEXT,
    "year" INTEGER,
    "genre" TEXT,
    "developer" TEXT,
    "publisher" TEXT,
    "description" TEXT,
    "syncedAt" DATETIME NOT NULL,
    CONSTRAINT "ExternalGame_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalGame_source_sourceKey_key" ON "ExternalGame"("source", "sourceKey");

-- CreateIndex
CREATE INDEX "ExternalGame_platformId_titleId_idx" ON "ExternalGame"("platformId", "titleId");
