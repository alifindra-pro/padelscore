import prisma from '@/lib/db';
import {
  MatchStatus,
  MatchOfficialRole,
  MatchEventType,
  IdempotencyStatus,
  Prisma,
} from '@prisma/client';
import { AppError } from '@/lib/errors';
import {
  createMatchState,
  scorePoint,
  replayEvents,
} from '@/engines/scoring/scoring-engine';
import { MatchState, PointScore, Ruleset, ScoringEvent, Team } from '@/engines/scoring/types';
import { matchEventBus } from '@/lib/events';
import { createAuditLog } from './audit.service';

export interface CreateMatchParams {
  stageId: string;
  groupId?: string | null;
  courtId?: string | null;
  entryAId?: string | null;
  entryBId?: string | null;
  round?: number;
  matchNumber?: number;
  scheduledAt?: Date | string | null;
}

export interface ScorePointParams {
  matchId: string;
  team: Team;
  userId: string;
  clientVersion: number;
  idempotencyKey?: string;
  pointType?: string;
}

export interface UndoPointParams {
  matchId: string;
  userId: string;
  clientVersion: number;
  idempotencyKey?: string;
  reason?: string;
}

type MatchRecord = Prisma.MatchGetPayload<object>;
type ScoreSnapshotRecord = Prisma.MatchScoreSnapshotGetPayload<object>;

export interface ScorePointResult {
  match: MatchRecord;
  snapshot: ScoreSnapshotRecord;
  events: ScoringEvent[];
}

export interface UndoPointResult {
  match: MatchRecord;
  snapshot: ScoreSnapshotRecord;
  undoneEventId: string;
}

// Dates become ISO strings, matching what clients receive over HTTP
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
}

export class MatchService {
  static async createMatch(params: CreateMatchParams) {
    const stage = await prisma.stage.findUnique({
      where: { id: params.stageId },
      include: {
        category: {
          include: { ruleset: true },
        },
      },
    });

    if (!stage) {
      throw AppError.notFound(`Stage '${params.stageId}' not found`);
    }

    return await prisma.match.create({
      data: {
        stageId: params.stageId,
        groupId: params.groupId || null,
        courtId: params.courtId || null,
        entryAId: params.entryAId || null,
        entryBId: params.entryBId || null,
        round: params.round || 1,
        matchNumber: params.matchNumber || 1,
        scheduledAt: params.scheduledAt ? new Date(params.scheduledAt) : null,
        status: MatchStatus.SCHEDULED,
        version: 0,
      },
      include: {
        entryA: { include: { players: { include: { player: true } } } },
        entryB: { include: { players: { include: { player: true } } } },
        court: true,
      },
    });
  }

