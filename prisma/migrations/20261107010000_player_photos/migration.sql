-- DropForeignKey
ALTER TABLE "entries" DROP CONSTRAINT "entries_savedPairId_fkey";

-- DropForeignKey
ALTER TABLE "saved_pairs" DROP CONSTRAINT "saved_pairs_organizationId_fkey";

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "photoKey" TEXT;

-- AlterTable
ALTER TABLE "entries" DROP COLUMN "savedPairId";

-- DropTable
DROP TABLE "saved_pairs";

