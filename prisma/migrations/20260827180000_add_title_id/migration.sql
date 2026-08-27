-- Title ID manual para los ficheros cuyo nombre no lo lleva.
-- Sin el, la tienda no puede cruzar el juego con su titledb (sin caratula en
-- la consola) ni emparejar un complemento con su juego base.
ALTER TABLE "Game" ADD COLUMN "titleId" TEXT;
ALTER TABLE "GameDlc" ADD COLUMN "titleId" TEXT;
