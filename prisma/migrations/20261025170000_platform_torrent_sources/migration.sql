-- AlterTable
ALTER TABLE "Platform" ADD COLUMN "torrentSources" TEXT;

-- Fuentes iniciales: las claves se conservan para no romper las filas torrent existentes.
UPDATE "Platform" SET "torrentSources" = '[{"key":"switch-games","type":"json-list","url":"https://raw.githubusercontent.com/Langegen/switch-games/main/switch_games.json","enabled":true}]' WHERE "slug" = 'switch';
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-psp","type":"minerva-directory","url":"https://minerva-archive.org/browse/No-Intro/Sony%20-%20PlayStation%20Portable%20(PSN)%20(Decrypted)/","enabled":true}]' WHERE "slug" = 'psp';
UPDATE "Platform" SET "torrentSources" = '[{"key":"minerva-psvita","type":"minerva-directory","url":"https://minerva-archive.org/browse/No-Intro/Sony%20-%20PlayStation%20Vita%20(PSN)%20(Content)/","enabled":true}]' WHERE "slug" = 'psvita';
