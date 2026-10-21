-- Editoras, desarrolladoras y generos canonicos (el texto de Game se conserva).
CREATE TABLE "Company" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Company_key_key" ON "Company"("key");

CREATE TABLE "Genre" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL
);
CREATE UNIQUE INDEX "Genre_key_key" ON "Genre"("key");

CREATE TABLE "GameGenre" (
    "gameId" INTEGER NOT NULL,
    "genreId" INTEGER NOT NULL,
    PRIMARY KEY ("gameId", "genreId"),
    CONSTRAINT "GameGenre_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameGenre_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "GameGenre_genreId_idx" ON "GameGenre"("genreId");

ALTER TABLE "Game" ADD COLUMN "developerCompanyId" INTEGER REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Game" ADD COLUMN "publisherCompanyId" INTEGER REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
