import { requireAuth } from '@/middleware/auth.middleware';
import { organizationFor } from '@/lib/v2/access';
import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { PlayerStatsService } from '@/services/player-stats.service';
import { handleApiError } from '@/lib/errors';

async function handleGET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 20;
    const leaderboard = await PlayerStatsService.getLeaderboard(limit, await organizationFor(await requireAuth(request), searchParams.get('organizationId') || request.headers.get('X-Organization-Id') || undefined));
    return NextResponse.json({ data: leaderboard });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
