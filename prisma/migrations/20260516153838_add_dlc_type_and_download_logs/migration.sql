-- CreateTable
CREATE TABLE "DownloadLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gameId" INTEGER NOT NULL,
    "dlcId" INTEGER,
    "dlcType" TEXT,
    "ip" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DownloadLog_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GameDlc" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gameId" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "title" TEXT,
    "type" TEXT NOT NULL DEFAULT 'dlc',
    CONSTRAINT "GameDlc_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GameDlc" ("fileName", "filePath", "fileSize", "gameId", "id", "title") SELECT "fileName", "filePath", "fileSize", "gameId", "id", "title" FROM "GameDlc";
DROP TABLE "GameDlc";
ALTER TABLE "new_GameDlc" RENAME TO "GameDlc";
CREATE UNIQUE INDEX "GameDlc_filePath_key" ON "GameDlc"("filePath");
CREATE INDEX "GameDlc_gameId_idx" ON "GameDlc"("gameId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DownloadLog_gameId_idx" ON "DownloadLog"("gameId");

-- CreateIndex
CREATE INDEX "DownloadLog_startedAt_idx" ON "DownloadLog"("startedAt");

-- CreateIndex
CREATE INDEX "DownloadLog_ip_idx" ON "DownloadLog"("ip");
