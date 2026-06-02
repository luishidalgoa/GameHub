-- Provenance of the unified score: 'rawg' | 'metacritic' | 'launchbox' | 'manual'.
-- A LaunchBox community rating must not be mislabeled as a Metacritic critic score.
ALTER TABLE "Game" ADD COLUMN "scoreSource" TEXT;

-- Backfill provenance for already-scored games: metacritic → 'metacritic',
-- else (score from the user rating) → 'rawg'.
UPDATE "Game"
SET "scoreSource" = CASE
  WHEN "rawgMetacritic" IS NOT NULL THEN 'metacritic'
  WHEN "rawgScore" IS NOT NULL THEN 'rawg'
  ELSE NULL
END
WHERE "rawgScore" IS NOT NULL;
