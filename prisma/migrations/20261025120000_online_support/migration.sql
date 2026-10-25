-- Compatibilidad de juego en línea por proveedor y Title ID (sincronizada desde la fuente de cada proveedor).
CREATE TABLE "OnlineSupport" (
    "provider" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requiredVersion" TEXT,
    "name" TEXT,
    "syncedAt" DATETIME NOT NULL,
    PRIMARY KEY ("provider", "titleId")
);

-- Proyectos de juego en línea de cada plataforma (enlace en su página).
ALTER TABLE "Platform" ADD COLUMN "onlineProviders" TEXT;
UPDATE "Platform" SET "onlineProviders" = '[{"key":"nextendo","label":"Nextendo Network","url":"https://github.com/NextendoNetwork"}]' WHERE "slug" = 'switch';
