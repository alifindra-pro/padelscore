import {
  TournamentEntry,
  BracketGenerationResult,
  GeneratedMatch,
  GeneratedBracketSlot,
  GroupStageResult,
  GroupPool,
  MatchScoreResult,
  GroupStandingEntry,
  AmericanoScheduleResult,
  AmericanoRoundMatch,
} from './types';

// Helper to calculate round names (e.g. Final, Semifinals, Quarterfinals, Round of 16)
export function getRoundName(round: number, totalRounds: number): string {
  const roundsFromEnd = totalRounds - round;
  if (roundsFromEnd === 0) return 'Final';
  if (roundsFromEnd === 1) return 'Semifinals';
  if (roundsFromEnd === 2) return 'Quarterfinals';
  if (roundsFromEnd === 3) return 'Round of 16';
  if (roundsFromEnd === 4) return 'Round of 32';
  return `Round ${round}`;
}

// Generate power-of-2 seed layout ensuring seed 1 is top, seed 2 is bottom, etc.
export function generateSeedPositions(bracketSize: number): number[] {
  let positions = [1, 2];
  while (positions.length < bracketSize) {
    const nextLength = positions.length * 2;
    const nextPositions: number[] = [];
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      if (i % 2 === 0) {
        nextPositions.push(pos);
        nextPositions.push(nextLength + 1 - pos);
      } else {
        nextPositions.push(nextLength + 1 - pos);
        nextPositions.push(pos);
      }
    }
    positions = nextPositions;
  }
  return positions;
}

export function generateSingleEliminationBracket(
  entries: TournamentEntry[]
): BracketGenerationResult {
  if (entries.length < 2) {
    throw new Error('At least 2 entries required to generate bracket');
  }

  // Find next power of 2
  let bracketSize = 2;
  while (bracketSize < entries.length) {
    bracketSize *= 2;
  }
  if (bracketSize < 4) bracketSize = 4;

  const totalRounds = Math.log2(bracketSize);
  const byesCount = bracketSize - entries.length;

  // Sort entries: seeded first (1, 2, 3..), then unseeded
  const sortedEntries = [...entries].sort((a, b) => {
    if (a.seed && b.seed) return a.seed - b.seed;
    if (a.seed) return -1;
    if (b.seed) return 1;
    return 0;
  });

  // Assign to standard bracket seed positions (1..bracketSize)
  const seedPositions = generateSeedPositions(bracketSize);
  const slots: GeneratedBracketSlot[] = [];

  // Map entries into slots: top seeds take top positions, byes take lowest seeded slots
  const positionedEntries: (TournamentEntry | null)[] = new Array(bracketSize).fill(null);

  let entryIndex = 0;
  for (let rank = 1; rank <= bracketSize; rank++) {
    // Find slot index for this rank
    const slotIdx = seedPositions.indexOf(rank);
    if (rank <= entries.length) {
      positionedEntries[slotIdx] = sortedEntries[entryIndex++];
    } else {
      positionedEntries[slotIdx] = null; // BYE
    }
  }

  for (let i = 0; i < bracketSize; i++) {
    slots.push({
      round: 1,
      position: i + 1,
      entry: positionedEntries[i],
      isBye: positionedEntries[i] === null,
    });
  }

  // Generate Matches
  const matches: GeneratedMatch[] = [];
  let matchNumberCounter = 1;

  // Round 1 matches
  const round1MatchesCount = bracketSize / 2;
  for (let i = 0; i < round1MatchesCount; i++) {
    let entryA = positionedEntries[i * 2];
    let entryB = positionedEntries[i * 2 + 1];

    // Standardize presentation: seeded entry (or non-bye) on top (entryA)
    if (entryA && entryB) {
      if (entryB.seed && (!entryA.seed || entryB.seed < entryA.seed)) {
        const temp = entryA;
        entryA = entryB;
        entryB = temp;
      }
    } else if (!entryA && entryB) {
      entryA = entryB;
      entryB = null;
    }

    const isByeMatch = entryA === null || entryB === null;

    matches.push({
      matchNumber: matchNumberCounter++,
      round: 1,
      roundName: getRoundName(1, totalRounds),
      entryA,
      entryB,
      isByeMatch,
    });
  }

  // Subsequent rounds (Round 2 to Final)
  let prevRoundStartIdx = 0;
  let prevRoundMatchesCount = round1MatchesCount;

  for (let r = 2; r <= totalRounds; r++) {
    const currentRoundMatchesCount = prevRoundMatchesCount / 2;
    const currentRoundStartIdx = matches.length;

    for (let i = 0; i < currentRoundMatchesCount; i++) {
      const matchNum = matchNumberCounter++;
      // Link previous round matches to this match
      const childMatch1 = matches[prevRoundStartIdx + i * 2];
      const childMatch2 = matches[prevRoundStartIdx + i * 2 + 1];

      childMatch1.nextMatchNumber = matchNum;
      childMatch2.nextMatchNumber = matchNum;

      // Handle byes propagating directly to Round 2
      let entryA: TournamentEntry | null = null;
      let entryB: TournamentEntry | null = null;

      if (r === 2) {
        if (childMatch1.isByeMatch) {
          entryA = childMatch1.entryA || childMatch1.entryB;
        }
        if (childMatch2.isByeMatch) {
          const byeWinner = childMatch2.entryA || childMatch2.entryB;
          if (!entryA) {
            entryA = byeWinner;
          } else {
            entryB = byeWinner;
          }
        }
      }

      matches.push({
        matchNumber: matchNum,
        round: r,
        roundName: getRoundName(r, totalRounds),
        entryA,
        entryB,
      });
    }

    prevRoundStartIdx = currentRoundStartIdx;
    prevRoundMatchesCount = currentRoundMatchesCount;
  }

  return {
    totalRounds,
    bracketSize,
    byesCount,
    matches,
    slots,
  };
}

