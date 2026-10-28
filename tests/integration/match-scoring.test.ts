import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../../src/lib/db';
import { TournamentService } from '../../src/services/tournament.service';
import { CategoryService } from '../../src/services/category.service';
import { PlayerService } from '../../src/services/player.service';
import { EntryService } from '../../src/services/entry.service';
import { CourtService } from '../../src/services/court.service';
import { MatchService } from '../../src/services/match.service';
import { hashPassword } from '../../src/lib/auth';
import {
  CategoryFormat,
  MatchStatus,
  UserRole,
  StageType,
  type Category,
  type Court,
  type Entry,
  type Match,
  type Stage,
  type Tournament,
  type User,
} from '@prisma/client';

describe('Phase 2 Integration: Match Scoring Lifecycle, Concurrency & Idempotency', () => {
  let organizerUser: User;
  let refereeUser: User;
  let tournament: Tournament;
  let category: Category;
  let stage: Stage;
  let court: Court;
  let entryA: Entry;
  let entryB: Entry;
  let match: Match;

  beforeAll(async () => {
    const passwordHash = await hashPassword('SecurePadelPass2026!');

    organizerUser = await prisma.user.upsert({
      where: { email: 'organizer_scoring@test.com' },
      update: {},
      create: {
        email: 'organizer_scoring@test.com',
        username: 'org_' + Date.now(),
        fullName: 'Match Organizer',
        passwordHash,
        role: UserRole.ORGANIZER,
      },
    });

    refereeUser = await prisma.user.upsert({
      where: { email: 'referee_scoring@test.com' },
      update: {},
      create: {
        email: 'referee_scoring@test.com',
        username: 'ref_' + Date.now(),
        fullName: 'Court Umpire',
        passwordHash,
        role: UserRole.REFEREE,
      },
    });

    // 1. Setup tournament
    tournament = await TournamentService.createTournament({
      name: 'Madrid Master Padel 2026',
      slug: 'madrid-master-' + Date.now(),
      startDate: new Date('2026-12-01T08:00:00Z'),
      endDate: new Date('2026-12-05T18:00:00Z'),
      userId: organizerUser.id,
    });

    // 2. Setup category with Golden Point
    category = await CategoryService.createCategory({
      tournamentId: tournament.id,
      name: 'Pro Open',
      format: CategoryFormat.SINGLE_ELIMINATION,
      maxEntries: 8,
      ruleset: {
        setsToWin: 2,
        gamesPerSet: 6,
        goldenPoint: true,
      },
      userId: organizerUser.id,
    });

    // 3. Setup stage
    stage = await prisma.stage.create({
      data: {
        categoryId: category.id,
        name: 'Main Draw',
        type: StageType.SINGLE_ELIMINATION,
        order: 1,
        config: {},
      },
    });

    // 4. Setup Court
    court = await CourtService.createCourt({
      tournamentId: tournament.id,
      name: 'Pista Central',
      priority: 10,
      userId: organizerUser.id,
    });

    // 5. Setup Entries
    const p1 = await PlayerService.createPlayer({ fullName: 'Paquito Navarro' });
    const p2 = await PlayerService.createPlayer({ fullName: 'Martin Di Nenno' });
    entryA = await EntryService.createEntry({
      categoryId: category.id,
      name: 'Navarro / Di Nenno',
      playerIds: [p1.id, p2.id],
      seed: 1,
      userId: organizerUser.id,
    });

    const p3 = await PlayerService.createPlayer({ fullName: 'Agustin Tapia' });
    const p4 = await PlayerService.createPlayer({ fullName: 'Arturo Coello' });
    entryB = await EntryService.createEntry({
      categoryId: category.id,
      name: 'Tapia / Coello',
      playerIds: [p3.id, p4.id],
      seed: 2,
      userId: organizerUser.id,
    });
  });

  afterAll(async () => {
    if (tournament?.id) {
      await prisma.tournament.delete({ where: { id: tournament.id } }).catch(() => {});
    }
  });

  it('1. Creates a scheduled match and assigns referee', async () => {
    match = await MatchService.createMatch({
      stageId: stage.id,
      courtId: court.id,
      entryAId: entryA.id,
      entryBId: entryB.id,
      round: 1,
      matchNumber: 1,
    });

    expect(match).toBeDefined();
    expect(match.status).toBe(MatchStatus.SCHEDULED);
    expect(match.version).toBe(0);

    const official = await MatchService.assignOfficial(match.id, refereeUser.id);
    expect(official).toBeDefined();
    expect(official.userId).toBe(refereeUser.id);
  });

  it('2. Starts match: initializes version, snapshot, and sets status to IN_PROGRESS', async () => {
    const started = await MatchService.startMatch(match.id, refereeUser.id);
    expect(started.match.status).toBe(MatchStatus.IN_PROGRESS);
    expect(started.match.version).toBe(1);
    expect(started.snapshot.pointsA).toBe('0');
    expect(started.snapshot.pointsB).toBe('0');
    expect(started.snapshot.gamesA).toEqual([0]);

    match = started.match;
  });

  it('3. Scores consecutive points (0 -> 15 -> 30 -> 40 -> Game A)', async () => {
    // Point 1 (15-0)
    let res = await MatchService.scorePoint({
      matchId: match.id,
      team: 'A',
      clientVersion: 1,
      userId: refereeUser.id,
    });
    expect(res.snapshot.pointsA).toBe('15');
    expect(res.snapshot.version).toBe(2);

    // Point 2 (30-0)
    res = await MatchService.scorePoint({
      matchId: match.id,
      team: 'A',
      clientVersion: 2,
      userId: refereeUser.id,
    });
    expect(res.snapshot.pointsA).toBe('30');

    // Point 3 (40-0)
    res = await MatchService.scorePoint({
      matchId: match.id,
      team: 'A',
      clientVersion: 3,
      userId: refereeUser.id,
    });
    expect(res.snapshot.pointsA).toBe('40');

    // Point 4 (Game won for A: 1-0)
    res = await MatchService.scorePoint({
      matchId: match.id,
      team: 'A',
      clientVersion: 4,
      userId: refereeUser.id,
    });
    expect(res.snapshot.pointsA).toBe('0');
    expect(res.snapshot.pointsB).toBe('0');
    expect(res.snapshot.gamesA).toEqual([1]);
    expect(res.snapshot.gamesB).toEqual([0]);

    match = res.match;
  });

  it('4. Enforces Golden Point (Punto de Oro) at 40-40', async () => {
    let currentVer = match.version;

    // Bring game 2 to 40-40
    // Team A: 40
    for (let i = 0; i < 3; i++) {
      const res = await MatchService.scorePoint({
        matchId: match.id,
        team: 'A',
        clientVersion: currentVer++,
        userId: refereeUser.id,
      });
      match = res.match;
    }

    // Team B: 40
    for (let i = 0; i < 3; i++) {
      const res = await MatchService.scorePoint({
        matchId: match.id,
        team: 'B',
        clientVersion: currentVer++,
        userId: refereeUser.id,
      });
      match = res.match;
    }

    // Snapshot should be 40-40
    const current = await MatchService.getMatchById(match.id);
    expect(current.scoreSnapshot?.pointsA).toBe('40');
    expect(current.scoreSnapshot?.pointsB).toBe('40');

    // Golden Point: next point by Team B wins the game immediately!
    const goldenRes = await MatchService.scorePoint({
      matchId: match.id,
      team: 'B',
      clientVersion: currentVer,
      userId: refereeUser.id,
    });

    expect(goldenRes.snapshot.pointsA).toBe('0');
    expect(goldenRes.snapshot.pointsB).toBe('0');
    expect(goldenRes.snapshot.gamesA).toEqual([1]);
    expect(goldenRes.snapshot.gamesB).toEqual([1]); // 1-1 in games

    match = goldenRes.match;
  });

  it('5. Rejects stale client versions with 409 Conflict (Optimistic Concurrency Control)', async () => {
    const staleVersion = match.version - 2;

    await expect(
      MatchService.scorePoint({
        matchId: match.id,
        team: 'A',
        clientVersion: staleVersion,
        userId: refereeUser.id,
      })
    ).rejects.toThrow(/version conflict/i);
  });

  it('6. Guarantees Idempotency: duplicate request with same key returns cached response', async () => {
    const idempotencyKey = 'req_idempotent_' + Date.now();
    const currentVer = match.version;

    const firstRes = await MatchService.scorePoint({
      matchId: match.id,
      team: 'A',
      clientVersion: currentVer,
      idempotencyKey,
      userId: refereeUser.id,
    });

    // Duplicate call with same key
    const duplicateRes = await MatchService.scorePoint({
      matchId: match.id,
      team: 'A',
      clientVersion: currentVer,
      idempotencyKey,
      userId: refereeUser.id,
    });

    expect(duplicateRes.snapshot.pointsA).toBe(firstRes.snapshot.pointsA);
    expect(duplicateRes.snapshot.version).toBe(firstRes.snapshot.version);

    // Verify database only scored 1 point
    const fresh = await MatchService.getMatchById(match.id);
    expect(fresh.version).toBe(firstRes.snapshot.version);
    match = fresh;
  });

  it('7. Undoes last point cleanly and recalculates state from event store', async () => {
    const beforeUndo = await MatchService.getMatchById(match.id);
    expect(beforeUndo.scoreSnapshot?.pointsA).toBe('15');

    const undoRes = await MatchService.undoPoint({
      matchId: match.id,
      userId: refereeUser.id,
      clientVersion: beforeUndo.version,
      reason: 'Overruled by chair umpire',
    });

    expect(undoRes.snapshot.pointsA).toBe('0');
    expect(undoRes.snapshot.pointsB).toBe('0');

    // Verify UNDO event exists in audit trail
    const events = await MatchService.getMatchEvents(match.id);
    const lastEvent = events[events.length - 1];
    expect(lastEvent.eventType).toBe('UNDO');
    expect(lastEvent.reason).toBe('Overruled by chair umpire');
  });

  it('7b. Retried undo with the same idempotency key retracts only one point', async () => {
    let current = await MatchService.getMatchById(match.id);
    for (let i = 0; i < 2; i++) {
      await MatchService.scorePoint({
        matchId: match.id,
        team: 'A',
        clientVersion: current.version,
        userId: refereeUser.id,
      });
      current = await MatchService.getMatchById(match.id);
    }
    expect(current.scoreSnapshot?.pointsA).toBe('30');

    const idempotencyKey = 'undo_idempotent_' + Date.now();
    const undo = () =>
      MatchService.undoPoint({
        matchId: match.id,
        userId: refereeUser.id,
        clientVersion: current.version,
        idempotencyKey,
        reason: 'Network retry',
      });
    const firstRes = await undo();
    const retryRes = await undo();

    expect(firstRes.snapshot.pointsA).toBe('15');
    expect(retryRes.snapshot.pointsA).toBe('15');
    expect(retryRes.undoneEventId).toBe(firstRes.undoneEventId);

    const fresh = await MatchService.getMatchById(match.id);
    expect(fresh.version).toBe(current.version + 1);
    expect(fresh.scoreSnapshot?.pointsA).toBe('15');
    const undoEvents = (await MatchService.getMatchEvents(match.id)).filter(
      (e) => e.eventType === 'UNDO' && e.reason === 'Network retry',
    );
    expect(undoEvents).toHaveLength(1);
    match = fresh;
  });

  it('8. Completes match and allows organizer to approve final result', async () => {
    const finished = await MatchService.finishMatch(match.id, refereeUser.id);
    expect(finished.status).toBe(MatchStatus.FINISHED);

    const approved = await MatchService.approveResult(match.id, organizerUser.id);
    expect(approved.status).toBe(MatchStatus.APPROVED);

    // Verify audit log for result approval
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: match.id, action: 'APPROVE_MATCH_RESULT' },
    });
    expect(audit).not.toBeNull();
  });
});
