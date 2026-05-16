-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Platform" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scanPath" TEXT NOT NULL,
    "extensions" TEXT NOT NULL,
    "iconPath" TEXT,
    "scanMode" TEXT NOT NULL DEFAULT 'flat',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Platform" ("createdAt", "enabled", "extensions", "iconPath", "id", "name", "scanPath", "slug", "sortOrder", "updatedAt") SELECT "createdAt", "enabled", "extensions", "iconPath", "id", "name", "scanPath", "slug", "sortOrder", "updatedAt" FROM "Platform";
DROP TABLE "Platform";
ALTER TABLE "new_Platform" RENAME TO "Platform";
CREATE UNIQUE INDEX "Platform_slug_key" ON "Platform"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
