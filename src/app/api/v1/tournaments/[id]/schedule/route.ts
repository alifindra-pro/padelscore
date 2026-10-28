import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { SchedulingService } from '@/services/scheduling.service';
import { handleApiError } from '@/lib/errors';

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const schedule = await SchedulingService.getTournamentSchedule(id);
    return NextResponse.json({ data: schedule });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
