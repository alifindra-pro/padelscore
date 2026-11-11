import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/middleware/auth.middleware";
import { handleApiError } from "@/lib/errors";
import { getCoinToss, tossCoin } from "@/services/v2/coin-toss";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    return NextResponse.json(
      { data: await getCoinToss(user, id) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
export async function POST(req: NextRequest, ctx: Context) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const input = z
      .object({
        deviceId: z.string().min(1).max(200),
        ownershipVersion: z.number().int().nonnegative(),
      })
      .parse(await req.json());
    return NextResponse.json(
      {
        data: await tossCoin(user, id, input.deviceId, input.ownershipVersion),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
