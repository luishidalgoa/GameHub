-- Per-field metadata provenance (JSON: cover/info/description/screenshots -> provider name)
ALTER TABLE "Game" ADD COLUMN "metadataSources" TEXT;
