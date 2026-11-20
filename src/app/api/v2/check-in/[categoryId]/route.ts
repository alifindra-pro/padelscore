import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { PUBLIC_STATUSES } from "@/lib/v2/access";
import { AppError, handleApiError } from "@/lib/errors";
import {
  issuePass,
  validPass,
  validQrToken,
  windowState,
} from "@/lib/check-in";

type Context = { params: Promise<{ categoryId: string }> };
const noStore = { headers: { "Cache-Control": "no-store" } };
const body = z.discriminatedUnion("action", [
  // Scanning the QR on the organizer's screen.
  z.object({ action: z.literal("open"), token: z.string().min(8).max(64) }),
  // Picking one's own name from the list.
  z.object({
    action: z.literal("confirm"),
    pass: z.string().min(8).max(128),
    entryId: z.string().uuid(),
    playerId: z.string().uuid(),
  }),
]);

async function openCategory(categoryId: string) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { tournament: { select: { name: true, status: true } } },
  });
  if (!category || !PUBLIC_STATUSES.includes(category.tournament.status))
    throw AppError.notFound("Check-in tidak ditemukan");
  const state = windowState(category);
  if (state === "NOT_OPEN")
    throw AppError.conflict("Check-in belum dibuka panitia");
  if (state === "CLOSED")
    throw AppError.conflict(
      "Check-in sudah ditutup. Silakan lapor ke meja panitia.",
    );
  return category;
}

/** Public check-in at the venue. Needs the live QR code, never a login. */
export async function POST(req: NextRequest, ctx: Context) {
  try {
    const { categoryId } = await ctx.params;
    if (!z.string().uuid().safeParse(categoryId).success)
      throw AppError.notFound("Check-in tidak ditemukan");
    if (Number(req.headers.get("content-length") || 0) > 2000)
      throw AppError.badRequest("Permintaan terlalu besar");
    const input = body.parse(await req.json());
    const category = await openCategory(categoryId);

    if (input.action === "open") {
      if (!validQrToken(categoryId, input.token))
        throw AppError.forbidden(
          "QR sudah berganti. Pindai lagi QR di layar panitia.",
        );
      const entries = await prisma.entry.findMany({
        where: { categoryId, status: { in: ["REGISTERED", "CONFIRMED"] } },
        select: {
          id: true,
          name: true,
          players: {
            select: {
              checkedInAt: true,
              player: { select: { id: true, fullName: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json(
        {
          data: {
            pass: issuePass(categoryId),
            tournament: category.tournament.name,
            category: category.name,
            entries: entries.map((e) => ({
              id: e.id,
              name: e.name,
              players: e.players.map((p) => ({
                id: p.player.id,
                fullName: p.player.fullName,
                checkedIn: !!p.checkedInAt,
              })),
            })),
          },
        },
        noStore,
      );
    }

    if (!validPass(categoryId, input.pass))
      throw AppError.forbidden(
        "Waktu memilih nama habis. Pindai lagi QR di layar panitia.",
      );
    const link = await prisma.entryPlayer.findFirst({
      where: {
        entryId: input.entryId,
        playerId: input.playerId,
        entry: { categoryId, status: { in: ["REGISTERED", "CONFIRMED"] } },
      },
      include: { player: { select: { fullName: true } } },
    });
    if (!link) throw AppError.notFound("Nama tidak ada di kategori ini");
    // Only the first check-in counts; scanning twice keeps the original time.
    const now = new Date();
    const { count } = await prisma.entryPlayer.updateMany({
      where: { id: link.id, checkedInAt: null },
      data: { checkedInAt: now, checkInMethod: "QR" },
    });
    return NextResponse.json(
      {
        data: {
          name: link.player.fullName,
          checkedInAt: count ? now : link.checkedInAt,
          already: !count,
        },
      },
      noStore,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
