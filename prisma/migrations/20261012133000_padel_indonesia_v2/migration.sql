-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatarKey" TEXT;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "handbookUrl" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "responsibleName" TEXT;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "eligibility" JSONB,
ADD COLUMN     "qualificationPolicy" JSONB,
ADD COLUMN     "rulesV2" JSONB,
ADD COLUMN     "standingsPolicy" JSONB;

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "federationId" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "level" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED';

-- AlterTable
ALTER TABLE "courts" ADD COLUMN     "venueCourtId" TEXT;

-- AlterTable
ALTER TABLE "stages" ADD COLUMN     "roundRules" JSONB,
ADD COLUMN     "rulesOverride" JSONB;

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "bracketSide" TEXT,
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "engineVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "estimatedEndAt" TIMESTAMP(3),
ADD COLUMN     "nextLoserMatchId" TEXT,
ADD COLUMN     "nextWinnerMatchId" TEXT,
ADD COLUMN     "ownershipVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rulesSnapshot" JSONB,
ADD COLUMN     "stateV2" JSONB;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "features" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("organizationId","userId")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueCourt" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "VenueCourt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringAction" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "ownershipVersion" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "action" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoringAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "participants" JSONB NOT NULL,
    "rounds" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobileSession_tokenHash_key" ON "MobileSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringAction_matchId_sequence_key" ON "ScoringAction"("matchId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courts" ADD CONSTRAINT "courts_venueCourtId_fkey" FOREIGN KEY ("venueCourtId") REFERENCES "VenueCourt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueCourt" ADD CONSTRAINT "VenueCourt_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileSession" ADD CONSTRAINT "MobileSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringAction" ADD CONSTRAINT "ScoringAction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Each existing tournament owner receives an isolated organization. Unassigned players
-- remain quarantined (organizationId NULL), visible only to super admins until assigned.
INSERT INTO "Organization" (id,name,"features","createdAt")
SELECT 'legacy-' || u.id, u.full_name || ' — Organisasi', '{"scoringV2":true,"social":true}', CURRENT_TIMESTAMP FROM users u WHERE u.role IN ('ORGANIZER','SUPER_ADMIN') ON CONFLICT DO NOTHING;
INSERT INTO "OrganizationMember" ("organizationId","userId",role)
SELECT 'legacy-' || u.id,u.id,'OWNER' FROM users u WHERE u.role IN ('ORGANIZER','SUPER_ADMIN') ON CONFLICT DO NOTHING;
UPDATE tournaments t SET "organizationId" = 'legacy-' || m.user_id FROM tournament_members m JOIN users u ON u.id=m.user_id WHERE m.tournament_id=t.id AND m.role='OWNER' AND u.role IN ('ORGANIZER','SUPER_ADMIN');
UPDATE players p SET "organizationId" = x.org FROM (
 SELECT ep.player_id, MIN(t."organizationId") org FROM entry_players ep JOIN entries e ON e.id=ep.entry_id JOIN categories c ON c.id=e.category_id JOIN tournaments t ON t.id=c.tournament_id
 WHERE t."organizationId" IS NOT NULL GROUP BY ep.player_id HAVING COUNT(DISTINCT t."organizationId")=1
) x WHERE x.player_id=p.id;
