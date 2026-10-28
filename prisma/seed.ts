import { PrismaClient, UserRole, TournamentStatus, TournamentMemberRole, MatchStatus, StageType, StageStatus, DeuceType, type Entry, type Player } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Padel Tournament OS database seeding...');

  // 1. Seed Users with bcrypt hashed passwords
  const adminPasswordHash = await bcrypt.hash('PadelAdmin2026!', 10);
  const organizerPasswordHash = await bcrypt.hash('Organizer2026!', 10);
  const refereePasswordHash = await bcrypt.hash('WasitPadel2026!', 10);
  const viewerPasswordHash = await bcrypt.hash('ViewerPadel2026!', 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@padelos.com' },
    update: {},
    create: {
      email: 'admin@padelos.com',
      username: 'superadmin',
      fullName: 'Super Administrator',
      passwordHash: adminPasswordHash,
      role: UserRole.SUPER_ADMIN,
    },
  });

  const organizer = await prisma.user.upsert({
    where: { email: 'organizer@padelos.com' },
    update: {},
    create: {
      email: 'organizer@padelos.com',
      username: 'organizer',
      fullName: 'Tournament Director',
      passwordHash: organizerPasswordHash,
      role: UserRole.ORGANIZER,
    },
  });

  const referee1 = await prisma.user.upsert({
    where: { email: 'wasit1@padelos.com' },
    update: {},
    create: {
      email: 'wasit1@padelos.com',
      username: 'wasit1',
      fullName: 'Bambang Chair Umpire',
      passwordHash: refereePasswordHash,
      role: UserRole.REFEREE,
    },
  });

  const referee2 = await prisma.user.upsert({
    where: { email: 'wasit2@padelos.com' },
    update: {},
    create: {
      email: 'wasit2@padelos.com',
      username: 'wasit2',
      fullName: 'Siti Line Umpire',
      passwordHash: refereePasswordHash,
      role: UserRole.REFEREE,
    },
  });

  await prisma.user.upsert({
    where: { email: 'viewer@padelos.com' },
    update: {},
    create: {
      email: 'viewer@padelos.com',
      username: 'viewer',
      fullName: 'Spectator Fans',
      passwordHash: viewerPasswordHash,
      role: UserRole.VIEWER,
    },
  });

  console.log('✅ Users seeded (Super Admin, Organizer, Referees, Viewer)');

  // 2. Seed Players
  const playersData = [
    { fullName: 'Alejandro Galán', email: 'galan@padel.pro', rating: 7.0 },
    { fullName: 'Federico Chingotto', email: 'chingotto@padel.pro', rating: 7.0 },
    { fullName: 'Arturo Coello', email: 'coello@padel.pro', rating: 7.0 },
    { fullName: 'Agustín Tapia', email: 'tapia@padel.pro', rating: 7.0 },
    { fullName: 'Juan Lebrón', email: 'lebron@padel.pro', rating: 6.9 },
    { fullName: 'Paquito Navarro', email: 'paquito@padel.pro', rating: 6.8 },
    { fullName: 'Franco Stupaczuk', email: 'stupa@padel.pro', rating: 6.8 },
    { fullName: 'Mike Yanguas', email: 'yanguas@padel.pro', rating: 6.7 },
    { fullName: 'Martin Di Nenno', email: 'dinenno@padel.pro', rating: 6.8 },
    { fullName: 'Coki Nieto', email: 'nieto@padel.pro', rating: 6.6 },
    { fullName: 'Fernando Belasteguín', email: 'bela@padel.pro', rating: 6.9 },
    { fullName: 'Tino Libaak', email: 'libaak@padel.pro', rating: 6.5 },
    { fullName: 'Sanyo Gutiérrez', email: 'sanyo@padel.pro', rating: 6.7 },
    { fullName: 'Maxi Sánchez', email: 'sanchez@padel.pro', rating: 6.6 },
    { fullName: 'Javi Garrido', email: 'garrido@padel.pro', rating: 6.6 },
    { fullName: 'Momo González', email: 'momo@padel.pro', rating: 6.6 },
  ];

  const players: Player[] = [];
  for (const p of playersData) {
    const existing = await prisma.player.findFirst({ where: { email: p.email } });
    if (existing) {
      players.push(existing);
    } else {
      const created = await prisma.player.create({ data: p });
      players.push(created);
    }
  }

  console.log(`✅ Seeded ${players.length} professional players`);

  // 3. Seed Showcase Tournament
  const existingTourney = await prisma.tournament.findUnique({
    where: { slug: 'jakarta-premier-2026' },
  });

  if (existingTourney) {
    await prisma.tournament.delete({ where: { id: existingTourney.id } });
  }

  const tournament = await prisma.tournament.create({
    data: {
      name: 'Jakarta Premier Padel Championship 2026',
      slug: 'jakarta-premier-2026',
      description: 'Turnamen Padel Internasional Resmi FIP Premier Padel Series di Jakarta dengan format Single Elimination dan Group Knockout.',
      location: 'Gelora Bung Karno Padel Arena, Senayan, Jakarta',
      timezone: 'Asia/Jakarta',
      startDate: new Date(),
      endDate: new Date(Date.now() + 3 * 86400000),
      status: TournamentStatus.IN_PROGRESS,
      members: {
        create: [
          { userId: superAdmin.id, role: TournamentMemberRole.OWNER },
          { userId: organizer.id, role: TournamentMemberRole.ADMIN },
          { userId: referee1.id, role: TournamentMemberRole.REFEREE },
          { userId: referee2.id, role: TournamentMemberRole.REFEREE },
        ],
      },
    },
  });

  console.log(`✅ Tournament created: ${tournament.name}`);

  // 4. Seed Physical Courts
  const court1 = await prisma.court.create({
    data: {
      tournamentId: tournament.id,
      name: 'Center Court GBK',
      priority: 10,
      isActive: true,
    },
  });

  const court2 = await prisma.court.create({
    data: {
      tournamentId: tournament.id,
      name: 'Court 1 Central',
      priority: 8,
      isActive: true,
    },
  });

  const court3 = await prisma.court.create({
    data: {
      tournamentId: tournament.id,
      name: 'Court 2 Outdoor',
      priority: 5,
      isActive: true,
    },
  });

  console.log('✅ Physical courts created (Center Court, Court 1, Court 2)');

  // 5. Seed Competition Category (Men\'s Open Pro)
  const category = await prisma.category.create({
    data: {
      tournamentId: tournament.id,
      name: "Men's Open Pro",
      description: 'Kategori utama ganda putra profesional sistem gugur (Single Elimination).',
      format: 'SINGLE_ELIMINATION',
      maxEntries: 8,
      status: 'IN_PROGRESS',
      ruleset: {
        create: {
          setsToWin: 2,
          gamesPerSet: 6,
          tiebreakAt: 6,
          tiebreakPoints: 7,
          goldenPoint: true,
          superTiebreak: true,
          superTiebreakPts: 10,
          deuceType: DeuceType.GOLDEN_POINT,
        },
      },
    },
  });

  // 6. Seed Entries (8 Pairs with Seeds)
  const pairConfigs = [
    { name: 'Galán / Chingotto', p1: 0, p2: 1, seed: 1 },
    { name: 'Coello / Tapia', p1: 2, p2: 3, seed: 2 },
    { name: 'Lebrón / Navarro', p1: 4, p2: 5, seed: 3 },
    { name: 'Stupaczuk / Yanguas', p1: 6, p2: 7, seed: 4 },
    { name: 'Di Nenno / Nieto', p1: 8, p2: 9, seed: null },
    { name: 'Belasteguín / Libaak', p1: 10, p2: 11, seed: null },
    { name: 'Gutiérrez / Sánchez', p1: 12, p2: 13, seed: null },
    { name: 'Garrido / González', p1: 14, p2: 15, seed: null },
  ];

  const entries: Entry[] = [];
  for (const cfg of pairConfigs) {
    const entry = await prisma.entry.create({
      data: {
        categoryId: category.id,
        name: cfg.name,
        seed: cfg.seed,
        status: 'CONFIRMED',
        players: {
          create: [
            { playerId: players[cfg.p1].id },
            { playerId: players[cfg.p2].id },
          ],
        },
      },
    });
    entries.push(entry);
  }

  console.log(`✅ Seeded ${entries.length} registered pairs into category`);

  // 7. Seed Single Elimination Knockout Stage & Matches
  const stage = await prisma.stage.create({
    data: {
      categoryId: category.id,
      name: 'Knockout Main Draw',
      type: StageType.SINGLE_ELIMINATION,
      order: 1,
      status: StageStatus.IN_PROGRESS,
      config: { bracketSize: 8, totalRounds: 3, byesCount: 0 },
    },
  });

  // Create Bracket Slots
  for (let pos = 1; pos <= 8; pos++) {
    await prisma.bracketSlot.create({
      data: {
        stageId: stage.id,
        round: 1,
        position: pos,
        entryId: entries[pos - 1]?.id || null,
        isBye: false,
      },
    });
  }

  // Create Quarterfinal Matches (4 matches)
  // Match 1: QF 1 (Seed 1 Galán/Chingotto vs Garrido/González) -> IN PLAY on Center Court
  const now = new Date();
  const match1 = await prisma.match.create({
    data: {
      stageId: stage.id,
      courtId: court1.id,
      matchNumber: 1,
      round: 1,
      entryAId: entries[0].id, // Galán / Chingotto
      entryBId: entries[7].id, // Garrido / González
      status: MatchStatus.IN_PROGRESS,
      scheduledAt: new Date(now.getTime() - 45 * 60000),
      startedAt: new Date(now.getTime() - 40 * 60000),
      version: 5,
      officials: {
        create: [{ userId: referee1.id, role: 'CHAIR_UMPIRE' }],
      },
      sets: {
        create: [
          { setNumber: 1, gamesA: 6, gamesB: 4, winnerId: entries[0].id },
          { setNumber: 2, gamesA: 3, gamesB: 2 },
        ],
      },
      scoreSnapshot: {
        create: {
          currentSet: 2,
          pointsA: '40',
          pointsB: '30',
          setsA: 1,
          setsB: 0,
          gamesA: [6, 3],
          gamesB: [4, 2],
          server: 'A',
          isTiebreak: false,
          tiebreakPtsA: 0,
          tiebreakPtsB: 0,
          version: 5,
        },
      },
      events: {
        create: [
          {
            eventType: 'MATCH_START',
            sequence: 1,
            userId: referee1.id,
            version: 1,
          },
          {
            eventType: 'SET_WON',
            team: 'A',
            sequence: 2,
            userId: referee1.id,
            version: 2,
            payload: { setNumber: 1, gamesA: 6, gamesB: 4 },
          },
          {
            eventType: 'POINT_SCORED',
            team: 'A',
            sequence: 3,
            userId: referee1.id,
            version: 3,
          },
        ],
      },
    },
  });

  // Match 2: QF 2 (Seed 4 Stupaczuk/Yanguas vs Di Nenno/Nieto) -> Scheduled Court 1
  await prisma.match.create({
    data: {
      stageId: stage.id,
      courtId: court2.id,
      matchNumber: 2,
      round: 1,
      entryAId: entries[3].id,
      entryBId: entries[4].id,
      status: MatchStatus.SCHEDULED,
      scheduledAt: new Date(now.getTime() + 30 * 60000),
      version: 0,
    },
  });

  // Match 3: QF 3 (Seed 3 Lebrón/Navarro vs Belasteguín/Libaak) -> Scheduled Court 2
  await prisma.match.create({
    data: {
      stageId: stage.id,
      courtId: court3.id,
      matchNumber: 3,
      round: 1,
      entryAId: entries[2].id,
      entryBId: entries[5].id,
      status: MatchStatus.SCHEDULED,
      scheduledAt: new Date(now.getTime() + 60 * 60000),
      version: 0,
    },
  });

  // Match 4: QF 4 (Seed 2 Coello/Tapia vs Gutiérrez/Sánchez) -> Scheduled Center Court next
  await prisma.match.create({
    data: {
      stageId: stage.id,
      courtId: court1.id,
      matchNumber: 4,
      round: 1,
      entryAId: entries[1].id,
      entryBId: entries[6].id,
      status: MatchStatus.SCHEDULED,
      scheduledAt: new Date(now.getTime() + 90 * 60000),
      version: 0,
    },
  });

  // Semifinal 1 (Match 5)
  await prisma.match.create({
    data: {
      stageId: stage.id,
      courtId: court1.id,
      matchNumber: 5,
      round: 2,
      status: MatchStatus.SCHEDULED,
      version: 0,
    },
  });

  // Semifinal 2 (Match 6)
  await prisma.match.create({
    data: {
      stageId: stage.id,
      courtId: court1.id,
      matchNumber: 6,
      round: 2,
      status: MatchStatus.SCHEDULED,
      version: 0,
    },
  });

  // Championship Final (Match 7)
  await prisma.match.create({
    data: {
      stageId: stage.id,
      courtId: court1.id,
      matchNumber: 7,
      round: 3,
      status: MatchStatus.SCHEDULED,
      version: 0,
    },
  });

  console.log('✅ Quarterfinal, Semifinal, and Final matches generated');
  console.log(`🎾 Live Match in play: Match ID ${match1.id} on Center Court GBK`);
  console.log('✨ Seed complete! Default Login Credentials:');
  console.log('---------------------------------------------------------');
  console.log('Super Admin: admin@padelos.com      / PadelAdmin2026!');
  console.log('Organizer:   organizer@padelos.com  / Organizer2026!');
  console.log('Referee 1:   wasit1@padelos.com     / WasitPadel2026!');
  console.log('Public Hub:  http://localhost:3000/tournament/jakarta-premier-2026');
  console.log('Live Match:  http://localhost:3000/match/' + match1.id);
  console.log('Ref Scoring: http://localhost:3000/referee/scoring/' + match1.id);
  console.log('---------------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
