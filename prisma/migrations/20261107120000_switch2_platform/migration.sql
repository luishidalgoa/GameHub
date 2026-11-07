-- Plataforma Nintendo Switch 2. Sus juegos salen de la misma lista que Switch 1: las entradas con
-- la etiqueta [NUP] en el título son de Switch 2. Switch 1 deja de tomarlas (exceptTag) y Switch 2
-- solo toma esas (onlyTag). Las filas torrent con la clave antigua se reconcilian en el siguiente sync.

-- Plataforma nueva. scanPath vacío: la carpeta de Switch 2 se pone después en admin.
INSERT INTO "Platform" ("slug", "name", "scanPath", "extensions", "scanMode", "enabled", "thumbnailWidth", "thumbnailHeight", "scanDlc", "torrentSources", "createdAt", "updatedAt")
VALUES (
  'switch-2',
  'Nintendo Switch 2',
  '',
  '.nsp,.nsz',
  'folder',
  1,
  183,
  300,
  0,
  '[{"key":"switch-games-nup","type":"json-list","url":"https://raw.githubusercontent.com/Langegen/switch-games/main/switch_games.json","enabled":true,"onlyTag":"NUP"}]',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

-- Switch 1 toma la misma lista sin las entradas [NUP].
UPDATE "Platform"
SET "torrentSources" = json_set("torrentSources", '$[0].exceptTag', 'NUP')
WHERE "slug" = 'switch' AND "torrentSources" IS NOT NULL;
