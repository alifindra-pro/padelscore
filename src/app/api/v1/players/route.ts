import { organizationFor } from '@/lib/v2/access';
import { requireAuth } from '@/middleware/auth.middleware';
import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { PlayerService } from '@/services/player.service';
import { createPlayerSchema } from '@/lib/validators/tournament';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole } from '@prisma/client';

async function handleGET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const search = searchParams.get('search') || undefined;

    const result = await PlayerService.listPlayers({ page, limit, search, organizationId: await organizationFor(await requireAuth(request), searchParams.get('organizationId') || request.headers.get('X-Organization-Id') || undefined) });
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}

async function handlePOST(request: NextRequest) {
  try {
    const user = await requireRole(request, [UserRole.SUPER_ADMIN, UserRole.ORGANIZER]);
    const body = await request.json();
    const validated = createPlayerSchema.parse(body);

    const player = await PlayerService.createPlayer({ ...validated, organizationId: await organizationFor(user, body.organizationId ?? request.headers.get('X-Organization-Id') ?? undefined) });
    return NextResponse.json({ data: player }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
export const POST = withLegacyAccess(handlePOST);
