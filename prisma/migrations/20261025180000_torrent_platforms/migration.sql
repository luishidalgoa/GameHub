-- Plataformas de torrent sin carpeta local, y una fuente Minerva por consola.
-- Las plataformas que ya existen conservan su biblioteca; solo reciben su fuente si no tienen ninguna.

INSERT OR IGNORE INTO "Platform" ("slug", "name", "scanPath", "extensions", "scanMode", "sortOrder", "enabled", "thumbnailWidth", "thumbnailHeight", "createdAt", "updatedAt", "scanDlc")
VALUES
  ('gb',            'Game Boy',                 '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0),
  ('gbc',           'Game Boy Color',           '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0),
  ('gamecube',      'GameCube',                 '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0),
  ('wii-u',         'Wii U',                    '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0),
  ('mega-drive',    'Mega Drive / Genesis',     '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0),
  ('saturn',        'Sega Saturn',              '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0),
  ('dreamcast',     'Dreamcast',                '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0),
  ('game-gear',     'Game Gear',                '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0),
  ('master-system', 'Master System',            '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0),
  ('sega-32x',      'Sega 32X',                 '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0),
  ('sega-cd',       'Sega CD / Mega CD',        '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0),
  ('xbox',          'Xbox',                     '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0),
  ('xbox-360',      'Xbox 360',                 '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0),
  ('ps1',           'PlayStation',              '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0),
  ('ps2',           'PlayStation 2',            '', '', 'flat', 99, 1, 200, 300, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 0);

UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-gb","type":"minerva-directory","url":"https://minerva-archive.org/browse/No-Intro/Nintendo%20-%20Game%20Boy/","enabled":true}]' WHERE "slug" = 'gb' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-gbc","type":"minerva-directory","url":"https://minerva-archive.org/browse/No-Intro/Nintendo%20-%20Game%20Boy%20Color/","enabled":true}]' WHERE "slug" = 'gbc' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-gamecube","type":"minerva-directory","url":"https://minerva-archive.org/browse/Redump/Nintendo%20-%20GameCube%20-%20NKit%20RVZ%20%5Bzstd-19-128k%5D/","enabled":true}]' WHERE "slug" = 'gamecube' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-wii-u","type":"minerva-directory","url":"https://minerva-archive.org/browse/Redump/Nintendo%20-%20Wii%20U%20-%20WUX/","enabled":true}]' WHERE "slug" = 'wii-u' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-mega-drive","type":"minerva-directory","url":"https://minerva-archive.org/browse/No-Intro/Sega%20-%20Mega%20Drive%20-%20Genesis/","enabled":true}]' WHERE "slug" = 'mega-drive' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-saturn","type":"minerva-directory","url":"https://minerva-archive.org/browse/Redump/Sega%20-%20Saturn/","enabled":true}]' WHERE "slug" = 'saturn' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-dreamcast","type":"minerva-directory","url":"https://minerva-archive.org/browse/Redump/Sega%20-%20Dreamcast/","enabled":true}]' WHERE "slug" = 'dreamcast' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-game-gear","type":"minerva-directory","url":"https://minerva-archive.org/browse/No-Intro/Sega%20-%20Game%20Gear/","enabled":true}]' WHERE "slug" = 'game-gear' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-master-system","type":"minerva-directory","url":"https://minerva-archive.org/browse/No-Intro/Sega%20-%20Master%20System%20-%20Mark%20III/","enabled":true}]' WHERE "slug" = 'master-system' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-sega-32x","type":"minerva-directory","url":"https://minerva-archive.org/browse/No-Intro/Sega%20-%2032X/","enabled":true}]' WHERE "slug" = 'sega-32x' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-sega-cd","type":"minerva-directory","url":"https://minerva-archive.org/browse/Redump/Sega%20-%20Mega%20CD%20%26%20Sega%20CD/","enabled":true}]' WHERE "slug" = 'sega-cd' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-xbox","type":"minerva-directory","url":"https://minerva-archive.org/browse/Redump/Microsoft%20-%20Xbox/","enabled":true}]' WHERE "slug" = 'xbox' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-xbox-360","type":"minerva-directory","url":"https://minerva-archive.org/browse/Redump/Microsoft%20-%20Xbox%20360/","enabled":true}]' WHERE "slug" = 'xbox-360' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-ps1","type":"minerva-directory","url":"https://minerva-archive.org/browse/Redump/Sony%20-%20PlayStation/","enabled":true}]' WHERE "slug" = 'ps1' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-ps2","type":"minerva-directory","url":"https://minerva-archive.org/browse/Redump/Sony%20-%20PlayStation%202/","enabled":true}]' WHERE "slug" = 'ps2' AND "torrentSources" IS NULL;

UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-gba","type":"minerva-directory","url":"https://minerva-archive.org/browse/No-Intro/Nintendo%20-%20Game%20Boy%20Advance/","enabled":true}]' WHERE "slug" = 'gba' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-nds","type":"minerva-directory","url":"https://minerva-archive.org/browse/No-Intro/Nintendo%20-%20Nintendo%20DS%20(Decrypted)/","enabled":true}]' WHERE "slug" = 'nds' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-3ds","type":"minerva-directory","url":"https://minerva-archive.org/browse/No-Intro/Nintendo%20-%20Nintendo%203DS%20(Decrypted)/","enabled":true}]' WHERE "slug" = '3ds' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-snes","type":"minerva-directory","url":"https://minerva-archive.org/browse/No-Intro/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/","enabled":true}]' WHERE "slug" = 'super-nintendo-entertainment-system' AND "torrentSources" IS NULL;
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-wii","type":"minerva-directory","url":"https://minerva-archive.org/browse/Redump/Nintendo%20-%20Wii%20-%20NKit%20RVZ%20%5Bzstd-19-128k%5D/","enabled":true}]' WHERE "slug" = 'wii' AND "torrentSources" IS NULL;
