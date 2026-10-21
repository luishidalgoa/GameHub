-- Juegos que el dueno quiere destacar en la portada.
ALTER TABLE "Game" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;
