import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { EntryService } from "@/services/entry.service";
import { AppError, handleApiError } from "@/lib/errors";
const schema = z.object({
  playerNames: z.tuple([
    z.string().trim().min(2).max(100),
    z.string().trim().min(2).max(100),
  ]),
  contact: z.string().trim().min(5).max(30),
  website: z.string().max(0).optional(),
});
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    if (Number(req.headers.get("content-length") ?? 0) > 3000)
      throw AppError.badRequest("Data terlalu panjang");
    const data = schema.parse(await req.json());
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET required");
    const ip = (
      req.headers.get("x-vercel-forwarded-for") ??
      req.headers.get("x-forwarded-for") ??
      "local"
    )
      .split(",")[0]
      .trim();
    const hash = createHmac("sha256", process.env.JWT_SECRET)
      .update(ip)
      .digest("hex");
    const entry = await EntryService.createEntry({
      categoryId: id,
      playerIds: [],
      playerNames: data.playerNames,
      contact: data.contact,
      publicSubmitter: hash,
      userId: null,
    });
    return NextResponse.json(
      {
        data: {
          id: entry.id,
          name: entry.name,
          status: entry.status,
          queuePosition: entry.queuePosition,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
