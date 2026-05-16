-- CreateTable
CREATE TABLE "Platform" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scanPath" TEXT NOT NULL,
    "extensions" TEXT NOT NULL,
    "iconPath" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "platformId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sortTitle" TEXT,
    "region" TEXT,
    "releaseYear" INTEGER,
    "genre" TEXT,
    "developer" TEXT,
    "publisher" TEXT,
    "coverPath" TEXT,
    "coverUrl" TEXT,
    "trailerUrl" TEXT,
    "screenshotPaths" TEXT,
    "description" TEXT,
    "customNotes" TEXT,
    "igdbId" INTEGER,
    "rawgId" INTEGER,
    "rawgSlug" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" DATETIME,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataFetchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Game_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameDlc" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gameId" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "title" TEXT,
    CONSTRAINT "GameDlc_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ScanLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "gamesFound" INTEGER NOT NULL DEFAULT 0,
    "gamesAdded" INTEGER NOT NULL DEFAULT 0,
    "gamesUpdated" INTEGER NOT NULL DEFAULT 0,
    "gamesStale" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,
    "triggeredBy" TEXT NOT NULL DEFAULT 'manual'
);

-- CreateIndex
CREATE UNIQUE INDEX "Platform_slug_key" ON "Platform"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Game_filePath_key" ON "Game"("filePath");

-- CreateIndex
CREATE INDEX "Game_platformId_idx" ON "Game"("platformId");

-- CreateIndex
CREATE INDEX "Game_title_idx" ON "Game"("title");

-- CreateIndex
CREATE INDEX "Game_isFavorite_idx" ON "Game"("isFavorite");

-- CreateIndex
CREATE INDEX "Game_lastSeenAt_idx" ON "Game"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameDlc_filePath_key" ON "GameDlc"("filePath");

-- CreateIndex
CREATE INDEX "GameDlc_gameId_idx" ON "GameDlc"("gameId");
