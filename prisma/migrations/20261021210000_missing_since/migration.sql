-- #111: la ausencia de un fichero se guarda aparte del ocultado a mano (userHidden).
ALTER TABLE "Game" ADD COLUMN "missingSince" DATETIME;
