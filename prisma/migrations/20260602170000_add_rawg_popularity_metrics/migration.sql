-- Objective popularity metrics from RAWG, for per-platform recommendations.
-- Raw signals stored as-is (score computed at query time, tunable without re-sync).
-- popularityFetchedAt is the idempotency marker for the 'popularity' batch mode.
ALTER TABLE "Game" ADD COLUMN "rawgAdded" INTEGER;
ALTER TABLE "Game" ADD COLUMN "rawgRating" REAL;
ALTER TABLE "Game" ADD COLUMN "rawgRatingsCount" INTEGER;
ALTER TABLE "Game" ADD COLUMN "rawgMetacritic" INTEGER;
ALTER TABLE "Game" ADD COLUMN "popularityFetchedAt" DATETIME;

-- CreateIndex: prune per-platform candidate set for recommendations.
CREATE INDEX "Game_platformId_rawgAdded_idx" ON "Game"("platformId", "rawgAdded");
