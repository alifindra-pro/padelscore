import { rawSql } from "@neon/realtime/server";

export type ScoreScope = "matches" | "tournaments";

export function scoreQuery(
  kind: ScoreScope,
  id: string,
  userId: string | null,
) {
  // Only public score fields are exposed. Membership is checked on every live result,
  // so unpublishing a tournament or revoking membership removes access immediately.
  return rawSql(
    `
    SELECT m.id, m.version, m.status,
      t.id AS tournament_id,
      s.id AS snapshot_id, s.current_set, s.points_a, s.points_b,
      s.sets_a, s.sets_b, s.games_a, s.games_b, s.server,
      s.is_tiebreak, s.tiebreak_pts_a, s.tiebreak_pts_b,
      s.version AS score_version
    FROM matches m
    JOIN stages st ON st.id = m.stage_id
    JOIN categories c ON c.id = st.category_id
    JOIN tournaments t ON t.id = c.tournament_id
    LEFT JOIN match_score_snapshots s ON s.match_id = m.id
    WHERE ${kind === "matches" ? "m.id" : "t.id"} = $1
      AND (
        t.status IN ('PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED')
        OR EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = $2 AND u.is_active = true
          AND (
            u.role = 'SUPER_ADMIN'
            OR (u.role <> 'VIEWER' AND (
              EXISTS (SELECT 1 FROM tournament_members tm
                WHERE tm.tournament_id = t.id AND tm.user_id = u.id)
              OR EXISTS (SELECT 1 FROM "OrganizationMember" om
                WHERE om."organizationId" = t."organizationId" AND om."userId" = u.id)
            ))
            ${
              kind === "matches"
                ? `OR (u.role = 'REFEREE' AND EXISTS (
              SELECT 1 FROM match_officials mo WHERE mo.match_id = m.id AND mo.user_id = u.id
            ))`
                : ""
            }
          )
        )
      )
    ORDER BY m.id
  `,
    [id, userId],
  );
}
