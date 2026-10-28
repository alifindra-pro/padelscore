import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  getAuthUser,
  requireAuth,
  AuthUser,
} from "@/middleware/auth.middleware";
import { AppError, handleApiError } from "@/lib/errors";
export const PUBLIC_STATUSES = [
  "PUBLISHED",
  "IN_PROGRESS",
  "COMPLETED",
  "ARCHIVED",
];
export async function organizationAccess(
  user: AuthUser,
  id: string,
  write = true,
) {
  if (user.role === "SUPER_ADMIN") return;
  const member = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: id, userId: user.userId },
    },
  });
  if (!member || (write && !["OWNER", "ADMIN", "STAFF"].includes(member.role)))
    throw AppError.forbidden("Anda tidak memiliki akses organisasi ini");
}
export async function tournamentAccess(
  user: AuthUser,
  id: string,
  write = true,
) {
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: { members: true },
  });
  if (!t) throw AppError.notFound("Turnamen tidak ditemukan");
  if (user.role === "SUPER_ADMIN") return t;
  const member = t.members.find((m) => m.userId === user.userId);
  if (member && (!write || ["OWNER", "ADMIN"].includes(member.role))) return t;
  if (t.organizationId) {
    await organizationAccess(user, t.organizationId, write);
    return t;
  }
  throw AppError.forbidden("Anda tidak memiliki akses turnamen ini");
}
export async function matchAccess(
  user: AuthUser,
  id: string,
  adminOnly = false,
) {
  const m = await prisma.match.findUnique({
    where: { id },
    include: { stage: { include: { category: true } }, officials: true },
  });
  if (!m) throw AppError.notFound("Pertandingan tidak ditemukan");
  if (user.role === "REFEREE") {
    if (adminOnly || !m.officials.some((o) => o.userId === user.userId))
      throw AppError.forbidden("Pertandingan bukan penugasan Anda");
  } else await tournamentAccess(user, m.stage.category.tournamentId, true);
  return m;
}
export async function organizationFor(user: AuthUser, requested?: string) {
  if (requested) {
    await organizationAccess(user, requested);
    return requested;
  }
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.userId, role: { in: ["OWNER", "ADMIN", "STAFF"] } },
  });
  if (memberships.length !== 1)
    throw AppError.badRequest("Pilih organisasi terlebih dahulu");
  return memberships[0].organizationId;
}
// Explicit public projection. Never serialize Prisma objects directly on spectator routes.
const allowed = new Set([
  "id",
  "name",
  "fullName",
  "slug",
  "description",
  "location",
  "timezone",
  "startDate",
  "endDate",
  "status",
  "format",
  "seed",
  "round",
  "order",
  "type",
  "matchNumber",
  "scheduledAt",
  "startedAt",
  "finishedAt",
  "updatedAt",
  "version",
  "currentSet",
  "pointsA",
  "pointsB",
  "gamesA",
  "gamesB",
  "setsA",
  "setsB",
  "isTiebreak",
  "tiebreakPtsA",
  "tiebreakPtsB",
  "server",
  "winnerId",
  "entryAId",
  "entryBId",
  "courtId",
  "courtName",
  "categoryId",
  "categories",
  "entries",
  "players",
  "player",
  "stages",
  "groups",
  "standings",
  "matches",
  "entry",
  "entryA",
  "entryB",
  "winner",
  "court",
  "courts",
  "scoreSnapshot",
  "snapshot",
  "stage",
  "category",
  "tournament",
  "_count",
  "played",
  "won",
  "lost",
  "drawn",
  "points",
  "setsWon",
  "setsLost",
  "gamesWon",
  "gamesLost",
  "rank",
  "pointsScored",
  "items",
  "total",
  "page",
  "limit",
  "totalPages",
  "data",
  "ruleset",
  "setsToWin",
  "gamesPerSet",
  "tiebreakAt",
  "tiebreakPoints",
  "goldenPoint",
  "superTiebreak",
  "superTiebreakPts",
  "deuceType",
  "activeMatch",
  "isActive",
  "priority",
  "tournamentId",
  "matchId",
  "engineVersion",
]);
export function publicProjection(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(publicProjection);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => allowed.has(k))
        .map(([k, v]) => [k, publicProjection(v)]),
    );
  return value;
}
export async function legacyAccess(request: NextRequest) {
  const user = await getAuthUser(request);
  const parts = request.nextUrl.pathname.split("/").filter(Boolean).slice(2);
  const write = request.method !== "GET";
  let [kind, id] = parts;
  if (kind === "stream") {
    kind = parts[1];
    id = parts[2];
  }
  if (kind === "tournaments" && id === "slug") {
    const t = await prisma.tournament.findUnique({ where: { slug: parts[2] } });
    if (!t || !PUBLIC_STATUSES.includes(t.status))
      throw AppError.notFound("Turnamen belum dipublikasikan");
    return true;
  }
  if (kind === "tournaments" && !id) return !user;
  if (kind === "matches" && id === "assigned") {
    await requireAuth(request);
    return false;
  }
  let tournamentId: string | undefined;
  if (kind === "tournaments") tournamentId = id;
  if (kind === "categories") {
    const c = await prisma.category.findUnique({ where: { id } });
    tournamentId = c?.tournamentId;
  }
  if (kind === "entries") {
    const e = await prisma.entry.findUnique({
      where: { id },
      include: { category: true },
    });
    tournamentId = e?.category.tournamentId;
  }
  if (kind === "courts") {
    const c = await prisma.court.findUnique({ where: { id } });
    tournamentId = c?.tournamentId;
  }
  if (kind === "matches") {
    const m = await prisma.match.findUnique({
      where: { id },
      include: { stage: { include: { category: true } } },
    });
    tournamentId = m?.stage.category.tournamentId;
    if (!write && user?.role === "REFEREE") {
      try {
        await matchAccess(user, id);
        return false;
      } catch {
        /* Unassigned referees only see published scores. */
      }
    }
    if (write) {
      if (!user) throw AppError.unauthorized();
      await matchAccess(
        user,
        id,
        ["approve-result", "reopen"].includes(parts[2]),
      );
      if (m?.engineVersion === 2)
        throw AppError.conflict(
          "Gunakan konsol skor versi baru untuk pertandingan ini",
        );
      return false;
    }
  }
  if (tournamentId) {
    if (write) {
      if (!user) throw AppError.unauthorized();
      await tournamentAccess(user, tournamentId);
      return false;
    }
    if (user && user.role !== "VIEWER") {
      try {
        await tournamentAccess(user, tournamentId, false);
        return false;
      } catch {
        /* A staff account can still view a public event. */
      }
    }
    const t = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!t || !PUBLIC_STATUSES.includes(t.status))
      throw AppError.notFound("Turnamen belum dipublikasikan");
    return true;
  }
  if (kind === "players") {
    if (!user || !["SUPER_ADMIN", "ORGANIZER"].includes(user.role))
      throw AppError.forbidden("Data pemain hanya untuk pengelola");
    if (id && id !== "leaderboard") {
      const p = await prisma.player.findUnique({ where: { id } });
      if (!p) throw AppError.notFound();
      if (user.role !== "SUPER_ADMIN") {
        if (!p.organizationId)
          throw AppError.forbidden("Pemain belum ditempatkan dalam organisasi");
        await organizationAccess(user, p.organizationId);
      }
    }
    return false;
  }
  throw AppError.notFound();
}
export function withLegacyAccess<C>(
  handler: (request: NextRequest, context: C) => Promise<Response>,
) {
  return async (request: NextRequest, context: C) => {
    try {
      const isPublic = await legacyAccess(request);
      const response = await handler(request, context);
      if (
        isPublic &&
        response.headers.get("content-type")?.includes("application/json") &&
        response.ok
      )
        return NextResponse.json(publicProjection(await response.json()), {
          status: response.status,
        });
      return response;
    } catch (error) {
      return handleApiError(error);
    }
  };
}
