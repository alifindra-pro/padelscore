import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { getAuthUser } from "@/middleware/auth.middleware";
import { tournamentAccess, PUBLIC_STATUSES } from "@/lib/v2/access";
import { requireTournamentAdmin } from "@/lib/v2/tournament-admin";
import {
  saveTournamentHeader,
  readAvatar,
  deleteAvatar,
} from "@/services/v2/storage";
import { AppError, handleApiError } from "@/lib/errors";
type Context = { params: Promise<{ id: string }> };
const kindSchema = z.enum(["banner", "logo"]);
const field = (kind: "banner" | "logo") =>
  kind === "banner" ? "headerBannerKey" : "headerLogoKey";
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;
    const t = await prisma.tournament.findUnique({ where: { id } });
    if (!t) throw AppError.notFound();
    if (!PUBLIC_STATUSES.includes(t.status)) {
      const user = await getAuthUser(req);
      if (!user) throw AppError.notFound();
      await tournamentAccess(user, id, false);
    }
    const image = req.nextUrl.searchParams.get("image");
    if (image) {
      const key = t[field(kindSchema.parse(image))];
      if (!key) throw AppError.notFound();
      const bytes = await readAvatar(key);
      if (!bytes) throw AppError.notFound();
      return new Response(bytes as BodyInit, {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return NextResponse.json(
      {
        data: {
          title: t.headerTitle ?? "",
          themeColor: t.headerThemeColor ?? "#005baa",
          description: t.headerDescription ?? "",
          hasBanner: !!t.headerBannerKey,
          hasLogo: !!t.headerLogoKey,
          version: t.updatedAt.toISOString(),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
export async function PATCH(req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;
    const user = await requireTournamentAdmin(req, id);
    const input = z
      .object({
        title: z.string().trim().max(120),
        themeColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/, "Gunakan kode warna enam digit")
          .optional(),
        description: z.string().trim().max(500),
      })
      .parse(await req.json());
    await prisma.$transaction(async (tx) => {
      await tx.tournament.update({
        where: { id },
        data: {
          headerTitle: input.title || null,
          ...(input.themeColor
            ? { headerThemeColor: input.themeColor.toLowerCase() }
            : {}),
          headerDescription: input.description || null,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.userId,
          tournamentId: id,
          action: "UPDATE_TOURNAMENT_HEADER",
          entityType: "Tournament",
          entityId: id,
          after: input,
        },
      });
    });
    return NextResponse.json({ data: { success: true } });
  } catch (e) {
    return handleApiError(e);
  }
}
async function changeImage(req: NextRequest, ctx: Context, remove: boolean) {
  let newKey: string | undefined;
  let committed = false;
  try {
    const { id } = await ctx.params;
    const user = await requireTournamentAdmin(req, id);
    const kind = kindSchema.parse(req.nextUrl.searchParams.get("image"));
    if (!remove) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw AppError.badRequest("Pilih gambar");
      newKey = await saveTournamentHeader(file, id, kind);
    }
    const oldKey = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${id} FOR UPDATE`;
      const previous = await tx.tournament.findUniqueOrThrow({ where: { id } });
      await tx.tournament.update({
        where: { id },
        data: { [field(kind)]: newKey ?? null },
      });
      await tx.auditLog.create({
        data: {
          userId: user.userId,
          tournamentId: id,
          action: remove ? "REMOVE_HEADER_IMAGE" : "UPLOAD_HEADER_IMAGE",
          entityType: "Tournament",
          entityId: id,
          after: { kind },
        },
      });
      return previous[field(kind)];
    });
    committed = true;
    if (oldKey)
      await deleteAvatar(oldKey).catch(() =>
        console.error("Header object cleanup failed", id),
      );
    return NextResponse.json({ data: { success: true } });
  } catch (e) {
    if (newKey && !committed) await deleteAvatar(newKey).catch(() => {});
    return handleApiError(e);
  }
}
export async function POST(req: NextRequest, ctx: Context) {
  return changeImage(req, ctx, false);
}
export async function DELETE(req: NextRequest, ctx: Context) {
  return changeImage(req, ctx, true);
}
