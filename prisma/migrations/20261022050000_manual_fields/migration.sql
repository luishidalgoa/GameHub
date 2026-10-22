-- Campos que el dueno fijo a mano: los procesos automaticos no los reemplazan.
ALTER TABLE "Game" ADD COLUMN "manualFields" TEXT;
