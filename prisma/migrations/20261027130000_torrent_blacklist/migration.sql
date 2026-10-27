-- CreateTable
CREATE TABLE "TorrentBlacklist" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "platformId" INTEGER NOT NULL,
    "identity" TEXT NOT NULL,
    "source" TEXT,
    "sourceKey" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'oculto',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TorrentBlacklist_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TorrentBlacklist_platformId_identity_key" ON "TorrentBlacklist"("platformId", "identity");
