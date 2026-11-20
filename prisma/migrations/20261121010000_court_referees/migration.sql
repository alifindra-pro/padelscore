-- Court referees sign in with a link and a token; matches need a start code.
ALTER TABLE "courts" ADD COLUMN "referee_user_id" TEXT;
ALTER TABLE "courts" ADD COLUMN "referee_link_id" TEXT;
ALTER TABLE "courts" ADD COLUMN "referee_token_version" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "courts_referee_user_id_key" ON "courts"("referee_user_id");
CREATE UNIQUE INDEX "courts_referee_link_id_key" ON "courts"("referee_link_id");
ALTER TABLE "courts" ADD CONSTRAINT "courts_referee_user_id_fkey" FOREIGN KEY ("referee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "matches" ADD COLUMN "start_unlocked_at" TIMESTAMP(3);
ALTER TABLE "matches" ADD COLUMN "start_code_fails" INTEGER NOT NULL DEFAULT 0;
