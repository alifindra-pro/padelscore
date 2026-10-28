import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { MatchService } from '@/services/match.service';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole } from '@prisma/client';

async function handleGET(request: NextRequest) {
  try {
    const user = await requireRole(request, [
      UserRole.SUPER_ADMIN,
      UserRole.ORGANIZER,
      UserRole.REFEREE,
    ]);

    const matches = await MatchService.getAssignedMatches(user.userId);
    return NextResponse.json({ data: matches });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
