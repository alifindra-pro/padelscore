import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/middleware/auth.middleware";
import { tournamentAccess, PUBLIC_STATUSES } from "@/lib/v2/access";
import { requireTournamentAdmin } from "@/lib/v2/tournament-admin";
import { readAvatar, deleteAvatar } from "@/services/v2/storage";
import { AppError, handleApiError } from "@/lib/errors";
type Context = { params: Promise<{ id: string; sponsorId: string }> };
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const { id, sponsorId } = await ctx.params;
    const sponsor = await prisma.tournamentSponsor.findFirst({
      where: { id: sponsorId, tournamentId: id },
      include: { tournament: { select: { status: true } } },
    });
    if (!sponsor) throw AppError.notFound();
    if (!PUBLIC_STATUSES.includes(sponsor.tournament.status)) {
      const user = await getAuthUser(req);
      if (!user) throw AppError.notFound();
      await tournamentAccess(user, id, false);
    }
    const bytes = await readAvatar(sponsor.logoKey);
    if (!bytes) throw AppError.notFound();
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
export async function DELETE(req: NextRequest, ctx: Context) {
  try {
    const { id, sponsorId } = await ctx.params;
    const user = await requireTournamentAdmin(req, id);
    const sponsor = await prisma.tournamentSponsor.findFirst({
      where: { id: sponsorId, tournamentId: id },
    });
    if (!sponsor) throw AppError.notFound();
    await prisma.$transaction(async (tx) => {
      await tx.tournamentSponsor.delete({ where: { id: sponsorId } });
      await tx.auditLog.create({
        data: {
          userId: user.userId,
          tournamentId: id,
          action: "REMOVE_SPONSOR",
          entityType: "TournamentSponsor",
          entityId: sponsorId,
        },
      });
    });
    await deleteAvatar(sponsor.logoKey).catch(() =>
      console.error("Sponsor object cleanup failed", sponsorId),
    );
    return NextResponse.json({ data: { success: true } });
  } catch (e) {
    return handleApiError(e);
  }
}
