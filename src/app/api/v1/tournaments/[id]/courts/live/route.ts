import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { handleApiError } from '@/lib/errors';

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    const courts = await prisma.court.findMany({
      where: { tournamentId, isActive: true },
      orderBy: { priority: 'desc' },
    });
    const courtIds = courts.map((c) => c.id);
    const matchInclude = {
      entryA: { include: { players: { include: { player: true } } } },
      entryB: { include: { players: { include: { player: true } } } },
      scoreSnapshot: true,
      stage: { include: { category: true } },
    } satisfies Prisma.MatchInclude;

    // Queried separately: MatchStatus sorts SCHEDULED before IN_PROGRESS, so a
    // single "take 2" query could drop the live match behind scheduled ones.
    const [activeMatches, nextMatches] = await Promise.all([
      prisma.match.findMany({
        where: { courtId: { in: courtIds }, status: { in: ['IN_PROGRESS', 'WARMUP'] } },
        include: matchInclude,
        orderBy: [{ startedAt: 'desc' }],
      }),
      prisma.match.findMany({
        where: { courtId: { in: courtIds }, status: 'SCHEDULED' },
        include: matchInclude,
        orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { matchNumber: 'asc' }],
      }),
    ]);

    const formatted = courts.map((c) => ({
      courtId: c.id,
      courtName: c.name,
      priority: c.priority,
      activeMatch: activeMatches.find((m) => m.courtId === c.id) || null,
      nextMatch: nextMatches.find((m) => m.courtId === c.id) || null,
    }));

    return NextResponse.json({ data: formatted });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
