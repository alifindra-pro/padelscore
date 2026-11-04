import { NextRequest } from "next/server";
import { getAuthUser } from "@/middleware/auth.middleware";
import { legacyAccess } from "@/lib/v2/access";
import { AppError, handleApiError } from "@/lib/errors";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ kind: string; id: string }>;
  },
) {
  try {
    const { kind, id } = await context.params;
    if (
      !["matches", "tournaments"].includes(kind) ||
      !/^[a-zA-Z0-9-]{1,128}$/.test(id)
    ) {
      throw AppError.notFound();
    }
    const functionUrl = process.env.NEON_FUNCTION_SCOREFEED_BASE_URL;
    const secret = process.env.PADEL_FUNCTION_SECRET;
    if (!functionUrl || !secret) {
      return Response.json(
        { error: { code: "NEON_NOT_CONFIGURED" } },
        { status: 501 },
      );
    }
    const accessRequest = new NextRequest(
      new URL(`/api/v1/stream/${kind}/${id}`, request.url),
      { headers: request.headers },
    );
    await legacyAccess(accessRequest);
    const user = await getAuthUser(request);
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-padel-secret": secret },
      body: JSON.stringify({ kind, id, userId: user?.userId ?? null }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new AppError(
        503,
        "REALTIME_UNAVAILABLE",
        "Skor langsung belum dapat dihubungkan",
      );
    return Response.json(await response.json(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
