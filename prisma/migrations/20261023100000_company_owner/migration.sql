-- Dueño de una editora: una sub-editora (sello, estudio) apunta a la editora que la agrupa (#143).
ALTER TABLE "Company" ADD COLUMN "parentId" INTEGER REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Company_parentId_idx" ON "Company"("parentId");
