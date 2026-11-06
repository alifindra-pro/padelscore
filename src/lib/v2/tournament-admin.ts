import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/middleware/auth.middleware";
import { tournamentAccess } from "@/lib/v2/access";
import { AppError } from "@/lib/errors";
export async function requireTournamentAdmin(request: NextRequest, id: string) {
  const user = await requireAuth(request);
  const tournament = await tournamentAccess(user, id, false);
  if (
    user.role === "SUPER_ADMIN" ||
    tournament.members.some(
      (m) => m.userId === user.userId && ["OWNER", "ADMIN"].includes(m.role),
    )
  )
    return user;
  if (tournament.organizationId) {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: tournament.organizationId,
          userId: user.userId,
        },
      },
    });
    if (membership && ["OWNER", "ADMIN"].includes(membership.role)) return user;
  }
  throw AppError.forbidden(
    "Hanya admin turnamen yang dapat mengelola bagian ini",
  );
}
