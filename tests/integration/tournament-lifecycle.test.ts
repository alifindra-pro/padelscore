import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../../src/lib/db';
import { TournamentService } from '../../src/services/tournament.service';
import { CategoryService } from '../../src/services/category.service';
import { PlayerService } from '../../src/services/player.service';
import { EntryService } from '../../src/services/entry.service';
import { CourtService } from '../../src/services/court.service';
import { hashPassword } from '../../src/lib/auth';
import {
  CategoryFormat,
  TournamentStatus,
  UserRole,
  type User,
} from '@prisma/client';

describe('Phase 1 Integration: Tournament Lifecycle & RBAC', () => {
  let adminUser: User;
  let testTournament: Awaited<ReturnType<typeof TournamentService.createTournament>>;
  let testCategory: Awaited<ReturnType<typeof CategoryService.createCategory>>;

  beforeAll(async () => {
    // Clean up test data if needed
    const passwordHash = await hashPassword('AdminPassword123!');
    adminUser = await prisma.user.upsert({
      where: { email: 'admin-test@padelos.com' },
      update: {},
      create: {
        email: 'admin-test@padelos.com',
        username: 'admintest_' + Date.now(),
        passwordHash,
        fullName: 'Super Administrator',
        role: UserRole.SUPER_ADMIN,
      },
    });
  });

  afterAll(async () => {
    // Clean up created tournament & cascade
    if (testTournament?.id) {
      await prisma.tournament.delete({ where: { id: testTournament.id } }).catch(() => {});
    }
  });

  it('1. Successfully creates a tournament with owner membership and audit log', async () => {
    const slug = 'padel-open-' + Date.now();
    testTournament = await TournamentService.createTournament({
      name: 'Jakarta Padel Open 2026',
      slug,
      description: 'Annual championship open tournament',
      location: 'Kemang Padel Club, Jakarta',
      startDate: new Date('2026-11-01T08:00:00Z'),
      endDate: new Date('2026-11-03T18:00:00Z'),
      userId: adminUser.id,
    });

    expect(testTournament).toBeDefined();
    expect(testTournament.name).toBe('Jakarta Padel Open 2026');
    expect(testTournament.status).toBe(TournamentStatus.DRAFT);
    expect(testTournament.members).toHaveLength(1);
    expect(testTournament.members[0].userId).toBe(adminUser.id);
    expect(testTournament.members[0].role).toBe('OWNER');

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: { tournamentId: testTournament.id, action: 'CREATE_TOURNAMENT' },
    });
    expect(audit).not.toBeNull();
  });

  it('2. Prevents creating a tournament with duplicate slug', async () => {
    await expect(
      TournamentService.createTournament({
        name: 'Another Open',
        slug: testTournament.slug,
        startDate: new Date('2026-11-01T08:00:00Z'),
        endDate: new Date('2026-11-03T18:00:00Z'),
        userId: adminUser.id,
      })
    ).rejects.toThrow(/already exists/);
  });

  it('3. Creates category with custom ruleset (Golden Point, Best of 3)', async () => {
    testCategory = await CategoryService.createCategory({
      tournamentId: testTournament.id,
      name: "Men's Open A",
      format: CategoryFormat.GROUP_KNOCKOUT,
      maxEntries: 16,
      ruleset: {
        setsToWin: 2,
        gamesPerSet: 6,
        goldenPoint: true,
        superTiebreak: true,
        superTiebreakPts: 10,
      },
      userId: adminUser.id,
    });

    expect(testCategory).toBeDefined();
    expect(testCategory.name).toBe("Men's Open A");
    expect(testCategory.format).toBe(CategoryFormat.GROUP_KNOCKOUT);
    expect(testCategory.ruleset?.goldenPoint).toBe(true);
    expect(testCategory.ruleset?.superTiebreak).toBe(true);
    expect(testCategory.ruleset?.superTiebreakPts).toBe(10);
  });

  it('4. Creates individual players and registers a pair into category', async () => {
    const p1 = await PlayerService.createPlayer({
      fullName: 'Alejandro Galan',
      email: `galan_${Date.now()}@test.com`,
      rating: 9.8,
    });

    const p2 = await PlayerService.createPlayer({
      fullName: 'Juan Lebron',
      email: `lebron_${Date.now()}@test.com`,
      rating: 9.7,
    });

    const entry = await EntryService.createEntry({
      categoryId: testCategory.id,
      name: 'Galan / Lebron',
      playerIds: [p1.id, p2.id],
      seed: 1,
      userId: adminUser.id,
    });

    expect(entry).toBeDefined();
    expect(entry.name).toBe('Galan / Lebron');
    expect(entry.seed).toBe(1);
    expect(entry.players).toHaveLength(2);

    // Verify duplicate player prevention in the same category
    await expect(
      EntryService.createEntry({
        categoryId: testCategory.id,
        name: 'Galan / Another',
        playerIds: [p1.id],
        userId: adminUser.id,
      })
    ).rejects.toThrow(/already registered/);
  });

  it('5. Creates courts and updates court priority', async () => {
    const court1 = await CourtService.createCourt({
      tournamentId: testTournament.id,
      name: 'Center Court',
      priority: 10,
      userId: adminUser.id,
    });

    const court2 = await CourtService.createCourt({
      tournamentId: testTournament.id,
      name: 'Court 2',
      priority: 5,
      userId: adminUser.id,
    });

    const courts = await CourtService.listByTournament(testTournament.id);
    expect(courts).toHaveLength(2);
    // Court 1 should be first because priority 10 > 5
    expect(courts.map((c) => c.id)).toEqual([court1.id, court2.id]);
    expect(courts[0].name).toBe('Center Court');
  });

  it('6. Successfully transitions tournament lifecycle state (DRAFT -> REGISTRATION -> PUBLISHED)', async () => {
    const toReg = await TournamentService.changeTournamentStatus(
      testTournament.id,
      TournamentStatus.REGISTRATION,
      adminUser.id
    );
    expect(toReg.status).toBe(TournamentStatus.REGISTRATION);

    const toPub = await TournamentService.changeTournamentStatus(
      testTournament.id,
      TournamentStatus.PUBLISHED,
      adminUser.id
    );
    expect(toPub.status).toBe(TournamentStatus.PUBLISHED);

    // Re-verify fetched tournament
    const fetched = await TournamentService.getTournamentById(testTournament.id);
    expect(fetched.status).toBe(TournamentStatus.PUBLISHED);
    expect(fetched.categories).toHaveLength(1);
    expect(fetched.courts).toHaveLength(2);
  });
});
