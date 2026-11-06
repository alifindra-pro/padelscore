-- CreateTable
CREATE TABLE "tournament_sponsors" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'PARTNER',
    "website" TEXT,
    "logoKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_disputes" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "response" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "scoreVersion" INTEGER NOT NULL,
    "receiptHash" TEXT NOT NULL,
    "submitterHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournament_sponsors_tournamentId_createdAt_idx" ON "tournament_sponsors"("tournamentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "match_disputes_receiptHash_key" ON "match_disputes"("receiptHash");

-- CreateIndex
CREATE INDEX "match_disputes_tournamentId_status_createdAt_idx" ON "match_disputes"("tournamentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "match_disputes_submitterHash_createdAt_idx" ON "match_disputes"("submitterHash", "createdAt");

-- AddForeignKey
ALTER TABLE "tournament_sponsors" ADD CONSTRAINT "tournament_sponsors_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_disputes" ADD CONSTRAINT "match_disputes_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_disputes" ADD CONSTRAINT "match_disputes_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