  static async getMatchById(id: string) {
    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        stage: {
          include: {
            category: {
              include: {
                ruleset: true,
                tournament: { select: { id: true, name: true, slug: true, status: true } },
              },
            },
          },
        },
        court: true,
        entryA: { include: { players: { include: { player: true } } } },
        entryB: { include: { players: { include: { player: true } } } },
        winner: true,
        officials: {
          include: {
            user: { select: { id: true, fullName: true, username: true, email: true } },
          },
        },
        sets: { orderBy: { setNumber: 'asc' } },
        scoreSnapshot: true,
        events: {
          orderBy: { sequence: 'desc' },
          take: 15,
        },
      },
    });

    if (!match) {
      throw AppError.notFound(`Match with ID '${id}' not found`);
    }

    return match;
  }

  static async getAssignedMatches(userId: string) {
    return await prisma.match.findMany({
      where: {
        officials: {
          some: { userId },
        },
      },
      include: {
        stage: {
          include: {
            category: {
              include: {
                tournament: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        },
        court: true,
        entryA: true,
        entryB: true,
        scoreSnapshot: true,
      },
      orderBy: [
        { status: 'asc' },
        { scheduledAt: 'asc' },
      ],
    });
  }

  static async assignOfficial(
    matchId: string,
    userId: string,
    role: MatchOfficialRole = MatchOfficialRole.CHAIR_UMPIRE
  ) {
    await this.getMatchById(matchId);

    return await prisma.matchOfficial.upsert({
      where: { matchId_userId: { matchId, userId } },
      update: { role },
      create: { matchId, userId, role },
    });
  }

  static async startMatch(matchId: string, userId: string) {
    const match = await this.getMatchById(matchId);

    if (match.status !== MatchStatus.SCHEDULED && match.status !== MatchStatus.WARMUP) {
      throw AppError.badRequest(`Cannot start match in status '${match.status}'`);
    }

    if (!match.entryAId || !match.entryBId) {
      throw AppError.badRequest('Match cannot start without both teams assigned');
    }

    const rulesetConfig = match.stage.category.ruleset;
    if (!rulesetConfig) {
      throw AppError.badRequest('Category ruleset not configured');
    }

    const ruleset: Ruleset = {
      setsToWin: rulesetConfig.setsToWin,
      gamesPerSet: rulesetConfig.gamesPerSet,
      tiebreakAt: rulesetConfig.tiebreakAt,
      tiebreakPoints: rulesetConfig.tiebreakPoints,
      goldenPoint: rulesetConfig.goldenPoint,
      superTiebreak: rulesetConfig.superTiebreak,
      superTiebreakPts: rulesetConfig.superTiebreakPts,
      deuceType: rulesetConfig.deuceType as Ruleset['deuceType'],
    };

    const initialEngineState = createMatchState(ruleset);

    return await prisma.$transaction(async (tx) => {
      // 1. Update Match status
      const updatedMatch = await tx.match.update({
        where: { id: matchId },
        data: {
          status: MatchStatus.IN_PROGRESS,
          startedAt: new Date(),
          version: { increment: 1 },
        },
      });

      // 2. Append MATCH_START event
      await tx.matchEvent.create({
        data: {
          matchId,
          eventType: MatchEventType.MATCH_START,
          sequence: 1,
          userId,
          version: updatedMatch.version,
        },
      });

      // 3. Create or Reset Score Snapshot
      const snapshot = await tx.matchScoreSnapshot.upsert({
        where: { matchId },
        update: {
          currentSet: initialEngineState.currentSet,
          pointsA: initialEngineState.pointsA,
          pointsB: initialEngineState.pointsB,
          setsA: initialEngineState.setsWonA,
          setsB: initialEngineState.setsWonB,
          gamesA: initialEngineState.sets.map((s) => s.gamesA),
          gamesB: initialEngineState.sets.map((s) => s.gamesB),
          server: initialEngineState.server,
          isTiebreak: initialEngineState.isTiebreak,
          tiebreakPtsA: initialEngineState.tiebreakPointsA,
          tiebreakPtsB: initialEngineState.tiebreakPointsB,
          version: updatedMatch.version,
        },
        create: {
          matchId,
          currentSet: initialEngineState.currentSet,
          pointsA: initialEngineState.pointsA,
          pointsB: initialEngineState.pointsB,
          setsA: initialEngineState.setsWonA,
          setsB: initialEngineState.setsWonB,
          gamesA: initialEngineState.sets.map((s) => s.gamesA),
          gamesB: initialEngineState.sets.map((s) => s.gamesB),
          server: initialEngineState.server,
          isTiebreak: initialEngineState.isTiebreak,
          tiebreakPtsA: initialEngineState.tiebreakPointsA,
          tiebreakPtsB: initialEngineState.tiebreakPointsB,
          version: updatedMatch.version,
        },
      });

      // 4. Initialize first MatchSet record
      await tx.matchSet.upsert({
        where: { matchId_setNumber: { matchId, setNumber: 1 } },
        update: { gamesA: 0, gamesB: 0, tiebreak: false, winnerId: null },
        create: { matchId, setNumber: 1, gamesA: 0, gamesB: 0, tiebreak: false },
      });

      // Broadcast update
      matchEventBus.publishMatchUpdate(matchId, {
        matchId,
        tournamentId: match.stage.category.tournament.id,
        status: MatchStatus.IN_PROGRESS,
        snapshot,
      });

      return { match: updatedMatch, snapshot };
    });
  }

  static async scorePoint(params: ScorePointParams) {
    const { matchId, team, userId, clientVersion, idempotencyKey, pointType } = params;

    // Check Idempotency Key
    if (idempotencyKey) {
      const existingKey = await prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });
      if (existingKey && existingKey.status === IdempotencyStatus.COMPLETED && existingKey.response) {
        return existingKey.response as unknown as ScorePointResult;
      }
    }

    return await prisma.$transaction(async (tx): Promise<ScorePointResult> => {
      // 1. Fetch match with locking query
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: {
          stage: {
            include: {
              category: {
                include: {
                  ruleset: true,
                  tournament: { select: { id: true } },
                },
              },
            },
          },
          scoreSnapshot: true,
          sets: { orderBy: { setNumber: 'asc' } },
        },
      });

      if (!match) {
        throw AppError.notFound(`Match '${matchId}' not found`);
      }

      if (match.status !== MatchStatus.IN_PROGRESS) {
        throw AppError.badRequest(`Cannot score points on match with status '${match.status}'`);
      }

      // Optimistic concurrency control check
      if (match.version !== clientVersion) {
        throw AppError.conflict(
          `Match version conflict. Client version: ${clientVersion}, Server version: ${match.version}`,
          { currentVersion: match.version, snapshot: match.scoreSnapshot }
        );
      }

      const rulesetConfig = match.stage.category.ruleset;
      if (!rulesetConfig) {
        throw AppError.badRequest('Ruleset not configured');
      }

      const ruleset: Ruleset = {
        setsToWin: rulesetConfig.setsToWin,
        gamesPerSet: rulesetConfig.gamesPerSet,
        tiebreakAt: rulesetConfig.tiebreakAt,
        tiebreakPoints: rulesetConfig.tiebreakPoints,
        goldenPoint: rulesetConfig.goldenPoint,
        superTiebreak: rulesetConfig.superTiebreak,
        superTiebreakPts: rulesetConfig.superTiebreakPts,
        deuceType: rulesetConfig.deuceType as Ruleset['deuceType'],
      };

      // 2. Reconstruct current engine state from snapshot or replay
      let currentState: MatchState;
      if (match.scoreSnapshot) {
        currentState = {
          currentSet: match.scoreSnapshot.currentSet,
          sets: match.sets.map((s) => ({
            setNumber: s.setNumber,
            gamesA: s.gamesA,
            gamesB: s.gamesB,
            isTiebreak: s.tiebreak,
            tiebreakPointsA: s.setNumber === match.scoreSnapshot!.currentSet ? match.scoreSnapshot!.tiebreakPtsA : 0,
            tiebreakPointsB: s.setNumber === match.scoreSnapshot!.currentSet ? match.scoreSnapshot!.tiebreakPtsB : 0,
            winner: s.winnerId as Team | null,
          })),
          pointsA: match.scoreSnapshot.pointsA as PointScore,
          pointsB: match.scoreSnapshot.pointsB as PointScore,
          server: (match.scoreSnapshot.server as Team) || 'A',
          isDeuce: match.scoreSnapshot.pointsA === '40' && match.scoreSnapshot.pointsB === '40',
          isTiebreak: match.scoreSnapshot.isTiebreak,
          isSuperTiebreak: match.scoreSnapshot.isTiebreak && match.scoreSnapshot.currentSet === ruleset.setsToWin * 2 - 1,
          tiebreakPointsA: match.scoreSnapshot.tiebreakPtsA,
          tiebreakPointsB: match.scoreSnapshot.tiebreakPtsB,
          isFinished: false,
          winner: null,
          setsWonA: match.scoreSnapshot.setsA,
          setsWonB: match.scoreSnapshot.setsB,
        };
      } else {
        currentState = createMatchState(ruleset);
      }

      // 3. Execute pure domain Scoring Engine
      const scoringResult = scorePoint(currentState, team, ruleset);
      const nextState = scoringResult.state;
      const nextVersion = match.version + 1;

      // 4. Fetch latest sequence number
      const lastEvent = await tx.matchEvent.findFirst({
        where: { matchId },
        orderBy: { sequence: 'desc' },
      });
      let nextSequence = (lastEvent?.sequence || 0) + 1;

      // 5. Append all emitted events
      for (const ev of scoringResult.events) {
        let eventType: MatchEventType = MatchEventType.POINT_SCORED;
        if (ev.type === 'GAME_WON') eventType = MatchEventType.GAME_WON;
        if (ev.type === 'SET_WON') eventType = MatchEventType.SET_WON;
        if (ev.type === 'MATCH_WON') eventType = MatchEventType.MATCH_WON;

        await tx.matchEvent.create({
          data: {
            matchId,
            eventType,
            team: ev.team,
            pointType: pointType || 'NORMAL',
            sequence: nextSequence++,
            version: nextVersion,
            userId,
          },
        });
      }

      // 6. Synchronize MatchSet records
      for (const s of nextState.sets) {
        await tx.matchSet.upsert({
          where: { matchId_setNumber: { matchId, setNumber: s.setNumber } },
          update: {
            gamesA: s.gamesA,
            gamesB: s.gamesB,
            tiebreak: s.isTiebreak,
            winnerId: s.winner,
          },
          create: {
            matchId,
            setNumber: s.setNumber,
            gamesA: s.gamesA,
            gamesB: s.gamesB,
            tiebreak: s.isTiebreak,
            winnerId: s.winner,
          },
        });
      }

      // 7. Check if match completed
      const matchUpdateData: Prisma.MatchUpdateInput = {
        version: nextVersion,
      };

      if (nextState.isFinished) {
        matchUpdateData.status = MatchStatus.FINISHED;
        matchUpdateData.finishedAt = new Date();
        matchUpdateData.winner = nextState.winner === 'A'
          ? { connect: { id: match.entryAId! } }
          : { connect: { id: match.entryBId! } };
      }

      const updatedMatch = await tx.match.update({
        where: { id: matchId },
        data: matchUpdateData,
      });

      // 8. Update Snapshot
      const updatedSnapshot = await tx.matchScoreSnapshot.upsert({
        where: { matchId },
        update: {
          currentSet: nextState.currentSet,
          pointsA: nextState.pointsA,
          pointsB: nextState.pointsB,
          setsA: nextState.setsWonA,
          setsB: nextState.setsWonB,
          gamesA: nextState.sets.map((s) => s.gamesA),
          gamesB: nextState.sets.map((s) => s.gamesB),
          server: nextState.server,
          isTiebreak: nextState.isTiebreak,
          tiebreakPtsA: nextState.tiebreakPointsA,
          tiebreakPtsB: nextState.tiebreakPointsB,
          version: nextVersion,
        },
        create: {
          matchId,
          currentSet: nextState.currentSet,
          pointsA: nextState.pointsA,
          pointsB: nextState.pointsB,
          setsA: nextState.setsWonA,
          setsB: nextState.setsWonB,
          gamesA: nextState.sets.map((s) => s.gamesA),
          gamesB: nextState.sets.map((s) => s.gamesB),
          server: nextState.server,
          isTiebreak: nextState.isTiebreak,
          tiebreakPtsA: nextState.tiebreakPointsA,
          tiebreakPtsB: nextState.tiebreakPointsB,
          version: nextVersion,
        },
      });

      const responsePayload = {
        match: updatedMatch,
        snapshot: updatedSnapshot,
        events: scoringResult.events,
      };

      // 9. Store Idempotency response
      if (idempotencyKey) {
        await tx.idempotencyKey.upsert({
          where: { key: idempotencyKey },
          update: {
            status: IdempotencyStatus.COMPLETED,
            response: toJson(responsePayload),
          },
          create: {
            key: idempotencyKey,
            status: IdempotencyStatus.COMPLETED,
            response: toJson(responsePayload),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
          },
        });
      }

      // 10. Broadcast Realtime
      matchEventBus.publishMatchUpdate(matchId, {
        matchId,
        tournamentId: match.stage.category.tournament.id,
        status: updatedMatch.status,
        snapshot: updatedSnapshot,
        lastEvent: scoringResult.events[0],
      });

      return responsePayload;
    });
  }

  static async undoPoint(params: UndoPointParams) {
    const { matchId, userId, clientVersion, idempotencyKey, reason } = params;

    // A retried undo must replay the stored result instead of undoing a second point
    if (idempotencyKey) {
      const existingKey = await prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });
      if (existingKey && existingKey.status === IdempotencyStatus.COMPLETED && existingKey.response) {
        return existingKey.response as unknown as UndoPointResult;
      }
    }

    return await prisma.$transaction(async (tx): Promise<UndoPointResult> => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: {
          stage: {
            include: {
              category: {
                include: {
                  ruleset: true,
                  tournament: { select: { id: true } },
                },
              },
            },
          },
        },
      });

      if (!match) throw AppError.notFound(`Match '${matchId}' not found`);

      if (match.version !== clientVersion) {
        throw AppError.conflict(
          `Version conflict on undo. Client: ${clientVersion}, Server: ${match.version}`
        );
      }

      // Find last active POINT_SCORED event
      const lastPointEvent = await tx.matchEvent.findFirst({
        where: {
          matchId,
          eventType: MatchEventType.POINT_SCORED,
          undone: false,
        },
        orderBy: { sequence: 'desc' },
      });

      if (!lastPointEvent) {
        throw AppError.badRequest('No active scoring events to undo');
      }

      // Mark event as undone
      await tx.matchEvent.update({
        where: { id: lastPointEvent.id },
        data: {
          undone: true,
          undoneBy: userId,
        },
      });

      const nextVersion = match.version + 1;

      // Append UNDO event
      const lastSeq = await tx.matchEvent.findFirst({
        where: { matchId },
        orderBy: { sequence: 'desc' },
      });
      const nextSequence = (lastSeq?.sequence || 0) + 1;

      await tx.matchEvent.create({
        data: {
          matchId,
          eventType: MatchEventType.UNDO,
          sequence: nextSequence,
          version: nextVersion,
          reason: reason || `Undid point at sequence ${lastPointEvent.sequence}`,
          userId,
        },
      });

      // Fetch all remaining valid active scoring events in chronological order
      const validEvents = await tx.matchEvent.findMany({
        where: {
          matchId,
          eventType: MatchEventType.POINT_SCORED,
          undone: false,
        },
        orderBy: { sequence: 'asc' },
      });

      const rulesetConfig = match.stage.category.ruleset!;
      const ruleset: Ruleset = {
        setsToWin: rulesetConfig.setsToWin,
        gamesPerSet: rulesetConfig.gamesPerSet,
        tiebreakAt: rulesetConfig.tiebreakAt,
        tiebreakPoints: rulesetConfig.tiebreakPoints,
        goldenPoint: rulesetConfig.goldenPoint,
        superTiebreak: rulesetConfig.superTiebreak,
        superTiebreakPts: rulesetConfig.superTiebreakPts,
        deuceType: rulesetConfig.deuceType as Ruleset['deuceType'],
      };

      // Replay all events deterministically from scratch
      const pointActions = validEvents
        .filter((e) => e.team === 'A' || e.team === 'B')
        .map((e) => ({ team: e.team as Team }));

      const reconstructedState = replayEvents(pointActions, ruleset);

      // Synchronize MatchSets
      // First reset future sets if any
      await tx.matchSet.deleteMany({
        where: {
          matchId,
          setNumber: { gt: reconstructedState.sets.length },
        },
      });

      for (const s of reconstructedState.sets) {
        await tx.matchSet.upsert({
          where: { matchId_setNumber: { matchId, setNumber: s.setNumber } },
          update: {
            gamesA: s.gamesA,
            gamesB: s.gamesB,
            tiebreak: s.isTiebreak,
            winnerId: s.winner,
          },
          create: {
            matchId,
            setNumber: s.setNumber,
            gamesA: s.gamesA,
            gamesB: s.gamesB,
            tiebreak: s.isTiebreak,
            winnerId: s.winner,
          },
        });
      }

      // Update match status & version
      const updatedMatch = await tx.match.update({
        where: { id: matchId },
        data: {
          version: nextVersion,
          status: MatchStatus.IN_PROGRESS,
          winnerId: null,
          finishedAt: null,
        },
      });

      // Update Snapshot
      const updatedSnapshot = await tx.matchScoreSnapshot.upsert({
        where: { matchId },
        update: {
          currentSet: reconstructedState.currentSet,
          pointsA: reconstructedState.pointsA,
          pointsB: reconstructedState.pointsB,
          setsA: reconstructedState.setsWonA,
          setsB: reconstructedState.setsWonB,
          gamesA: reconstructedState.sets.map((s) => s.gamesA),
          gamesB: reconstructedState.sets.map((s) => s.gamesB),
          server: reconstructedState.server,
          isTiebreak: reconstructedState.isTiebreak,
          tiebreakPtsA: reconstructedState.tiebreakPointsA,
          tiebreakPtsB: reconstructedState.tiebreakPointsB,
          version: nextVersion,
        },
        create: {
          matchId,
          currentSet: reconstructedState.currentSet,
          pointsA: reconstructedState.pointsA,
          pointsB: reconstructedState.pointsB,
          setsA: reconstructedState.setsWonA,
          setsB: reconstructedState.setsWonB,
          gamesA: reconstructedState.sets.map((s) => s.gamesA),
          gamesB: reconstructedState.sets.map((s) => s.gamesB),
          server: reconstructedState.server,
          isTiebreak: reconstructedState.isTiebreak,
          tiebreakPtsA: reconstructedState.tiebreakPointsA,
          tiebreakPtsB: reconstructedState.tiebreakPointsB,
          version: nextVersion,
        },
      });

      const responsePayload = {
        match: updatedMatch,
        snapshot: updatedSnapshot,
        undoneEventId: lastPointEvent.id,
      };

      if (idempotencyKey) {
        await tx.idempotencyKey.upsert({
          where: { key: idempotencyKey },
          update: {
            status: IdempotencyStatus.COMPLETED,
            response: toJson(responsePayload),
          },
          create: {
            key: idempotencyKey,
            status: IdempotencyStatus.COMPLETED,
            response: toJson(responsePayload),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
          },
        });
      }

      matchEventBus.publishMatchUpdate(matchId, {
        matchId,
        tournamentId: match.stage.category.tournament.id,
        status: MatchStatus.IN_PROGRESS,
        snapshot: updatedSnapshot,
      });

      return responsePayload;
    });
  }

  static async finishMatch(matchId: string, userId: string) {
    const match = await this.getMatchById(matchId);

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.match.update({
        where: { id: matchId },
        data: {
          status: MatchStatus.FINISHED,
          finishedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await tx.matchEvent.create({
        data: {
          matchId,
          eventType: MatchEventType.MATCH_FINISH,
          sequence: (match.events[0]?.sequence || 0) + 1,
          version: updated.version,
          userId,
        },
      });

      matchEventBus.publishMatchUpdate(matchId, {
        matchId,
        tournamentId: match.stage.category.tournament.id,
        status: MatchStatus.FINISHED,
      });

      return updated;
    });
  }

  static async approveResult(matchId: string, userId: string) {
    const match = await this.getMatchById(matchId);

    if (match.status !== MatchStatus.FINISHED) {
      throw AppError.badRequest(`Cannot approve match in status '${match.status}'. Must be FINISHED.`);
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.match.update({
        where: { id: matchId },
        data: {
          status: MatchStatus.APPROVED,
          version: { increment: 1 },
        },
      });

      await tx.matchEvent.create({
        data: {
          matchId,
          eventType: MatchEventType.MATCH_APPROVED,
          sequence: (match.events[0]?.sequence || 0) + 1,
          version: updated.version,
          userId,
        },
      });

      await createAuditLog({
        userId,
        tournamentId: match.stage.category.tournament.id,
        action: 'APPROVE_MATCH_RESULT',
        entityType: 'Match',
        entityId: matchId,
        after: { status: MatchStatus.APPROVED, winnerId: match.winnerId },
      }, tx);

      matchEventBus.publishMatchUpdate(matchId, {
        matchId,
        tournamentId: match.stage.category.tournament.id,
        status: MatchStatus.APPROVED,
      });

      return updated;
    });
  }

  static async reopenMatch(matchId: string, userId: string, reason: string) {
    const match = await this.getMatchById(matchId);

    if (match.status !== MatchStatus.FINISHED && match.status !== MatchStatus.APPROVED) {
      throw AppError.badRequest('Can only reopen finished or approved matches');
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.match.update({
        where: { id: matchId },
        data: {
          status: MatchStatus.IN_PROGRESS,
          version: { increment: 1 },
        },
      });

      await tx.matchEvent.create({
        data: {
          matchId,
          eventType: MatchEventType.MATCH_REOPENED,
          sequence: (match.events[0]?.sequence || 0) + 1,
          version: updated.version,
          reason,
          userId,
        },
      });

      await createAuditLog({
        userId,
        tournamentId: match.stage.category.tournament.id,
        action: 'REOPEN_MATCH',
        entityType: 'Match',
        entityId: matchId,
        before: { status: match.status },
        after: { status: MatchStatus.IN_PROGRESS, reason },
      }, tx);

      matchEventBus.publishMatchUpdate(matchId, {
        matchId,
        tournamentId: match.stage.category.tournament.id,
        status: MatchStatus.IN_PROGRESS,
      });

      return updated;
    });
  }

  static async getMatchEvents(matchId: string) {
    return await prisma.matchEvent.findMany({
      where: { matchId },
      orderBy: { sequence: 'asc' },
    });
  }
}
