-- CreateTable
CREATE TABLE "Donation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "platform" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "note" TEXT,
    "fromName" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Donation_externalId_key" ON "Donation"("externalId");

-- CreateIndex
CREATE INDEX "Donation_receivedAt_idx" ON "Donation"("receivedAt");

-- CreateIndex
CREATE INDEX "Donation_platform_idx" ON "Donation"("platform");
