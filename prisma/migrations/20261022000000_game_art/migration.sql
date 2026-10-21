-- Arte de portada/fondo por juego: fondo elegido de LaunchBox, logo y paleta.
ALTER TABLE "Game" ADD COLUMN "backdropPath" TEXT;
ALTER TABLE "Game" ADD COLUMN "backdropKind" TEXT;
ALTER TABLE "Game" ADD COLUMN "tilePath" TEXT;
ALTER TABLE "Game" ADD COLUMN "logoPath" TEXT;
ALTER TABLE "Game" ADD COLUMN "themePalette" TEXT;
ALTER TABLE "Game" ADD COLUMN "artCheckedAt" DATETIME;
