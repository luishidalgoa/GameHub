-- Quitar una imagen manual la deja restaurable un rato antes de borrarla (#142).
ALTER TABLE "GameImage" ADD COLUMN "removedAt" DATETIME;
ALTER TABLE "GameImage" ADD COLUMN "palette" TEXT;
