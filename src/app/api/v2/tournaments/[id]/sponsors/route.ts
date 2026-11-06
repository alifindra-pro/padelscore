import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { getAuthUser } from "@/middleware/auth.middleware";
import { tournamentAccess, PUBLIC_STATUSES } from "@/lib/v2/access";
import { requireTournamentAdmin } from "@/lib/v2/tournament-admin";
import { saveSponsorLogo, deleteAvatar } from "@/services/v2/storage";
import { AppError, handleApiError } from "@/lib/errors";
type Context = { params: Promise<{ id: string }> };
const schema = z.object({
  name: z.string().trim().min(2).max(100),
  tier: z.enum(["MAIN", "PARTNER", "SUPPORTER"]),
  website: z.union([
    z.literal(""),
    z
      .string()
      .url()
      .max(500)
      .refine((v) => /^https?:\/\//i.test(v), "Gunakan tautan http atau https"),
  ]),
});
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;
    const t = await prisma.tournament.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!t) throw AppError.notFound();
    if (!PUBLIC_STATUSES.includes(t.status)) {
      const user = await getAuthUser(req);
      if (!user) throw AppError.notFound();
      await tournamentAccess(user, id, false);
    }
    const data = await prisma.tournamentSponsor.findMany({
      where: { tournamentId: id },
      select: { id: true, name: true, tier: true, website: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
export async function POST(req: NextRequest, ctx: Context) {
  let key: string | undefined;
  try {
    const { id } = await ctx.params;
    const user = await requireTournamentAdmin(req, id);
    const form = await req.formData();
    const input = schema.parse({
      name: form.get("name"),
      tier: form.get("tier"),
      website: form.get("website") ?? "",
    });
    const file = form.get("logo");
    if (!(file instanceof File))
      throw AppError.badRequest("Pilih logo sponsor");
    key = await saveSponsorLogo(file, id);
    const data = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${id} FOR UPDATE`;
      if (
        (await tx.tournamentSponsor.count({ where: { tournamentId: id } })) >=
        12
      )
        throw AppError.badRequest("Maksimal 12 sponsor per turnamen");
      const sponsor = await tx.tournamentSponsor.create({
        data: {
          ...input,
          website: input.website || null,
          tournamentId: id,
          logoKey: key!,
        },
        select: { id: true, name: true, tier: true, website: true },
      });
      await tx.auditLog.create({
        data: {
          userId: user.userId,
          tournamentId: id,
          action: "ADD_SPONSOR",
          entityType: "TournamentSponsor",
          entityId: sponsor.id,
          after: { name: sponsor.name },
        },
      });
      return sponsor;
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    if (key) await deleteAvatar(key).catch(() => {});
    return handleApiError(e);
  }
}
