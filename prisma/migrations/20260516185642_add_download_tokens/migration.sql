-- CreateTable
CREATE TABLE "DownloadToken" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "gameId" INTEGER NOT NULL,
    "dlcId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" BIGINT NOT NULL,
    "readyAt" BIGINT,
    "expiresAt" BIGINT
);

-- CreateIndex
CREATE INDEX "DownloadToken_status_idx" ON "DownloadToken"("status");
