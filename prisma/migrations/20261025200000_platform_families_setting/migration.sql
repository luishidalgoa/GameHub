-- Familias de plataformas (menú y portada): Game Boy agrupa GB, GBC y GBA. Se edita en Ajustes.
INSERT OR IGNORE INTO "Setting" ("key", "value", "updatedAt")
VALUES ('platform_families', '[{"slug":"game-boy","name":"Game Boy","members":[{"slug":"gb","label":"GB"},{"slug":"gbc","label":"GBC"},{"slug":"gba","label":"GBA"}]}]', CAST(strftime('%s','now') AS INTEGER) * 1000);
