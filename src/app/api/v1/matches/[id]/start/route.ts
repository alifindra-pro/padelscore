import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { MatchService } from '@/services/match.service';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole } from '@prisma/client';

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(request, [
      UserRole.SUPER_ADMIN,
      UserRole.ORGANIZER,
      UserRole.REFEREE,
    ]);
    const { id } = await params;

    const result = await MatchService.startMatch(id, user.userId);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = withLegacyAccess(handlePOST);
