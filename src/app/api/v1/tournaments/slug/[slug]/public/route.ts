import { withLegacyAccess } from "@/lib/v2/access";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { handleApiError, AppError } from "@/lib/errors";
import { rulesSummary } from "@/lib/rules-summary";
import type { Rules } from "../../../../../../../../packages/core/src";

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
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
              orderBy: { seed: "asc" },
            },
            stages: {
              include: {
                groups: {
                  include: {
                    standings: {
                      include: {
                        entry: {
                          include: {
                            players: {
                              select: {
                                player: {
                                  select: { id: true, fullName: true },
                                },
                              },
                            },
                          },
                        },
                      },
                      orderBy: [{ points: "desc" }, { rank: "asc" }],
                    },
                  },
                },
                matches: {
                  include: {
                    entryA: {
                      include: {
                        players: {
                          select: {
                            player: { select: { id: true, fullName: true } },
                          },
                        },
                      },
                    },
                    entryB: {
                      include: {
                        players: {
                          select: {
                            player: { select: { id: true, fullName: true } },
                          },
                        },
                      },
                    },
                    court: true,
                    scoreSnapshot: true,
                    winner: true,
                  },
                  orderBy: { matchNumber: "asc" },
                },
              },
              orderBy: { order: "asc" },
            },
          },
        },
        courts: {
          where: { isActive: true },
          orderBy: { priority: "desc" },
        },
      },
    });

    if (!tournament) {
      throw AppError.notFound(`Tournament with slug '${slug}' not found`);
    }

    // Public pages get rules as plain sentences; the raw rule objects are not exposed.
    const withRules = {
      ...tournament,
      categories: tournament.categories.map((c) => ({
        ...c,
        rulesSummary: rulesSummary(
          c.format,
          c.rulesV2 as unknown as Rules | null,
          c.qualificationPolicy as Parameters<typeof rulesSummary>[2],
          c.maxEntries,
        ),
      })),
    };
    return NextResponse.json({ data: withRules });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = withLegacyAccess(handleGET);
