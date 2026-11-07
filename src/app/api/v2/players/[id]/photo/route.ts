import { NextRequest, NextResponse } from "next/server";
import type { TournamentStatus } from "@prisma/client";
import prisma from "@/lib/db";
import { getAuthUser, requireRole } from "@/middleware/auth.middleware";
import {
  organizationAccess,
  organizationFor,
  PUBLIC_STATUSES,
} from "@/lib/v2/access";
import { AppError, handleApiError } from "@/lib/errors";
import { saveAvatar, readAvatar, deleteAvatar } from "@/services/v2/storage";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;
    const player = await prisma.player.findUnique({ where: { id } });
    if (!player?.photoKey) throw AppError.notFound();
    const published = await prisma.entryPlayer.count({
      where: {
        playerId: id,
        entry: {
          category: {
            tournament: {
              status: { in: PUBLIC_STATUSES as TournamentStatus[] },
            },
          },
        },
      },
    });
    if (!published) {
      const user = await getAuthUser(req);
      if (!user || !player.organizationId) throw AppError.notFound();
      await organizationAccess(user, player.organizationId, false);
    }
    const bytes = await readAvatar(player.photoKey);
    if (!bytes) throw AppError.notFound();
    return new NextResponse(new Uint8Array(bytes), {
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
async function mutate(req: NextRequest, ctx: Context, remove: boolean) {
  let key: string | undefined;
  try {
    const user = await requireRole(req, ["ORGANIZER", "SUPER_ADMIN"]);
    const organizationId = await organizationFor(
      user,
      req.headers.get("X-Organization-Id") ?? undefined,
    );
    const { id } = await ctx.params;
    const player = await prisma.player.findFirst({
      where: { id, organizationId },
    });
    if (!player) throw AppError.notFound();
    if (!remove) {
      const file = (await req.formData()).get("photo");
      if (!(file instanceof File))
        throw AppError.badRequest("Pilih foto pemain");
      key = await saveAvatar(file, `players-${id}`);
    }
    const updated = await prisma.player.updateMany({
      where: { id, organizationId, photoKey: player.photoKey },
      data: { photoKey: key ?? null },
    });
    if (!updated.count)
      throw AppError.conflict("Foto berubah. Muat ulang lalu coba lagi.");
    key = undefined;
    if (player.photoKey) await deleteAvatar(player.photoKey).catch(() => {});
    return NextResponse.json({ data: { success: true } });
  } catch (e) {
    if (key) await deleteAvatar(key).catch(() => {});
    return handleApiError(e);
  }
}
export const POST = (req: NextRequest, ctx: Context) => mutate(req, ctx, false);
export const DELETE = (req: NextRequest, ctx: Context) =>
  mutate(req, ctx, true);
