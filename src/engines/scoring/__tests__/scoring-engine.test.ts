import { describe, it, expect } from 'vitest';
import {
  createMatchState,
  scorePoint,
  undoLastPoint,
  replayEvents,
} from '../scoring-engine';
import { MatchState, Ruleset, Team } from '../types';

const standardRuleset: Ruleset = {
  setsToWin: 2,
  gamesPerSet: 6,
  tiebreakAt: 6,
  tiebreakPoints: 7,
  goldenPoint: false,
  superTiebreak: true,
  superTiebreakPts: 10,
  deuceType: 'ADVANTAGE',
};

const goldenPointRuleset: Ruleset = {
  setsToWin: 2,
  gamesPerSet: 6,
  tiebreakAt: 6,
  tiebreakPoints: 7,
  goldenPoint: true,
  superTiebreak: true,
  superTiebreakPts: 10,
  deuceType: 'GOLDEN_POINT',
};

// Helper to score multiple points consecutively
function scorePoints(
  state: MatchState,
  team: Team,
  count: number,
  ruleset: Ruleset = standardRuleset
): MatchState {
  let current = state;
  for (let i = 0; i < count; i++) {
    current = scorePoint(current, team, ruleset).state;
  }
  return current;
}

// Helper to win a game from 0-0 with 4 unanswered points
function winGame(
  state: MatchState,
  team: Team,
  ruleset: Ruleset = standardRuleset
): MatchState {
  return scorePoints(state, team, 4, ruleset);
}

