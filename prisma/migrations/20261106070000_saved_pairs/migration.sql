-- AlterTable
ALTER TABLE "entries" ADD COLUMN     "savedPairId" TEXT;

-- CreateTable
CREATE TABLE "saved_pairs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "playerA" TEXT NOT NULL,
    "playerB" TEXT NOT NULL,
    "photoKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_pairs_organizationId_name_idx" ON "saved_pairs"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_savedPairId_fkey" FOREIGN KEY ("savedPairId") REFERENCES "saved_pairs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_pairs" ADD CONSTRAINT "saved_pairs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

