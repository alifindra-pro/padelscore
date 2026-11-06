import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import prisma from "@/lib/db";
import { PUBLIC_STATUSES } from "@/lib/v2/access";
import { requireTournamentAdmin } from "@/lib/v2/tournament-admin";
import { AppError, handleApiError } from "@/lib/errors";
type Context = { params: Promise<{ id: string }> };
const submission = z.object({
  matchId: z.string().uuid(),
  reporterName: z.string().trim().min(2).max(100),
  contact: z.string().trim().min(5).max(150),
  reason: z.string().trim().min(20).max(2000),
  website: z.string().max(0).optional(),
});
export async function POST(req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;
    if (Number(req.headers.get("content-length") || 0) > 12000)
      throw AppError.badRequest("Sanggahan terlalu panjang");
    const input = submission.parse(await req.json());
    const match = await prisma.match.findFirst({
      where: { id: input.matchId, stage: { category: { tournamentId: id } } },
      include: {
        stage: { include: { category: { include: { tournament: true } } } },
      },
    });
    if (
      !match ||
      !PUBLIC_STATUSES.includes(match.stage.category.tournament.status)
    )
      throw AppError.notFound();
    if (
      !["FINISHED", "APPROVED"].includes(match.status) ||
      !match.entryAId ||
      !match.entryBId
    )
      throw AppError.badRequest(
        "Sanggahan tersedia setelah pertandingan selesai",
      );
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is required");
    // Proxy-provided address is only an abuse-control signal, never proof of identity.
    const ip = (
      req.headers.get("x-vercel-forwarded-for") ??
      req.headers.get("x-forwarded-for") ??
      "local"
    )
      .split(",")[0]
      .trim();
    const submitterHash = createHmac("sha256", secret).update(ip).digest("hex");
    const receipt = randomBytes(32).toString("hex");
    const receiptHash = createHash("sha256").update(receipt).digest("hex");
    const data = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${submitterHash}))`;
      const contactLock = `${match.id}:${input.contact.toLowerCase()}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${contactLock}))`;
      if (
        (await tx.matchDispute.count({
          where: {
            submitterHash,
            createdAt: { gte: new Date(Date.now() - 3600000) },
          },
        })) >= 5
      )
        throw new AppError(
          429,
          "RATE_LIMITED",
          "Terlalu banyak pengajuan. Coba lagi dalam satu jam.",
        );
      if (
        await tx.matchDispute.findFirst({
          where: {
            matchId: match.id,
            contact: { equals: input.contact, mode: "insensitive" },
            status: "PENDING",
          },
        })
      )
        throw AppError.conflict(
          "Sanggahan untuk kontak dan laga ini masih ditinjau",
        );
      return tx.matchDispute.create({
        data: {
          tournamentId: id,
          matchId: match.id,
          reporterName: input.reporterName,
          contact: input.contact,
          reason: input.reason,
          scoreVersion: match.version,
          receiptHash,
          submitterHash,
        },
        select: { id: true, status: true, createdAt: true },
      });
    });
    return NextResponse.json(
      { data: { ...data, receipt } },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;
    await requireTournamentAdmin(req, id);
    const data = await prisma.matchDispute.findMany({
      where: { tournamentId: id },
      select: {
        id: true,
        reporterName: true,
        contact: true,
        reason: true,
        status: true,
        response: true,
        createdAt: true,
        reviewedAt: true,
        scoreVersion: true,
        match: {
          select: {
            id: true,
            matchNumber: true,
            version: true,
            entryA: { select: { name: true } },
            entryB: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json(
      { data },
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
        disputeId: z.string().uuid(),
        status: z.enum(["ACCEPTED", "REJECTED"]),
        response: z.string().trim().min(10).max(2000),
      })
      .parse(await req.json());
    await prisma.$transaction(async (tx) => {
      const updated = await tx.matchDispute.updateMany({
        where: { id: input.disputeId, tournamentId: id, status: "PENDING" },
        data: {
          status: input.status,
          response: input.response,
          reviewedBy: user.userId,
          reviewedAt: new Date(),
        },
      });
      if (updated.count !== 1)
        throw AppError.conflict(
          "Sanggahan tidak ditemukan atau sudah diputuskan",
        );
      await tx.auditLog.create({
        data: {
          userId: user.userId,
          tournamentId: id,
          action: "REVIEW_DISPUTE",
          entityType: "MatchDispute",
          entityId: input.disputeId,
          after: { status: input.status, response: input.response },
        },
      });
    });
    return NextResponse.json({ data: { success: true } });
  } catch (e) {
    return handleApiError(e);
  }
}
