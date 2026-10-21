-- #80: 'rawg' mezclaba la nota de critica (metascore) y la nota de usuario x20.
-- Con rawgMetacritic presente es metascore; sin el, es la nota de usuario.
UPDATE "Game" SET "scoreSource" = 'metacritic' WHERE "scoreSource" = 'rawg' AND "rawgMetacritic" IS NOT NULL;
UPDATE "Game" SET "scoreSource" = 'rawg_rating' WHERE "scoreSource" = 'rawg' AND "rawgMetacritic" IS NULL;
