ALTER TABLE "matches" ADD COLUMN "coinToss" JSONB;

-- Carry over tosses recorded before the column existed (earliest toss wins).
UPDATE "matches" m
SET "coinToss" = t."after"
FROM (
  SELECT DISTINCT ON ("entity_id") "entity_id", "after"
  FROM "audit_logs"
  WHERE "entity_type" = 'Match' AND "action" = 'COIN_TOSS' AND "after" IS NOT NULL
  ORDER BY "entity_id", "created_at" ASC
) t
WHERE m."id" = t."entity_id" AND m."coinToss" IS NULL;
