import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireTournamentAdmin } from "@/lib/v2/tournament-admin";
import { AppError, handleApiError } from "@/lib/errors";
import { qrToken, windowState } from "@/lib/check-in";

type Context = { params: Promise<{ id: string }> };
const noStore = { headers: { "Cache-Control": "private, no-store" } };

async function adminCategory(req: NextRequest, id: string) {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw AppError.notFound("Kategori tidak ditemukan");
  await requireTournamentAdmin(req, category.tournamentId);
  return category;
}

/** Organizer view: the window, the current QR code and who has checked in. */
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;
    const category = await adminCategory(req, id);
    const entries = await prisma.entry.findMany({
      where: { categoryId: id, status: { in: ["REGISTERED", "CONFIRMED"] } },
      select: {
        id: true,
        name: true,
        players: {
          select: {
            checkedInAt: true,
            checkInMethod: true,
            player: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const state = windowState(category);
    return NextResponse.json(
      {
        data: {
          opensAt: category.checkInOpensAt,
          closesAt: category.checkInClosesAt,
          state,
          // The code is only handed out while players can use it.
          qr: state === "OPEN" ? qrToken(id) : null,
          serverTime: Date.now(),
          entries,
        },
      },
      noStore,
    );
  } catch (e) {
    return handleApiError(e);
  }
}

/** Set or clear the check-in window. */
export async function PATCH(req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;
    await adminCategory(req, id);
    const input = z
      .object({
        opensAt: z.string().datetime().nullable(),
        closesAt: z.string().datetime().nullable(),
      })
      .parse(await req.json());
    if (!input.opensAt && input.closesAt)
      throw AppError.badRequest("Atur waktu buka check-in terlebih dahulu");
    if (
      input.opensAt &&
      input.closesAt &&
      new Date(input.closesAt) <= new Date(input.opensAt)
    )
      throw AppError.badRequest("Waktu tutup harus setelah waktu buka");
    const updated = await prisma.category.update({
      where: { id },
      data: {
        checkInOpensAt: input.opensAt ? new Date(input.opensAt) : null,
        checkInClosesAt: input.closesAt ? new Date(input.closesAt) : null,
      },
      select: { checkInOpensAt: true, checkInClosesAt: true },
    });
    return NextResponse.json({ data: updated }, noStore);
  } catch (e) {
    return handleApiError(e);
  }
}

/** Organizer marks a player as present (or undoes it), at any time. */
export async function POST(req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;
    await adminCategory(req, id);
    const input = z
      .object({
        entryId: z.string().uuid(),
        playerId: z.string().uuid(),
        present: z.boolean(),
      })
      .parse(await req.json());
    const { count } = await prisma.entryPlayer.updateMany({
      where: {
        entryId: input.entryId,
        playerId: input.playerId,
        entry: { categoryId: id },
      },
      data: input.present
        ? { checkedInAt: new Date(), checkInMethod: "MANUAL" }
        : { checkedInAt: null, checkInMethod: null },
    });
    if (!count) throw AppError.notFound("Pemain tidak ada di kategori ini");
    return NextResponse.json({ data: { ok: true } }, noStore);
  } catch (e) {
    return handleApiError(e);
  }
}
