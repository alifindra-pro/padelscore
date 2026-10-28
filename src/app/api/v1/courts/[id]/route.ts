import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { CourtService } from '@/services/court.service';
import { updateCourtSchema } from '@/lib/validators/tournament';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole } from '@prisma/client';

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const court = await CourtService.getCourtById(id);
    return NextResponse.json({ data: court });
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
    const validated = updateCourtSchema.parse(body);

    const updated = await CourtService.updateCourt(id, {
      ...validated,
      userId: user.userId,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

async function handleDELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(request, [UserRole.SUPER_ADMIN, UserRole.ORGANIZER]);
    const { id } = await params;

    const result = await CourtService.deleteCourt(id, user.userId);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
export const PATCH = withLegacyAccess(handlePATCH);
export const DELETE = withLegacyAccess(handleDELETE);