// Berger Round Robin pair scheduling algorithm
export function generateRoundRobinSchedule(
  entries: TournamentEntry[]
): GeneratedMatch[] {
  if (entries.length < 2) return [];

  const teams: (TournamentEntry | null)[] = [...entries];
  const isOdd = teams.length % 2 !== 0;
  if (isOdd) {
    teams.push(null); // Add dummy team for byes
  }

  const n = teams.length;
  const totalRounds = n - 1;
  const matchesPerRound = n / 2;
  const matches: GeneratedMatch[] = [];
  let matchNumber = 1;

  for (let round = 1; round <= totalRounds; round++) {
    for (let i = 0; i < matchesPerRound; i++) {
      const t1 = teams[i];
      const t2 = teams[n - 1 - i];

      // Ignore matches against dummy Bye team
      if (t1 !== null && t2 !== null) {
        matches.push({
          matchNumber: matchNumber++,
          round,
          roundName: `Round ${round}`,
          entryA: i % 2 === 0 ? t1 : t2, // alternate home/away
          entryB: i % 2 === 0 ? t2 : t1,
        });
      }
    }

    // Rotate teams fixing position 0 (Berger algorithm)
    const fixed = teams[0];
    const rotating = teams.slice(1);
    const last = rotating.pop()!;
    rotating.unshift(last);
    teams.splice(0, teams.length, fixed, ...rotating);
  }

  return matches;
}

// Group Stage with Snake seeding and pool matches
export function generateGroupStageWithKnockout(
  entries: TournamentEntry[],
  config: { numGroups: number; advancePerGroup?: number }
): GroupStageResult {
  const { numGroups, advancePerGroup = 2 } = config;
  if (numGroups < 1) throw new Error('Number of groups must be at least 1');
  if (entries.length < numGroups * 2) {
    throw new Error(`At least ${numGroups * 2} entries required for ${numGroups} groups`);
  }

  // Sort by seed
  const sorted = [...entries].sort((a, b) => {
    if (a.seed && b.seed) return a.seed - b.seed;
    if (a.seed) return -1;
    if (b.seed) return 1;
    return 0;
  });

  // Distribute entries into groups using snake drafting
  const groupLists: TournamentEntry[][] = Array.from({ length: numGroups }, () => []);

  let groupIdx = 0;
  let ascending = true;

  for (const entry of sorted) {
    groupLists[groupIdx].push(entry);
    if (ascending) {
      if (groupIdx === numGroups - 1) {
        ascending = false;
      } else {
        groupIdx++;
      }
    } else {
      if (groupIdx === 0) {
        ascending = true;
      } else {
        groupIdx--;
      }
    }
  }

  // Generate round robin matches for each group
  const groupPools: GroupPool[] = [];
  const groupLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  for (let i = 0; i < numGroups; i++) {
    const groupName = `Group ${groupLetters[i] || i + 1}`;
    const groupEntries = groupLists[i];
    const groupMatches = generateRoundRobinSchedule(groupEntries);

    groupPools.push({
      groupName,
      entries: groupEntries,
      matches: groupMatches,
    });
  }

  return {
    groups: groupPools,
    advancingSlotsCount: numGroups * advancePerGroup,
  };
}

