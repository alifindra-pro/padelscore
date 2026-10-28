import { z } from "zod";
export const rulesSchema = z.object({
  version: z.literal(2),
  name: z.string().min(1).max(120),
  source: z.enum(["FIP_REFERENCE", "LOCAL", "COMMUNITY"]),
  sourceUrl: z.string().url().optional(),
  setsToWin: z.number().int().min(1).max(3),
  gamesPerSet: z.number().int().min(1).max(12),
  tiebreakAt: z.number().int().min(1).max(12),
  tiebreakPoints: z.number().int().min(2).max(100),
  deuce: z.enum(["ADVANTAGE", "GOLDEN_POINT", "STAR_POINT"]),
  decidingMatchTiebreak: z.boolean(),
  matchTiebreakPoints: z.number().int().min(2).max(100),
  mode: z.enum(["SETS", "TIMED"]),
  durationMinutes: z.number().int().min(1).max(120),
  allowDraw: z.boolean(),
});
const team = z.enum(["A", "B"]);
const at = z.number().int().nonnegative();
const reason = z.string().trim().min(3).max(1000);
const pair = z.tuple([
  z.number().int().min(0).max(10000),
  z.number().int().min(0).max(10000),
]);
export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("START_MATCH"),
    at,
    serviceOrder: z
      .tuple([z.string(), z.string(), z.string(), z.string()])
      .optional(),
    receivingOrder: z
      .tuple([z.string(), z.string(), z.string(), z.string()])
      .optional(),
  }),
  z.object({ type: z.literal("AWARD_POINT"), team }),
  z.object({
    type: z.literal("SELECT_RECEIVER_SIDE"),
    side: z.enum(["RIGHT", "LEFT"]),
  }),
  ...(
    [
      "RECORD_FIRST_SERVE_FAULT",
      "RECORD_SECOND_SERVE_FAULT",
      "WARMUP",
      "CANCEL_MATCH",
      "FINALIZE_MATCH",
    ] as const
  ).map((type) => z.object({ type: z.literal(type) })),
  ...(["SUSPEND_MATCH", "RESUME_MATCH", "TIME_EXPIRED"] as const).map((type) =>
    z.object({ type: z.literal(type), at }),
  ),
  ...(
    ["RECORD_RETIREMENT", "RECORD_WALKOVER", "RECORD_DISQUALIFICATION"] as const
  ).map((type) => z.object({ type: z.literal(type), loser: team, reason })),
  z.object({
    type: z.literal("CORRECT_SCORE"),
    points: pair,
    games: pair,
    reason,
  }),
  z.object({ type: z.literal("UNDO_LAST_ACTION"), reason }),
]);
export const syncSchema = z.object({
  deviceId: z.string().uuid(),
  ownershipVersion: z.number().int().min(0),
  rulesVersion: z.literal(2),
  events: z
    .array(
      z.object({
        id: z.string().uuid(),
        baseVersion: z.number().int().min(0),
        sequence: z.number().int().positive(),
        action: actionSchema,
      }),
    )
    .min(1)
    .max(500),
});
export const socialConfigSchema = z.object({
  courts: z.number().int().min(1).max(32),
  rounds: z.number().int().min(1).max(100),
  target: z.number().int().min(1).max(200),
  ranking: z.enum(["AVERAGE", "TOTAL"]),
  pairing: z.enum(["BALANCED", "ADJACENT"]),
});
export const socialPlayersSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(150),
      active: z.boolean(),
    }),
  )
  .min(4)
  .max(128);
export const standingsSchema = z.object({
  winPoints: z.number().min(0).max(100),
  lossPoints: z.number().min(0).max(100),
  drawPoints: z.number().min(0).max(100),
  tieBreakers: z
    .array(
      z.enum([
        "POINTS",
        "WINS",
        "HEAD_TO_HEAD",
        "SET_DIFFERENCE",
        "GAME_DIFFERENCE",
        "SETS_WON",
        "GAMES_WON",
        "PLAYOFF",
      ]),
    )
    .min(1)
    .max(8),
});
