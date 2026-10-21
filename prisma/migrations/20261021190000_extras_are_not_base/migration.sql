-- Un fichero base nunca es un extra: las filas que lo guardaban como 'base' eran
-- otras ediciones del mismo juego (#78). Las 6 filas de produccion pasan a 'region'.
UPDATE "GameDlc" SET "type" = 'region' WHERE "type" = 'base';
