import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { CourtService } from '@/services/court.service';
import { createCourtSchema } from '@/lib/validators/tournament';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole } from '@prisma/client';

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const courts = await CourtService.listByTournament(id);
    return NextResponse.json({ data: courts });
  } catch (error) {
    return handleApiError(error);
  }
}

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(request, [UserRole.SUPER_ADMIN, UserRole.ORGANIZER]);
    const { id } = await params;
    const body = await request.json();
    const validated = createCourtSchema.parse(body);

    const court = await CourtService.createCourt({
      tournamentId: id,
      name: validated.name,
      isActive: validated.isActive,
      priority: validated.priority,
      userId: user.userId,
    });

    return NextResponse.json({ data: court }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
export const POST = withLegacyAccess(handlePOST);
