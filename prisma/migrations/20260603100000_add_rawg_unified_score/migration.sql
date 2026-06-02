-- Unified 0–100 score: ONE scale for badge / filter / sort.
-- metacritic when present, else the user rating mapped ×20 (4.1 → 82).
ALTER TABLE "Game" ADD COLUMN "rawgScore" INTEGER;

-- Backfill from already-synced metrics (no RAWG re-fetch needed).
UPDATE "Game"
SET "rawgScore" = CASE
  WHEN "rawgMetacritic" IS NOT NULL THEN "rawgMetacritic"
  WHEN "rawgRating" IS NOT NULL AND "rawgRating" > 0 THEN CAST(ROUND("rawgRating" * 20) AS INTEGER)
  ELSE NULL
END
WHERE "popularityFetchedAt" IS NOT NULL;

-- CreateIndex: prune/sort the per-platform candidate set by unified score.
CREATE INDEX "Game_platformId_rawgScore_idx" ON "Game"("platformId", "rawgScore");
