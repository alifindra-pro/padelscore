import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireTournamentAdmin } from "@/lib/v2/tournament-admin";
import { handleApiError } from "@/lib/errors";
import type { ScoreState } from "../../../../../../../packages/core/src";

type Context = { params: Promise<{ id: string }> };

/**
 * Results report for organizers: every played match with its score, how it
 * ended, the court, who recorded it, when, and whether it is approved.
 */
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const { id } = await ctx.params;
    await requireTournamentAdmin(req, id);
    const rows = await prisma.match.findMany({
      where: {
        stage: { category: { tournamentId: id } },
        OR: [
          {
            status: {
              in: ["IN_PROGRESS", "SUSPENDED", "FINISHED", "APPROVED"],
            },
          },
          { approvalStatus: "APPROVED" },
        ],
      },
      select: {
        id: true,
        matchNumber: true,
        round: true,
        status: true,
        approvalStatus: true,
        engineVersion: true,
        startedAt: true,
        finishedAt: true,
        scheduledAt: true,
        winnerId: true,
        entryAId: true,
        entryBId: true,
        stateV2: true,
        entryA: { select: { name: true } },
        entryB: { select: { name: true } },
        court: {
          select: { name: true, refereeUser: { select: { fullName: true } } },
        },
        group: { select: { name: true } },
        stage: { select: { name: true, category: { select: { name: true } } } },
        scoreSnapshot: { select: { gamesA: true, gamesB: true } },
        officials: { select: { user: { select: { fullName: true } } } },
        actionEvents: { select: { userId: true }, distinct: ["userId"] },
        _count: { select: { disputes: { where: { status: "PENDING" } } } },
      },
      orderBy: [{ finishedAt: "desc" }, { startedAt: "desc" }],
    });
    // Who actually pressed the buttons, by name.
    const scorerIds = [
      ...new Set(rows.flatMap((r) => r.actionEvents.map((e) => e.userId))),
    ];
    const scorers = new Map(
      (
        await prisma.user.findMany({
          where: { id: { in: scorerIds } },
          select: { id: true, fullName: true },
        })
      ).map((u) => [u.id, u.fullName]),
    );
    const data = rows.map((r) => {
      const state = r.stateV2 as unknown as ScoreState | null;
      const sets =
        state?.sets?.map((s) =>
          s.kind === "MATCH_TIEBREAK"
            ? [s.tiebreak[0], s.tiebreak[1]]
            : [s.games[0], s.games[1]],
        ) ??
        (r.scoreSnapshot?.gamesA ?? []).map((a, i) => [
          a,
          r.scoreSnapshot?.gamesB[i] ?? 0,
        ]);
      const approved =
        r.approvalStatus === "APPROVED" || r.status === "APPROVED";
      return {
        id: r.id,
        matchNumber: r.matchNumber,
        category: r.stage.category.name,
        stage: r.group?.name ?? r.stage.name,
        court: r.court?.name ?? null,
        teamA: r.entryA?.name ?? "—",
        teamB: r.entryB?.name ?? "—",
        winner:
          r.winnerId && r.winnerId === r.entryAId
            ? "A"
            : r.winnerId && r.winnerId === r.entryBId
              ? "B"
              : null,
        sets,
        // COMPLETED, RETIRED, WALKOVER or DISQUALIFIED once finished.
        outcome: state?.status ?? null,
        state: approved
          ? "APPROVED"
          : r.status === "FINISHED"
            ? "AWAITING_APPROVAL"
            : "PLAYING",
        engineVersion: r.engineVersion,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        referee:
          [
            ...new Set([
              ...r.actionEvents.map((e) => scorers.get(e.userId) ?? ""),
              ...r.officials.map((o) => o.user.fullName),
            ]),
          ]
            .filter(Boolean)
            .join(", ") ||
          r.court?.refereeUser?.fullName ||
          null,
        pendingDisputes: r._count.disputes,
      };
    });
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
