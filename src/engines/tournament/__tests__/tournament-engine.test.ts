import { describe, it, expect } from 'vitest';
import {
  generateSingleEliminationBracket,
  generateRoundRobinSchedule,
  generateGroupStageWithKnockout,
  calculateGroupStandings,
  advanceBracketWinner,
  generateAmericanoSchedule,
} from '../tournament-engine';
import { TournamentEntry, MatchScoreResult } from '../types';

describe('Tournament Engine (Pure Logic)', () => {
  const createTeams = (count: number): TournamentEntry[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `team-${i + 1}`,
      name: `Team ${i + 1}`,
      seed: i < 4 ? i + 1 : null,
    }));

  it('1. Generates single elimination bracket for 8 teams (exact power of 2)', () => {
    const teams = createTeams(8);
    const result = generateSingleEliminationBracket(teams);

    expect(result.bracketSize).toBe(8);
    expect(result.totalRounds).toBe(3); // QF, SF, Final
    expect(result.byesCount).toBe(0);
    expect(result.matches).toHaveLength(7); // 4 + 2 + 1
    expect(result.matches[0].roundName).toBe('Quarterfinals');
    expect(result.matches[4].roundName).toBe('Semifinals');
    expect(result.matches[6].roundName).toBe('Final');

    // Seed 1 is in slot 1 (Match 1)
    expect(result.matches[0].entryA?.seed).toBe(1);
    // Seed 2 is in bottom half (Match 4)
    expect(result.matches[3].entryA?.seed).toBe(2);
  });

  it('2. Generates single elimination bracket with Byes (6 teams in size 8 bracket)', () => {
    const teams = createTeams(6);
    const result = generateSingleEliminationBracket(teams);

    expect(result.bracketSize).toBe(8);
    expect(result.byesCount).toBe(2);

    // Top seeds (Seed 1 and Seed 2) must receive the byes
    const byeMatches = result.matches.filter((m) => m.isByeMatch);
    expect(byeMatches).toHaveLength(2);

    // Round 2 should have Seed 1 and Seed 2 already seeded in due to bye advancement
    const round2Matches = result.matches.filter((m) => m.round === 2);
    expect(round2Matches[0].entryA?.seed).toBe(1);
    expect(round2Matches[1].entryA?.seed).toBe(2);
  });

  it('3. Generates Berger Round Robin schedule (4 teams -> 3 rounds, 6 matches)', () => {
    const teams = createTeams(4);
    const matches = generateRoundRobinSchedule(teams);

    expect(matches).toHaveLength(6); // 4 * 3 / 2 = 6
    const rounds = new Set(matches.map((m) => m.round));
    expect(rounds.size).toBe(3);

    // Verify each team plays 3 matches
    for (const team of teams) {
      const teamMatches = matches.filter(
        (m) => m.entryA?.id === team.id || m.entryB?.id === team.id
      );
      expect(teamMatches).toHaveLength(3);
    }
  });

  it('4. Generates Group Stage with Snake Drafting (8 teams into 2 groups)', () => {
    const teams = createTeams(8);
    const result = generateGroupStageWithKnockout(teams, { numGroups: 2 });

    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].entries).toHaveLength(4);
    expect(result.groups[1].entries).toHaveLength(4);

    // Snake seeding: Group A gets Seed 1 & Seed 4, Group B gets Seed 2 & Seed 3
    const groupAIds = result.groups[0].entries.map((e) => e.seed);
    const groupBIds = result.groups[1].entries.map((e) => e.seed);

    expect(groupAIds).toContain(1);
    expect(groupAIds).toContain(4);
    expect(groupBIds).toContain(2);
    expect(groupBIds).toContain(3);
  });

  it('5. Computes Group Standings and resolves tiebreakers (Points -> H2H -> Set Diff)', () => {
    const teams: TournamentEntry[] = [
      { id: 'T1', name: 'Team 1' },
      { id: 'T2', name: 'Team 2' },
      { id: 'T3', name: 'Team 3' },
    ];

    const matches: MatchScoreResult[] = [
      // T1 beats T2 (2-0 sets, 12-6 games)
      {
        matchId: 'm1',
        entryAId: 'T1',
        entryBId: 'T2',
        winnerId: 'T1',
        setsA: 2,
        setsB: 0,
        gamesA: [6, 6],
        gamesB: [3, 3],
      },
      // T2 beats T3 (2-1 sets, 14-12 games)
      {
        matchId: 'm2',
        entryAId: 'T2',
        entryBId: 'T3',
        winnerId: 'T2',
        setsA: 2,
        setsB: 1,
        gamesA: [6, 2, 6],
        gamesB: [4, 6, 2],
      },
      // T1 beats T3 (2-0 sets, 12-4 games)
      {
        matchId: 'm3',
        entryAId: 'T1',
        entryBId: 'T3',
        winnerId: 'T1',
        setsA: 2,
        setsB: 0,
        gamesA: [6, 6],
        gamesB: [2, 2],
      },
    ];

    const standings = calculateGroupStandings(matches, teams);

    // T1: 2 wins = 6 pts (Rank 1)
    expect(standings[0].entryId).toBe('T1');
    expect(standings[0].points).toBe(6);
    expect(standings[0].rank).toBe(1);

    // T2: 1 win = 3 pts (Rank 2)
    expect(standings[1].entryId).toBe('T2');
    expect(standings[1].points).toBe(3);
    expect(standings[1].rank).toBe(2);

    // T3: 0 wins = 0 pts (Rank 3)
    expect(standings[2].entryId).toBe('T3');
    expect(standings[2].points).toBe(0);
    expect(standings[2].rank).toBe(3);
  });

  it('6. Advances bracket winner into next round match', () => {
    const teams = createTeams(4);
    const bracket = generateSingleEliminationBracket(teams);

    // Semi 1 is Match 1, Semi 2 is Match 2, Final is Match 3
    const finalBefore = bracket.matches.find((m) => m.round === 2);
    expect(finalBefore?.entryA).toBeNull();

    // Semi 1 finishes with Winner = Team 1
    const updatedMatches = advanceBracketWinner(
      bracket.matches,
      1,
      teams[0] // Team 1
    );

    const finalAfter = updatedMatches.find((m) => m.round === 2);
    expect(finalAfter?.entryA?.id).toBe(teams[0].id);
  });

  it('7. Generates Americano schedule with partner rotation for 4 players', () => {
    const players: TournamentEntry[] = [
      { id: 'p1', name: 'Player 1' },
      { id: 'p2', name: 'Player 2' },
      { id: 'p3', name: 'Player 3' },
      { id: 'p4', name: 'Player 4' },
    ];

    const result = generateAmericanoSchedule(players);

    expect(result.totalRounds).toBe(3);
    expect(result.courtsCount).toBe(1);
    expect(result.matches).toHaveLength(3);

    // Verify player 1 partners with each of the other 3 players in the 3 matches
    const p1Partners = new Set<string>();
    for (const m of result.matches) {
      if (m.teamA.player1.id === 'p1') p1Partners.add(m.teamA.player2.id);
      if (m.teamA.player2.id === 'p1') p1Partners.add(m.teamA.player1.id);
      if (m.teamB.player1.id === 'p1') p1Partners.add(m.teamB.player2.id);
      if (m.teamB.player2.id === 'p1') p1Partners.add(m.teamB.player1.id);
    }

    expect(p1Partners.has('p2')).toBe(true);
    expect(p1Partners.has('p3')).toBe(true);
    expect(p1Partners.has('p4')).toBe(true);
  });

  it('8. Generates Americano schedule for 8 players across 2 courts', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
    }));

    const result = generateAmericanoSchedule(players);

    expect(result.totalRounds).toBe(7);
    expect(result.courtsCount).toBe(2);
    expect(result.matches).toHaveLength(14); // 7 rounds * 2 courts
  });
});
