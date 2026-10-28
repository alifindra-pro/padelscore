import { withLegacyAccess } from '@/lib/v2/access';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { handleApiError, AppError } from '@/lib/errors';

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const tournament = await prisma.tournament.findUnique({
      where: { slug },
      include: {
        categories: {
          include: {
            ruleset: true,
            entries: {
              include: { players: { include: { player: true } } },
              orderBy: { seed: 'asc' },
            },
            stages: {
              include: {
                groups: {
                  include: {
                    standings: {
                      include: { entry: true },
                      orderBy: [{ points: 'desc' }, { rank: 'asc' }],
                    },
                  },
                },
                matches: {
                  include: {
                    entryA: true,
                    entryB: true,
                    court: true,
                    scoreSnapshot: true,
                    winner: true,
                  },
                  orderBy: { matchNumber: 'asc' },
                },
              },
              orderBy: { order: 'asc' },
            },
          },
        },
        courts: {
          where: { isActive: true },
          orderBy: { priority: 'desc' },
        },
      },
    });

    if (!tournament) {
      throw AppError.notFound(`Tournament with slug '${slug}' not found`);
    }

    return NextResponse.json({ data: tournament });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
