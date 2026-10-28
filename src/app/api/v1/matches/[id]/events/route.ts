import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { MatchService } from '@/services/match.service';
import { handleApiError } from '@/lib/errors';

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const events = await MatchService.getMatchEvents(id);
    return NextResponse.json({ data: events });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