describe('Padel Scoring Engine', () => {
  // 1. createMatchState - initial state is correct
  it('1. createMatchState - initializes state correctly', () => {
    const state = createMatchState(standardRuleset);

    expect(state.currentSet).toBe(1);
    expect(state.sets).toHaveLength(1);
    expect(state.sets[0]).toEqual({
      setNumber: 1,
      gamesA: 0,
      gamesB: 0,
      isTiebreak: false,
      tiebreakPointsA: 0,
      tiebreakPointsB: 0,
      winner: null,
    });
    expect(state.pointsA).toBe('0');
    expect(state.pointsB).toBe('0');
    expect(state.server).toBe('A');
    expect(state.isDeuce).toBe(false);
    expect(state.isTiebreak).toBe(false);
    expect(state.isSuperTiebreak).toBe(false);
    expect(state.tiebreakPointsA).toBe(0);
    expect(state.tiebreakPointsB).toBe(0);
    expect(state.isFinished).toBe(false);
    expect(state.winner).toBeNull();
    expect(state.setsWonA).toBe(0);
    expect(state.setsWonB).toBe(0);
  });

  // 2. Regular game: score 4 points for team A -> team A wins game
  it('2. Regular game: score 4 points for team A -> team A wins game', () => {
    let state = createMatchState(standardRuleset);

    // Point 1: 15-0
    let res = scorePoint(state, 'A', standardRuleset);
    state = res.state;
    expect(state.pointsA).toBe('15');
    expect(state.pointsB).toBe('0');
    expect(res.events).toHaveLength(1);
    expect(res.events[0].type).toBe('POINT_SCORED');

    // Point 2: 30-0
    res = scorePoint(state, 'A', standardRuleset);
    state = res.state;
    expect(state.pointsA).toBe('30');
    expect(state.pointsB).toBe('0');

    // Point 3: 40-0
    res = scorePoint(state, 'A', standardRuleset);
    state = res.state;
    expect(state.pointsA).toBe('40');
    expect(state.pointsB).toBe('0');

    // Point 4: Game A
    res = scorePoint(state, 'A', standardRuleset);
    state = res.state;
    expect(state.pointsA).toBe('0');
    expect(state.pointsB).toBe('0');
    expect(state.sets[0].gamesA).toBe(1);
    expect(state.sets[0].gamesB).toBe(0);
    expect(state.server).toBe('B');
    expect(res.events.some((e) => e.type === 'GAME_WON' && e.team === 'A')).toBe(true);
  });

  // 3. Deuce scenario: reach 40-40, test advantage mode
  it('3. Deuce scenario: reach 40-40, test advantage mode', () => {
    let state = createMatchState(standardRuleset);

    // 40-0
    state = scorePoints(state, 'A', 3);
    expect(state.pointsA).toBe('40');
    expect(state.pointsB).toBe('0');

    // 40-40
    state = scorePoints(state, 'B', 3);
    expect(state.pointsA).toBe('40');
    expect(state.pointsB).toBe('40');
    expect(state.isDeuce).toBe(true);

    // Advantage A
    const resAdv = scorePoint(state, 'A', standardRuleset);
    expect(resAdv.state.pointsA).toBe('AD');
    expect(resAdv.state.pointsB).toBe('40');
    expect(resAdv.state.isDeuce).toBe(false);

    // Game A
    const resGame = scorePoint(resAdv.state, 'A', standardRuleset);
    expect(resGame.state.sets[0].gamesA).toBe(1);
    expect(resGame.state.pointsA).toBe('0');
    expect(resGame.state.pointsB).toBe('0');
    expect(resGame.events.some((e) => e.type === 'GAME_WON' && e.team === 'A')).toBe(true);
  });

  // 4. Deuce -> Advantage A -> Deuce (B scores) -> Advantage B -> Game B
  it('4. Deuce -> Advantage A -> Deuce (B scores) -> Advantage B -> Game B', () => {
    let state = createMatchState(standardRuleset);
    // Reach 40-40
    state = scorePoints(state, 'A', 3);
    state = scorePoints(state, 'B', 3);
    expect(state.isDeuce).toBe(true);

    // Advantage A
    state = scorePoint(state, 'A', standardRuleset).state;
    expect(state.pointsA).toBe('AD');
    expect(state.pointsB).toBe('40');
    expect(state.isDeuce).toBe(false);

    // B scores -> back to deuce
    state = scorePoint(state, 'B', standardRuleset).state;
    expect(state.pointsA).toBe('40');
    expect(state.pointsB).toBe('40');
    expect(state.isDeuce).toBe(true);

    // Advantage B
    state = scorePoint(state, 'B', standardRuleset).state;
    expect(state.pointsA).toBe('40');
    expect(state.pointsB).toBe('AD');
    expect(state.isDeuce).toBe(false);

    // Game B
    const res = scorePoint(state, 'B', standardRuleset);
    expect(res.state.sets[0].gamesB).toBe(1);
    expect(res.state.pointsA).toBe('0');
    expect(res.state.pointsB).toBe('0');
    expect(res.events.some((e) => e.type === 'GAME_WON' && e.team === 'B')).toBe(true);
  });

  // 5. Golden point: at 40-40, next point wins
  it('5. Golden point: at 40-40, next point wins', () => {
    let state = createMatchState(goldenPointRuleset);

    // Reach 40-40
    state = scorePoints(state, 'A', 3, goldenPointRuleset);
    state = scorePoints(state, 'B', 3, goldenPointRuleset);
    expect(state.pointsA).toBe('40');
    expect(state.pointsB).toBe('40');
    expect(state.isDeuce).toBe(true);

    // Next point immediately wins game without AD
    const res = scorePoint(state, 'B', goldenPointRuleset);
    expect(res.state.sets[0].gamesB).toBe(1);
    expect(res.state.pointsA).toBe('0');
    expect(res.state.pointsB).toBe('0');
    expect(res.events.some((e) => e.type === 'GAME_WON' && e.team === 'B')).toBe(true);
  });

  // 6. Complete set: team A wins 6 games to 0
  it('6. Complete set: team A wins 6 games to 0', () => {
    let state = createMatchState(standardRuleset);

    for (let i = 0; i < 5; i++) {
      state = winGame(state, 'A');
    }
    expect(state.sets[0].gamesA).toBe(5);
    expect(state.setsWonA).toBe(0);

    // 6th game
    state = winGame(state, 'A');

    expect(state.sets[0].gamesA).toBe(6);
    expect(state.sets[0].gamesB).toBe(0);
    expect(state.sets[0].winner).toBe('A');
    expect(state.setsWonA).toBe(1);
    expect(state.currentSet).toBe(2);
    expect(state.sets).toHaveLength(2);
    expect(state.sets[1].setNumber).toBe(2);
  });

  // 7. Close set: 6-4
  it('7. Close set: 6-4', () => {
    let state = createMatchState(standardRuleset);

    // Team A wins 5, Team B wins 4 (5-4)
    for (let i = 0; i < 4; i++) {
      state = winGame(state, 'A');
      state = winGame(state, 'B');
    }
    state = winGame(state, 'A'); // 5-4
    expect(state.sets[0].gamesA).toBe(5);
    expect(state.sets[0].gamesB).toBe(4);
    expect(state.sets[0].winner).toBeNull();

    // Team A wins 6th game -> 6-4 set win
    state = winGame(state, 'A');
    expect(state.sets[0].gamesA).toBe(6);
    expect(state.sets[0].gamesB).toBe(4);
    expect(state.sets[0].winner).toBe('A');
    expect(state.setsWonA).toBe(1);
    expect(state.currentSet).toBe(2);
  });

  // 8. Tiebreak trigger: reach 6-6, verify tiebreak starts
  it('8. Tiebreak trigger: reach 6-6, verify tiebreak starts', () => {
    let state = createMatchState(standardRuleset);

    // Reach 5-5
    for (let i = 0; i < 5; i++) {
      state = winGame(state, 'A');
      state = winGame(state, 'B');
    }
    expect(state.sets[0].gamesA).toBe(5);
    expect(state.sets[0].gamesB).toBe(5);

    // A wins game -> 6-5
    state = winGame(state, 'A');
    expect(state.isTiebreak).toBe(false);

    // B wins game -> 6-6, tiebreak starts
    let lastResult = scorePoint(state, 'B', standardRuleset);
    for (let i = 1; i < 4; i++) {
      lastResult = scorePoint(lastResult.state, 'B', standardRuleset);
    }
    state = lastResult.state;

    expect(state.sets[0].gamesA).toBe(6);
    expect(state.sets[0].gamesB).toBe(6);
    expect(state.isTiebreak).toBe(true);
    expect(state.tiebreakPointsA).toBe(0);
    expect(state.tiebreakPointsB).toBe(0);
    expect(lastResult.events.some((e) => e.type === 'TIEBREAK_START')).toBe(true);
  });

  // 9. Tiebreak scoring: first to 7 with 2-point lead
  it('9. Tiebreak scoring: first to 7 with 2-point lead', () => {
    let state = createMatchState(standardRuleset);

    // Advance to 6-6
    for (let i = 0; i < 6; i++) {
      state = winGame(state, 'A');
      state = winGame(state, 'B');
    }
    expect(state.isTiebreak).toBe(true);

    // Score in tiebreak: A reaches 6, B reaches 5
    state = scorePoints(state, 'A', 6);
    state = scorePoints(state, 'B', 5);
    expect(state.tiebreakPointsA).toBe(6);
    expect(state.tiebreakPointsB).toBe(5);
    expect(state.sets[0].winner).toBeNull();

    // A scores 7th point -> 7-5 wins tiebreak and set
    const res = scorePoint(state, 'A', standardRuleset);
    expect(res.state.sets[0].winner).toBe('A');
    expect(res.state.sets[0].gamesA).toBe(7);
    expect(res.state.sets[0].gamesB).toBe(6);
    expect(res.state.sets[0].tiebreakPointsA).toBe(7);
    expect(res.state.sets[0].tiebreakPointsB).toBe(5);
    expect(res.state.setsWonA).toBe(1);
    expect(res.state.isTiebreak).toBe(false);
    expect(res.events.some((e) => e.type === 'SET_WON' && e.team === 'A')).toBe(true);
  });

  // 10. Extended tiebreak: 6-6 in tiebreak, need 2-point lead
  it('10. Extended tiebreak: 6-6 in tiebreak, need 2-point lead', () => {
    let state = createMatchState(standardRuleset);
    for (let i = 0; i < 6; i++) {
      state = winGame(state, 'A');
      state = winGame(state, 'B');
    }

    // Tiebreak 6-6
    state = scorePoints(state, 'A', 6);
    state = scorePoints(state, 'B', 6);
    expect(state.tiebreakPointsA).toBe(6);
    expect(state.tiebreakPointsB).toBe(6);
    expect(state.sets[0].winner).toBeNull();

    // 7-6 -> not finished (need 2-point lead)
    state = scorePoint(state, 'A', standardRuleset).state;
    expect(state.tiebreakPointsA).toBe(7);
    expect(state.tiebreakPointsB).toBe(6);
    expect(state.sets[0].winner).toBeNull();

    // 7-7
    state = scorePoint(state, 'B', standardRuleset).state;
    expect(state.tiebreakPointsA).toBe(7);
    expect(state.tiebreakPointsB).toBe(7);

    // 8-7
    state = scorePoint(state, 'A', standardRuleset).state;
    expect(state.sets[0].winner).toBeNull();

    // 9-7 -> 2-point lead, wins tiebreak
    const res = scorePoint(state, 'A', standardRuleset);
    expect(res.state.sets[0].winner).toBe('A');
    expect(res.state.sets[0].tiebreakPointsA).toBe(9);
    expect(res.state.sets[0].tiebreakPointsB).toBe(7);
    expect(res.state.sets[0].gamesA).toBe(7);
    expect(res.state.sets[0].gamesB).toBe(6);
  });

  // 11. Super tiebreak: in deciding set, score to 10
  it('11. Super tiebreak: in deciding set, score to 10', () => {
    let state = createMatchState(standardRuleset);

    // Set 1: A wins 6-0
    for (let i = 0; i < 6; i++) {
      state = winGame(state, 'A');
    }
    expect(state.setsWonA).toBe(1);
    expect(state.currentSet).toBe(2);

    // Set 2: B wins 6-0
    for (let i = 0; i < 6; i++) {
      state = winGame(state, 'B');
    }
    expect(state.setsWonA).toBe(1);
    expect(state.setsWonB).toBe(1);
    expect(state.currentSet).toBe(3);

    // Set 3 starts as super tiebreak!
    expect(state.isSuperTiebreak).toBe(true);
    expect(state.isTiebreak).toBe(true);
    expect(state.sets[2].isTiebreak).toBe(true);

    // Score to 9-9
    state = scorePoints(state, 'A', 9);
    state = scorePoints(state, 'B', 9);
    expect(state.isFinished).toBe(false);

    // A scores to 10-9 (not finished, needs 2-point lead)
    state = scorePoint(state, 'A', standardRuleset).state;
    expect(state.isFinished).toBe(false);

    // A scores to 11-9 (wins match)
    const res = scorePoint(state, 'A', standardRuleset);
    expect(res.state.isFinished).toBe(true);
    expect(res.state.winner).toBe('A');
    expect(res.state.setsWonA).toBe(2);
    expect(res.state.sets[2].tiebreakPointsA).toBe(11);
    expect(res.state.sets[2].tiebreakPointsB).toBe(9);
    expect(res.events.some((e) => e.type === 'MATCH_WON' && e.team === 'A')).toBe(true);
  });

  // 12. Complete match: best of 3 sets
  it('12. Complete match: best of 3 sets', () => {
    let state = createMatchState(standardRuleset);

    // Set 1: A wins 6-0
    for (let i = 0; i < 6; i++) {
      state = winGame(state, 'A');
    }
    expect(state.setsWonA).toBe(1);
    expect(state.isFinished).toBe(false);

    // Set 2: A wins 6-0
    let lastResult = scorePoint(state, 'A', standardRuleset);
    for (let i = 1; i < 24; i++) {
      lastResult = scorePoint(lastResult.state, 'A', standardRuleset);
    }
    state = lastResult.state;

    expect(state.setsWonA).toBe(2);
    expect(state.isFinished).toBe(true);
    expect(state.winner).toBe('A');
    expect(lastResult.events.some((e) => e.type === 'MATCH_WON' && e.team === 'A')).toBe(true);
  });

  // 13. Server rotation in normal games
  it('13. Server rotation in normal games', () => {
    let state = createMatchState(standardRuleset);
    expect(state.server).toBe('A');

    // After game 1: server switches to B
    state = winGame(state, 'A');
    expect(state.server).toBe('B');

    // After game 2: server switches to A
    state = winGame(state, 'B');
    expect(state.server).toBe('A');

    // After game 3: server switches to B
    state = winGame(state, 'A');
    expect(state.server).toBe('B');
  });

  // 14. Server rotation in tiebreak
  it('14. Server rotation in tiebreak', () => {
    let state = createMatchState(standardRuleset);
    // Reach 6-6
    for (let i = 0; i < 6; i++) {
      state = winGame(state, 'A');
      state = winGame(state, 'B');
    }
    expect(state.isTiebreak).toBe(true);
    const tbInitialServer = state.server;
    const tbOtherServer = tbInitialServer === 'A' ? 'B' : 'A';

    // Point 1: initial server serves
    // After point 1 (sum = 1): server changes
    state = scorePoint(state, 'A', standardRuleset).state;
    expect(state.server).toBe(tbOtherServer);

    // Point 2: other server serves
    // After point 2 (sum = 2): server remains other server
    state = scorePoint(state, 'B', standardRuleset).state;
    expect(state.server).toBe(tbOtherServer);

    // Point 3: other server serves
    // After point 3 (sum = 3): server changes back to initial server
    state = scorePoint(state, 'A', standardRuleset).state;
    expect(state.server).toBe(tbInitialServer);

    // Point 4: initial server serves
    // After point 4 (sum = 4): server remains initial server
    state = scorePoint(state, 'B', standardRuleset).state;
    expect(state.server).toBe(tbInitialServer);

    // Point 5: initial server serves
    // After point 5 (sum = 5): server changes to other server
    state = scorePoint(state, 'A', standardRuleset).state;
    expect(state.server).toBe(tbOtherServer);
  });

  // 15. Match state immutability (original state not modified)
  it('15. Match state immutability (original state not modified)', () => {
    const initialState = createMatchState(standardRuleset);
    const snapshot = JSON.stringify(initialState);

    const result = scorePoint(initialState, 'A', standardRuleset);

    expect(JSON.stringify(initialState)).toBe(snapshot);
    expect(result.state).not.toBe(initialState);
    expect(result.state.sets).not.toBe(initialState.sets);
    expect(result.state.sets[0]).not.toBe(initialState.sets[0]);
  });

  // 16. replayEvents produces same state as sequential scoring
  it('16. replayEvents produces same state as sequential scoring', () => {
    const actions: Array<{ team: Team }> = [
      { team: 'A' },
      { team: 'B' },
      { team: 'A' },
      { team: 'A' },
      { team: 'B' },
      { team: 'B' },
      { team: 'A' }, // Advantage A
      { team: 'B' }, // Deuce
      { team: 'B' }, // Advantage B
      { team: 'B' }, // Game B
      { team: 'A' },
      { team: 'A' },
      { team: 'A' },
      { team: 'A' }, // Game A
    ];

    let sequentialState = createMatchState(standardRuleset);
    for (const action of actions) {
      sequentialState = scorePoint(sequentialState, action.team, standardRuleset).state;
    }

    const replayedState = replayEvents(actions, standardRuleset);

    expect(replayedState).toEqual(sequentialState);
  });

  // Additional test: undoLastPoint
  it('undoLastPoint restores previous state with empty events', () => {
    const initial = createMatchState(standardRuleset);
    const scored = scorePoint(initial, 'A', standardRuleset).state;

    const reverted = undoLastPoint(scored, initial);
    expect(reverted.events).toEqual([]);
    expect(reverted.state).toEqual(initial);
  });

  // Additional test: Finished match ignores subsequent points
  it('finished match ignores subsequent points', () => {
    let state = createMatchState({ ...standardRuleset, setsToWin: 1 });
    // Win 6 games to win match
    for (let i = 0; i < 6; i++) {
      state = winGame(state, 'A', { ...standardRuleset, setsToWin: 1 });
    }
    expect(state.isFinished).toBe(true);

    const postMatchResult = scorePoint(state, 'B', { ...standardRuleset, setsToWin: 1 });
    expect(postMatchResult.events).toHaveLength(0);
    expect(postMatchResult.state.isFinished).toBe(true);
    expect(postMatchResult.state.winner).toBe('A');
  });
});
