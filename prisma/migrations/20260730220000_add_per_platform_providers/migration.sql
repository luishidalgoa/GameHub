-- AlterTable: per-platform metadata provider overrides.
--
-- NULL means "inherit the global setting", which is what every existing row
-- gets: adding these columns changes no behaviour until someone picks a value.
-- They exist because the best source depends on the console — the libretro
-- box-art archive is indexed per system and has nothing for Switch, while
-- LaunchBox is thin on Japan-only releases.
ALTER TABLE "Platform" ADD COLUMN "providerCover" TEXT;
ALTER TABLE "Platform" ADD COLUMN "providerInfo" TEXT;
ALTER TABLE "Platform" ADD COLUMN "providerDescription" TEXT;
ALTER TABLE "Platform" ADD COLUMN "providerScreenshots" TEXT;
