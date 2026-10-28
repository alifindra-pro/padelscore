import { MatchState, PointScore, Ruleset, ScoringEvent, ScoringResult, SetState, Team } from './types';

/**
 * Returns the opposing team.
 */
function otherTeam(team: Team): Team {
  return team === 'A' ? 'B' : 'A';
}

/**
 * Determines whether golden point rules apply based on the ruleset.
 */
function isGoldenPointRule(ruleset: Ruleset): boolean {
  return ruleset.goldenPoint || ruleset.deuceType === 'GOLDEN_POINT' || ruleset.deuceType === 'NO_AD';
}

/**
 * Creates a fresh, initial MatchState.
 *
 * @param ruleset Match configuration and rules
 * @returns Initialized MatchState
 */
export function createMatchState(ruleset: Ruleset): MatchState {
  const isDecidingSet = ruleset.setsToWin === 1;
  const isInitialSuperTiebreak = isDecidingSet && ruleset.superTiebreak;

  const initialSet: SetState = {
    setNumber: 1,
    gamesA: 0,
    gamesB: 0,
    isTiebreak: isInitialSuperTiebreak,
    tiebreakPointsA: 0,
    tiebreakPointsB: 0,
    winner: null,
  };

  return {
    currentSet: 1,
    sets: [initialSet],
    pointsA: '0',
    pointsB: '0',
    server: 'A',
    isDeuce: false,
    isTiebreak: isInitialSuperTiebreak,
    isSuperTiebreak: isInitialSuperTiebreak,
    tiebreakPointsA: 0,
    tiebreakPointsB: 0,
    isFinished: false,
    winner: null,
    setsWonA: 0,
    setsWonB: 0,
  };
}

/**
 * Deep clones a MatchState object to ensure complete immutability.
 */
function cloneMatchState(state: MatchState): MatchState {
  return {
    ...state,
    sets: state.sets.map((s) => ({ ...s })),
  };
}

/**
 * Calculates who served the first point in the current tiebreak based on current
 * tiebreak points and current server.
 */
function getTiebreakInitialServer(totalTiebreakPtsBefore: number, currentServer: Team): Team {
  const switchesSoFar = Math.floor((totalTiebreakPtsBefore + 1) / 2);
  return switchesSoFar % 2 === 1 ? otherTeam(currentServer) : currentServer;
}

/**
 * Scores a single point for the specified team and updates the match state.
 * Pure function: Does not mutate the input state.
 *
 * @param state Current match state
 * @param scoringTeam The team that scored the point
 * @param ruleset Ruleset governing the match
 * @returns ScoringResult containing the new state and list of triggered events
 */
