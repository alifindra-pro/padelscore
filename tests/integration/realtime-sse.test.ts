import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../../src/lib/db';
import { matchEventBus } from '../../src/lib/events';
import { TournamentService } from '../../src/services/tournament.service';
import { CategoryService } from '../../src/services/category.service';
import { CourtService } from '../../src/services/court.service';
import { PlayerService } from '../../src/services/player.service';
import { EntryService } from '../../src/services/entry.service';
import { MatchService } from '../../src/services/match.service';
import { hashPassword } from '../../src/lib/auth';
import {
  CategoryFormat,
  StageType,
  UserRole,
  type Category,
  type Court,
  type Match,
  type Stage,
  type Tournament,
  type User,
} from '@prisma/client';

type ScorePayload = {
  matchId: string;
  tournamentId: string;
  snapshot: { pointsA: string; pointsB: string };
};

describe('Phase 3 Integration: Realtime Event Bus & SSE Broadcast', () => {
  let tournament: Tournament;
  let category: Category;
  let stage: Stage;
  let court: Court;
  let match: Match;
  let refereeUser: User;

  beforeAll(async () => {
    const passwordHash = await hashPassword('Pass1234!');
    refereeUser = await prisma.user.upsert({
      where: { email: 'ref_sse@test.com' },
      update: {},
      create: {
        email: 'ref_sse@test.com',
        username: 'ref_sse_' + Date.now(),
        fullName: 'SSE Umpire',
        passwordHash,
        role: UserRole.REFEREE,
      },
    });

    tournament = await TournamentService.createTournament({
      name: 'Barcelona SSE Open 2026',
      slug: 'bcn-sse-' + Date.now(),
      startDate: new Date('2026-11-10T08:00:00Z'),
      endDate: new Date('2026-11-12T18:00:00Z'),
      userId: refereeUser.id,
    });

    category = await CategoryService.createCategory({
      tournamentId: tournament.id,
      name: 'Open A',
      format: CategoryFormat.SINGLE_ELIMINATION,
      userId: refereeUser.id,
    });

    stage = await prisma.stage.create({
      data: {
        categoryId: category.id,
        name: 'Quarterfinals',
        type: StageType.SINGLE_ELIMINATION,
        order: 1,
        config: {},
      },
    });

    court = await CourtService.createCourt({
      tournamentId: tournament.id,
      name: 'Court 1 Live',
      priority: 5,
      userId: refereeUser.id,
    });

    const p1 = await PlayerService.createPlayer({ fullName: 'Player A1' });
    const p2 = await PlayerService.createPlayer({ fullName: 'Player A2' });
    const p3 = await PlayerService.createPlayer({ fullName: 'Player B1' });
    const p4 = await PlayerService.createPlayer({ fullName: 'Player B2' });

    const entryA = await EntryService.createEntry({
      categoryId: category.id,
      name: 'Team Alpha',
      playerIds: [p1.id, p2.id],
      userId: refereeUser.id,
    });

    const entryB = await EntryService.createEntry({
      categoryId: category.id,
      name: 'Team Beta',
      playerIds: [p3.id, p4.id],
      userId: refereeUser.id,
    });

    match = await MatchService.createMatch({
      stageId: stage.id,
      courtId: court.id,
      entryAId: entryA.id,
      entryBId: entryB.id,
    });

    await MatchService.startMatch(match.id, refereeUser.id);
  });

  afterAll(async () => {
    if (tournament?.id) {
      await prisma.tournament.delete({ where: { id: tournament.id } }).catch(() => {});
    }
  });

  it('1. EventBus notifies match subscriber when a point is scored in database', async () => {
    const received: ScorePayload[] = [];

    const unsubscribe = matchEventBus.subscribeToMatch(match.id, (payload) => {
      received.push(payload as ScorePayload);
    });

    // Score point
    await MatchService.scorePoint({
      matchId: match.id,
      team: 'A',
      clientVersion: 1,
      userId: refereeUser.id,
    });

    expect(received).toHaveLength(1);
    expect(received[0].matchId).toBe(match.id);
    expect(received[0].snapshot.pointsA).toBe('15');

    unsubscribe();
  });

  it('2. EventBus notifies tournament subscriber of matches in that tournament', async () => {
    const received: ScorePayload[] = [];

    const unsubscribe = matchEventBus.subscribeToTournament(tournament.id, (payload) => {
      received.push(payload as ScorePayload);
    });

    // Score another point
    await MatchService.scorePoint({
      matchId: match.id,
      team: 'B',
      clientVersion: 2,
      userId: refereeUser.id,
    });

    expect(received).toHaveLength(1);
    expect(received[0].tournamentId).toBe(tournament.id);
    expect(received[0].snapshot.pointsB).toBe('15');

    unsubscribe();
  });
});
