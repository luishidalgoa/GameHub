ALTER TABLE "Game" ADD COLUMN "userHidden" BOOLEAN NOT NULL DEFAULT false;
-- Conservador: lo que ya está oculto hoy se queda oculto tras el primer escaneo.
UPDATE "Game" SET "userHidden" = 1 WHERE "isHidden" = 1;
