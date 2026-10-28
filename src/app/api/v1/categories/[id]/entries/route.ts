import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { EntryService } from '@/services/entry.service';
import { createEntrySchema } from '@/lib/validators/tournament';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole } from '@prisma/client';

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const entries = await EntryService.listByCategory(id);
    return NextResponse.json({ data: entries });
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
    const validated = createEntrySchema.parse(body);

    const entry = await EntryService.createEntry({
      categoryId: id,
      name: validated.name,
      playerIds: validated.playerIds,
      seed: validated.seed,
      userId: user.userId,
    });

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
export const POST = withLegacyAccess(handlePOST);