// Standings calculation with multi-tier tiebreakers
export function calculateGroupStandings(
  matches: MatchScoreResult[],
  entries: TournamentEntry[]
): GroupStandingEntry[] {
  const map = new Map<string, GroupStandingEntry>();

  for (const e of entries) {
    map.set(e.id, {
      entryId: e.id,
      entryName: e.name,
      played: 0,
      won: 0,
      lost: 0,
      drawn: 0,
      setsWon: 0,
      setsLost: 0,
      setDifferential: 0,
      gamesWon: 0,
      gamesLost: 0,
      gameDifferential: 0,
      points: 0,
      rank: 1,
    });
  }

  // Tally match results
  for (const m of matches) {
    if (!m.winnerId) continue; // Skip unfinished matches

    const sA = map.get(m.entryAId);
    const sB = map.get(m.entryBId);
    if (!sA || !sB) continue;

    sA.played++;
    sB.played++;

    const totalGamesA = m.gamesA.reduce((sum, g) => sum + g, 0);
    const totalGamesB = m.gamesB.reduce((sum, g) => sum + g, 0);

    sA.setsWon += m.setsA;
    sA.setsLost += m.setsB;
    sA.gamesWon += totalGamesA;
    sA.gamesLost += totalGamesB;

    sB.setsWon += m.setsB;
    sB.setsLost += m.setsA;
    sB.gamesWon += totalGamesB;
    sB.gamesLost += totalGamesA;

    if (m.winnerId === m.entryAId) {
      sA.won++;
      sA.points += 3;
      sB.lost++;
    } else {
      sB.won++;
      sB.points += 3;
      sA.lost++;
    }
  }

  // Compute differentials
  for (const s of map.values()) {
    s.setDifferential = s.setsWon - s.setsLost;
    s.gameDifferential = s.gamesWon - s.gamesLost;
  }

  const list = Array.from(map.values());

  // Sort with multi-tier tiebreakers
  list.sort((a, b) => {
    // 1. Points
    if (b.points !== a.points) return b.points - a.points;

    // 2. Head-to-head result between tied teams
    const h2h = matches.find(
      (m) =>
        m.winnerId &&
        ((m.entryAId === a.entryId && m.entryBId === b.entryId) ||
          (m.entryAId === b.entryId && m.entryBId === a.entryId))
    );
    if (h2h) {
      if (h2h.winnerId === a.entryId) return -1;
      if (h2h.winnerId === b.entryId) return 1;
    }

    // 3. Set differential
    if (b.setDifferential !== a.setDifferential) {
      return b.setDifferential - a.setDifferential;
    }

    // 4. Game differential
    if (b.gameDifferential !== a.gameDifferential) {
      return b.gameDifferential - a.gameDifferential;
    }

    // 5. Total games won
    return b.gamesWon - a.gamesWon;
  });

  // Assign ranks
  list.forEach((item, index) => {
    item.rank = index + 1;
  });

  return list;
}

// Advance winner of match into next round in bracket
export function advanceBracketWinner(
  matches: GeneratedMatch[],
  finishedMatchNumber: number,
  winner: TournamentEntry
): GeneratedMatch[] {
  const finished = matches.find((m) => m.matchNumber === finishedMatchNumber);
  if (!finished || !finished.nextMatchNumber) return matches;

  return matches.map((m) => {
    if (m.matchNumber === finished.nextMatchNumber) {
      // Determine if winner fills entryA or entryB: odd matchNumber fills A, even fills B
      const isA = finished.matchNumber % 2 !== 0;
      return {
        ...m,
        entryA: isA ? winner : m.entryA,
        entryB: !isA ? winner : m.entryB,
      };
    }
    return m;
  });
}

// Generate Americano rotating doubles schedule (each player partners with everyone once)
export function generateAmericanoSchedule(
  players: TournamentEntry[]
): AmericanoScheduleResult {
  if (players.length < 4) {
    throw new Error('Americano requires at least 4 players');
  }

  const n = players.length;
  const numRounds = n % 2 === 0 ? n - 1 : n;
  const courtsCount = Math.floor(n / 4);

  const playerList = [...players];
  if (playerList.length % 2 !== 0) {
    playerList.push({ id: 'bye', name: 'BYE' });
  }

  const m = playerList.length;
  const matches: AmericanoRoundMatch[] = [];
  let matchNumberCounter = 1;

  // Polygon round-robin method: fix player 0, rotate players 1..m-1
  for (let r = 0; r < numRounds; r++) {
    const pairs: [TournamentEntry, TournamentEntry][] = [];
    for (let i = 0; i < m / 2; i++) {
      const p1 = playerList[i];
      const p2 = playerList[m - 1 - i];
      if (p1.id !== 'bye' && p2.id !== 'bye') {
        pairs.push([p1, p2]);
      }
    }

    // Group pairs 2-by-2 into doubles matches on courts
    for (let c = 0; c < Math.floor(pairs.length / 2); c++) {
      const pairA = pairs[c * 2];
      const pairB = pairs[c * 2 + 1];

      matches.push({
        matchNumber: matchNumberCounter++,
        round: r + 1,
        courtNumber: c + 1,
        teamA: {
          name: `${pairA[0].name} / ${pairA[1].name}`,
          player1: pairA[0],
          player2: pairA[1],
        },
        teamB: {
          name: `${pairB[0].name} / ${pairB[1].name}`,
          player1: pairB[0],
          player2: pairB[1],
        },
      });
    }

    // Rotate playerList (keep index 0 fixed, cyclic shift rest by 1)
    const fixed = playerList[0];
    const rest = playerList.slice(1);
    const last = rest.pop()!;
    playerList.splice(0, playerList.length, fixed, last, ...rest);
  }

  return {
    totalRounds: numRounds,
    courtsCount: Math.max(1, courtsCount),
    matches,
  };
}
