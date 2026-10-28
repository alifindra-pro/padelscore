import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { BracketService } from '@/services/bracket.service';
import { handleApiError } from '@/lib/errors';

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const standings = await BracketService.getCategoryStandings(id);
    return NextResponse.json({ data: standings });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
