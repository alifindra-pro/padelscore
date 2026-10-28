import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import { TournamentService } from '@/services/tournament.service';
import { createTournamentSchema } from '@/lib/validators/tournament';
import prisma from '@/lib/db';
import { organizationFor } from '@/lib/v2/access';
import { PUBLIC_STATUSES } from '@/lib/v2/access';
import { getAuthUser } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/auth.middleware';
import { handleApiError } from '@/lib/errors';
import { UserRole, TournamentStatus } from '@prisma/client';

async function handleGET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const status = searchParams.get('status') as TournamentStatus | undefined;
    const search = searchParams.get('search') || undefined;

    const user = await getAuthUser(request);
    const memberOrgs = user ? await prisma.organizationMember.findMany({ where: { userId: user.userId } }) : [];
    const accessWhere = user?.role === 'SUPER_ADMIN' ? {} : user && user.role !== 'VIEWER' ? { OR: [{ members: { some: { userId: user.userId } } }, { organizationId: { in: memberOrgs.map(m => m.organizationId) } }] } : { status: { in: PUBLIC_STATUSES as import('@prisma/client').TournamentStatus[] } };
    const result = await TournamentService.listTournaments({
      accessWhere: request.headers.get("X-Organization-Id") && user ? { AND: [accessWhere, { organizationId: request.headers.get("X-Organization-Id")! }] } : accessWhere,
      page,
      limit,
      status,
      search,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}

async function handlePOST(request: NextRequest) {
  try {
    const user = await requireRole(request, [UserRole.SUPER_ADMIN, UserRole.ORGANIZER]);
    const body = await request.json();
    const validated = createTournamentSchema.parse(body);

    const tournament = await TournamentService.createTournament({
      ...validated,
      organizationId: await organizationFor(user, body.organizationId ?? request.headers.get('X-Organization-Id') ?? undefined),
      userId: user.userId,
    });

    return NextResponse.json({ data: tournament }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
export const POST = withLegacyAccess(handlePOST);