export function scorePoint(
  state: MatchState,
  scoringTeam: Team,
  ruleset: Ruleset
): ScoringResult {
  // If match has already finished, return existing state unchanged
  if (state.isFinished) {
    return {
      state: cloneMatchState(state),
      events: [],
    };
  }

  const newState = cloneMatchState(state);
  const events: ScoringEvent[] = [
    {
      type: 'POINT_SCORED',
      team: scoringTeam,
      data: {
        setNumber: newState.currentSet,
      },
    },
  ];

  const currentSetIndex = newState.currentSet - 1;
  const currentSet = newState.sets[currentSetIndex];

  // -------------------------------------------------------------------------
  // 1. TIEBREAK SCORING (Standard Tiebreak or Super Tiebreak)
  // -------------------------------------------------------------------------
  if (newState.isTiebreak) {
    const totalPtsBefore = newState.tiebreakPointsA + newState.tiebreakPointsB;
    const initialTiebreakServer = getTiebreakInitialServer(totalPtsBefore, newState.server);

    let newPtsA = newState.tiebreakPointsA;
    let newPtsB = newState.tiebreakPointsB;

    if (scoringTeam === 'A') {
      newPtsA += 1;
    } else {
      newPtsB += 1;
    }

    newState.tiebreakPointsA = newPtsA;
    newState.tiebreakPointsB = newPtsB;
    currentSet.tiebreakPointsA = newPtsA;
    currentSet.tiebreakPointsB = newPtsB;

    const scoringPts = scoringTeam === 'A' ? newPtsA : newPtsB;
    const opponentPts = scoringTeam === 'A' ? newPtsB : newPtsA;

    const targetPoints = newState.isSuperTiebreak
      ? ruleset.superTiebreakPts
      : ruleset.tiebreakPoints;

    const isTiebreakWon = scoringPts >= targetPoints && scoringPts - opponentPts >= 2;

    if (isTiebreakWon) {
      // Tiebreak / Super Tiebreak won!
      events.push({
        type: 'GAME_WON',
        team: scoringTeam,
        data: { setNumber: newState.currentSet },
      });

      events.push({
        type: 'SET_WON',
        team: scoringTeam,
        data: { setNumber: newState.currentSet },
      });

      if (newState.isSuperTiebreak) {
        currentSet.gamesA = scoringTeam === 'A' ? 1 : 0;
        currentSet.gamesB = scoringTeam === 'B' ? 1 : 0;
      } else {
        currentSet.gamesA = scoringTeam === 'A' ? currentSet.gamesA + 1 : currentSet.gamesA;
        currentSet.gamesB = scoringTeam === 'B' ? currentSet.gamesB + 1 : currentSet.gamesB;
      }

      currentSet.winner = scoringTeam;

      if (scoringTeam === 'A') {
        newState.setsWonA += 1;
      } else {
        newState.setsWonB += 1;
      }

      // Check match completion
      if (
        newState.setsWonA === ruleset.setsToWin ||
        newState.setsWonB === ruleset.setsToWin
      ) {
        newState.isFinished = true;
        newState.winner = scoringTeam;
        events.push({
          type: 'MATCH_WON',
          team: scoringTeam,
        });
      } else {
        // Prepare next set
        const nextSetNumber = newState.currentSet + 1;
        const isDecidingSet =
          newState.setsWonA === ruleset.setsToWin - 1 &&
          newState.setsWonB === ruleset.setsToWin - 1;
        const nextIsSuperTiebreak = ruleset.superTiebreak && isDecidingSet;

        // In standard rules: receiver of first tiebreak point serves game 1 of next set
        const nextServer = otherTeam(initialTiebreakServer);

        newState.currentSet = nextSetNumber;
        newState.pointsA = '0';
        newState.pointsB = '0';
        newState.isDeuce = false;
        newState.isTiebreak = nextIsSuperTiebreak;
        newState.isSuperTiebreak = nextIsSuperTiebreak;
        newState.tiebreakPointsA = 0;
        newState.tiebreakPointsB = 0;
        newState.server = nextServer;

        const newSet: SetState = {
          setNumber: nextSetNumber,
          gamesA: 0,
          gamesB: 0,
          isTiebreak: nextIsSuperTiebreak,
          tiebreakPointsA: 0,
          tiebreakPointsB: 0,
          winner: null,
        };

        newState.sets.push(newSet);

        if (nextIsSuperTiebreak) {
          events.push({
            type: 'SUPER_TIEBREAK_START',
            team: nextServer,
            data: { setNumber: nextSetNumber },
          });
        }
      }
    } else {
      // Tiebreak still in progress: rotate server if sum of points is odd
      const totalPtsAfter = newPtsA + newPtsB;
      if (totalPtsAfter % 2 === 1) {
        newState.server = otherTeam(newState.server);
      }
    }

    return { state: newState, events };
  }

  // -------------------------------------------------------------------------
  // 2. REGULAR GAME SCORING
  // -------------------------------------------------------------------------
  const isGolden = isGoldenPointRule(ruleset);
  const currentPtsScoring = scoringTeam === 'A' ? newState.pointsA : newState.pointsB;
  const currentPtsOpponent = scoringTeam === 'A' ? newState.pointsB : newState.pointsA;

  let gameWon = false;
  let newPtsScoring: PointScore = currentPtsScoring;
  let newPtsOpponent: PointScore = currentPtsOpponent;
  let newIsDeuce = false;

  if (currentPtsScoring === '0') {
    newPtsScoring = '15';
    newIsDeuce = false;
  } else if (currentPtsScoring === '15') {
    newPtsScoring = '30';
    newIsDeuce = false;
  } else if (currentPtsScoring === '30') {
    newPtsScoring = '40';
    newIsDeuce = currentPtsOpponent === '40';
  } else if (currentPtsScoring === '40') {
    if (currentPtsOpponent === '40') {
      // At deuce (40-40)
      if (isGolden) {
        gameWon = true;
      } else {
        // Advantage mode
        newPtsScoring = 'AD';
        newIsDeuce = false;
      }
    } else if (currentPtsOpponent === 'AD') {
      // Opponent had advantage: return to deuce
      newPtsScoring = '40';
      newPtsOpponent = '40';
      newIsDeuce = true;
    } else {
      // Opponent had '0', '15', or '30': scoring team wins game
      gameWon = true;
    }
  } else if (currentPtsScoring === 'AD') {
    // Scoring team had advantage: wins game
    gameWon = true;
  }

  if (scoringTeam === 'A') {
    newState.pointsA = newPtsScoring;
    newState.pointsB = newPtsOpponent;
  } else {
    newState.pointsA = newPtsOpponent;
    newState.pointsB = newPtsScoring;
  }
  newState.isDeuce = newIsDeuce;

  // -------------------------------------------------------------------------
  // 3. GAME WON RESOLUTION
  // -------------------------------------------------------------------------
  if (gameWon) {
    events.push({
      type: 'GAME_WON',
      team: scoringTeam,
      data: { setNumber: newState.currentSet },
    });

    // Reset game points
    newState.pointsA = '0';
    newState.pointsB = '0';
    newState.isDeuce = false;

    // Normal game server rotation: switches after every game
    newState.server = otherTeam(newState.server);

    // Update game score in current set
    if (scoringTeam === 'A') {
      currentSet.gamesA += 1;
    } else {
      currentSet.gamesB += 1;
    }

    const gamesScoring = scoringTeam === 'A' ? currentSet.gamesA : currentSet.gamesB;
    const gamesOpponent = scoringTeam === 'A' ? currentSet.gamesB : currentSet.gamesA;

    // Check tiebreak condition (e.g. 6-6)
    if (
      currentSet.gamesA === ruleset.tiebreakAt &&
      currentSet.gamesB === ruleset.tiebreakAt
    ) {
      newState.isTiebreak = true;
      currentSet.isTiebreak = true;
      newState.tiebreakPointsA = 0;
      newState.tiebreakPointsB = 0;

      events.push({
        type: 'TIEBREAK_START',
        team: newState.server,
        data: { setNumber: newState.currentSet },
      });
    } else {
      // Check set win condition (e.g., 6-4, 7-5)
      const isSetWon =
        gamesScoring >= ruleset.gamesPerSet && gamesScoring - gamesOpponent >= 2;

      if (isSetWon) {
        currentSet.winner = scoringTeam;
        events.push({
          type: 'SET_WON',
          team: scoringTeam,
          data: { setNumber: newState.currentSet },
        });

        if (scoringTeam === 'A') {
          newState.setsWonA += 1;
        } else {
          newState.setsWonB += 1;
        }

        // Check match win condition
        if (
          newState.setsWonA === ruleset.setsToWin ||
          newState.setsWonB === ruleset.setsToWin
        ) {
          newState.isFinished = true;
          newState.winner = scoringTeam;
          events.push({
            type: 'MATCH_WON',
            team: scoringTeam,
          });
        } else {
          // Setup next set
          const nextSetNumber = newState.currentSet + 1;
          const isDecidingSet =
            newState.setsWonA === ruleset.setsToWin - 1 &&
            newState.setsWonB === ruleset.setsToWin - 1;
          const nextIsSuperTiebreak = ruleset.superTiebreak && isDecidingSet;

          newState.currentSet = nextSetNumber;
          newState.pointsA = '0';
          newState.pointsB = '0';
          newState.isDeuce = false;
          newState.isTiebreak = nextIsSuperTiebreak;
          newState.isSuperTiebreak = nextIsSuperTiebreak;
          newState.tiebreakPointsA = 0;
          newState.tiebreakPointsB = 0;

          const newSet: SetState = {
            setNumber: nextSetNumber,
            gamesA: 0,
            gamesB: 0,
            isTiebreak: nextIsSuperTiebreak,
            tiebreakPointsA: 0,
            tiebreakPointsB: 0,
            winner: null,
          };

          newState.sets.push(newSet);

          if (nextIsSuperTiebreak) {
            events.push({
              type: 'SUPER_TIEBREAK_START',
              team: newState.server,
              data: { setNumber: nextSetNumber },
            });
          }
        }
      }
    }
  }

  return { state: newState, events };
}

/**
 * Undoes the last point by restoring the previous state.
 *
 * @param _state Current match state
 * @param previousState Previous match state to revert to
 * @returns ScoringResult with the previous state and an empty events array
 */
export function undoLastPoint(
  _state: MatchState,
  previousState: MatchState
): ScoringResult {
  return {
    state: cloneMatchState(previousState),
    events: [],
  };
}

/**
 * Replays a list of point events from the start of a match.
 *
 * @param eventActions Array of actions containing the team that scored
 * @param ruleset Ruleset governing the match
 * @returns Reconstructed MatchState
 */
export function replayEvents(
  eventActions: Array<{ team: Team }>,
  ruleset: Ruleset
): MatchState {
  let currentState = createMatchState(ruleset);
  for (const action of eventActions) {
    const result = scorePoint(currentState, action.team, ruleset);
    currentState = result.state;
  }
  return currentState;
}
