-- Fecha de modificacion del fichero: el escaner compara tamano y fecha (#136).
ALTER TABLE "Game" ADD COLUMN "fileMtime" DATETIME;
ALTER TABLE "GameDlc" ADD COLUMN "fileMtime" DATETIME;
