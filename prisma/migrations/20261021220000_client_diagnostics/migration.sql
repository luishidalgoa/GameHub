-- #91: fallos que GameHubNX comunica al servidor.
CREATE TABLE "ClientDiagnostic" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientVersion" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "device" TEXT
);
CREATE INDEX "ClientDiagnostic_createdAt_idx" ON "ClientDiagnostic"("createdAt");
