import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { TournamentService } from '@/services/tournament.service';
import { changeTournamentStatusSchema } from '@/lib/validators/tournament';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole } from '@prisma/client';

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(request, [UserRole.SUPER_ADMIN, UserRole.ORGANIZER]);
    const { id } = await params;
    const body = await request.json();
    const { status } = changeTournamentStatusSchema.parse(body);

    const updated = await TournamentService.changeTournamentStatus(id, status, user.userId);
    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = withLegacyAccess(handlePOST);
