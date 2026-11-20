-- Venue check-in: a window per category and a check-in time per player in a pair.
ALTER TABLE "categories" ADD COLUMN "check_in_opens_at" TIMESTAMP(3);
ALTER TABLE "categories" ADD COLUMN "check_in_closes_at" TIMESTAMP(3);
ALTER TABLE "entry_players" ADD COLUMN "checked_in_at" TIMESTAMP(3);
ALTER TABLE "entry_players" ADD COLUMN "check_in_method" TEXT;
