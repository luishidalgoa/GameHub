-- CreateTable
CREATE TABLE "RequestLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "status" INTEGER NOT NULL DEFAULT 200,
    "userAgent" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "referer" TEXT,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SearchLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "query" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "results" INTEGER NOT NULL DEFAULT 0,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IpCache" (
    "ip" TEXT NOT NULL PRIMARY KEY,
    "country" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "isp" TEXT,
    "flagEmoji" TEXT,
    "cachedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "RequestLog_ts_idx" ON "RequestLog"("ts");

-- CreateIndex
CREATE INDEX "RequestLog_ip_idx" ON "RequestLog"("ip");

-- CreateIndex
CREATE INDEX "RequestLog_status_idx" ON "RequestLog"("status");

-- CreateIndex
CREATE INDEX "RequestLog_device_idx" ON "RequestLog"("device");

-- CreateIndex
CREATE INDEX "SearchLog_ts_idx" ON "SearchLog"("ts");

-- CreateIndex
CREATE INDEX "SearchLog_query_idx" ON "SearchLog"("query");
