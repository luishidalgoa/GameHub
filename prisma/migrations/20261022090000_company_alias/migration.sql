-- Alias de editora: una clave que ahora significa otra editora (#143).
CREATE TABLE "CompanyAlias" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "companyId" INTEGER NOT NULL,
    CONSTRAINT "CompanyAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CompanyAlias_companyId_idx" ON "CompanyAlias"("companyId");
