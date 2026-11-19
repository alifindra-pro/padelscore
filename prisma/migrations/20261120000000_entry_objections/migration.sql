-- Disputes can now target a pair (before its category's draw) as well as a match result.
ALTER TABLE "match_disputes" ALTER COLUMN "matchId" DROP NOT NULL;
ALTER TABLE "match_disputes" ALTER COLUMN "scoreVersion" SET DEFAULT 0;
ALTER TABLE "match_disputes" ADD COLUMN "entryId" TEXT;

CREATE INDEX "match_disputes_entryId_idx" ON "match_disputes"("entryId");

ALTER TABLE "match_disputes" ADD CONSTRAINT "match_disputes_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one target per dispute.
ALTER TABLE "match_disputes" ADD CONSTRAINT "match_disputes_one_target" CHECK (("matchId" IS NULL) <> ("entryId" IS NULL));
