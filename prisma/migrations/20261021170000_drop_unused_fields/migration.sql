-- Campos que nada lee ni escribe de forma util (#97). Ninguno tiene indice ni
-- restriccion, por lo que SQLite puede quitarlos sin reconstruir la tabla.
ALTER TABLE "Game" DROP COLUMN "igdbId";
ALTER TABLE "Game" DROP COLUMN "lastPlayedAt";
ALTER TABLE "Game" DROP COLUMN "playCount";
ALTER TABLE "Game" DROP COLUMN "rawgRatingsCount";
ALTER TABLE "RequestLog" DROP COLUMN "referer";
