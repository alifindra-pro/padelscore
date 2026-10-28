import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { TournamentService } from '@/services/tournament.service';
import { updateTournamentSchema } from '@/lib/validators/tournament';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole } from '@prisma/client';

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tournament = await TournamentService.getTournamentById(id);
    return NextResponse.json({ data: tournament });
  } catch (error) {
    return handleApiError(error);
  }
}

async function handlePATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(request, [UserRole.SUPER_ADMIN, UserRole.ORGANIZER]);
    const { id } = await params;
    const body = await request.json();
    const validated = updateTournamentSchema.parse(body);

    const updated = await TournamentService.updateTournament(id, {
      ...validated,
      userId: user.userId,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
export const PATCH = withLegacyAccess(handlePATCH);
