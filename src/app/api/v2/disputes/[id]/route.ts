import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import prisma from "@/lib/db";
import { AppError, handleApiError } from "@/lib/errors";
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const receipt = req.headers.get("x-dispute-receipt") ?? "";
    if (!/^[a-f0-9]{64}$/.test(receipt)) throw AppError.notFound();
    const data = await prisma.matchDispute.findFirst({
      where: {
        id,
        receiptHash: createHash("sha256").update(receipt).digest("hex"),
      },
      select: {
        id: true,
        status: true,
        response: true,
        createdAt: true,
        reviewedAt: true,
      },
    });
    if (!data) throw AppError.notFound();
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
