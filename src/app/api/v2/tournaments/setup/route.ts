import { NextRequest, NextResponse } from "next/server";
import { createHash, randomInt, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireRole } from "@/middleware/auth.middleware";
import { organizationFor } from "@/lib/v2/access";
import { AppError, handleApiError } from "@/lib/errors";
import {
  PRESETS,
  draw,
  nextSocialRound,
} from "../../../../../../packages/core/src";
import { socialConfigSchema } from "@/lib/v2/validation";
import { scheduleMatches } from "@/engines/scheduling/scheduling-engine";
import { generateRoundRobinSchedule } from "@/engines/tournament/tournament-engine";

const schema = z.object({
  requestId: z.string().uuid(),
  name: z.string().trim().min(3).max(120),
  location: z.string().trim().max(200),
  start: z.string().datetime(),
  timezone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]),
  category: z.string().trim().min(2).max(100),
  courts: z.number().int().min(1).max(16),
  preset: z.enum(["SINGLE", "STANDARD", "SHORT"]),
  deuce: z.enum(["ADVANTAGE", "GOLDEN_POINT", "STAR_POINT"]).optional(),
  format: z.enum(["SINGLE_ELIMINATION", "ROUND_ROBIN"]),
  pairs: z
    .array(
      z.tuple([
        z.string().trim().min(2).max(100),
        z.string().trim().min(2).max(100),
      ]),
    )
    .min(2)
    .max(64),
  duration: z.number().int().min(15).max(180),
  rest: z.number().int().min(0).max(180),
});
const socialSetupSchema = schema
  .pick({
    requestId: true,
    name: true,
    location: true,
    start: true,
    timezone: true,
    courts: true,
  })
  .extend({
    format: z.enum(["AMERICANO", "MEXICANO"]),
    players: z.array(z.string().trim().min(2).max(100)).min(4).max(128),
    ...socialConfigSchema.pick({
      target: true,
      rounds: true,
      ranking: true,
      pairing: true,
    }).shape,
  });
const setupSchema = z.discriminatedUnion("format", [schema, socialSetupSchema]);
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ["ORGANIZER", "SUPER_ADMIN"]);
    const body = setupSchema.parse(await req.json());
    const requestHash = createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex");
    const organizationId = await organizationFor(
      user,
      req.headers.get("X-Organization-Id") ?? undefined,
    );
    if ("players" in body) {
      const names = body.players.map((name) => name.toLocaleLowerCase("id"));
      if (new Set(names).size !== names.length)
        throw AppError.badRequest(
          "Ada nama pemain berulang. Gunakan nama lengkap yang berbeda.",
        );
      const event = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${body.requestId}))`;
          if (
            await tx.tournament.findUnique({
              where: { id: body.requestId },
              select: { id: true },
            })
          )
            throw AppError.conflict(
              "Permintaan ini sudah membuat turnamen. Periksa daftar acara.",
            );
          const existing = await tx.socialEvent.findUnique({
            where: { id: body.requestId },
          });
          if (existing) {
            const audit = await tx.auditLog.findFirst({
              where: {
                entityId: body.requestId,
                action: "CREATE_SOCIAL_SETUP",
                userId: user.userId,
              },
            });
            if (
              existing.organizationId !== organizationId ||
              (audit?.after as { requestHash?: string } | null)?.requestHash !==
                requestHash
            ) {
              throw AppError.conflict(
                "Permintaan sebelumnya sudah digunakan. Periksa daftar acara sebelum membuat acara baru.",
              );
            }
            return existing;
          }
          const participants = [];
          for (const name of body.players) {
            const player = await tx.player.create({
              data: { organizationId, fullName: name },
            });
            participants.push({ id: player.id, name, active: true });
          }
          const config = {
            courts: body.courts,
            rounds: body.rounds,
            target: body.target,
            ranking: body.ranking,
            pairing: body.pairing,
            start: body.start,
            timezone: body.timezone,
            location: body.location,
          };
          const round = nextSocialRound(body.format, participants, [], config);
          const created = await tx.socialEvent.create({
            data: {
              id: body.requestId,
              organizationId,
              name: body.name,
              format: body.format,
              config,
              participants,
              rounds: JSON.parse(JSON.stringify([round])),
            },
          });
          await tx.auditLog.create({
            data: {
              userId: user.userId,
              action: "CREATE_SOCIAL_SETUP",
              entityType: "SocialEvent",
              entityId: created.id,
              after: { requestHash },
            },
          });
          return created;
        },
        { timeout: 30000 },
      );
      return NextResponse.json(
        { data: { id: event.id, kind: "SOCIAL" } },
        { status: 201 },
      );
    }
    const names = body.pairs.flat().map((n) => n.toLocaleLowerCase("id"));
    if (new Set(names).size !== names.length)
      throw AppError.badRequest(
        "Ada nama pemain berulang. Gunakan nama lengkap yang membedakan tiap pemain.",
      );
    const tournament = await prisma.$transaction(
      async (tx) => {
        // Same request key serializes double-clicks and network retries without duplicating an event.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${body.requestId}))`;
        if (
          await tx.socialEvent.findUnique({
            where: { id: body.requestId },
            select: { id: true },
          })
        )
          throw AppError.conflict(
            "Permintaan ini sudah membuat acara sosial. Periksa daftar acara.",
          );
        const existing = await tx.tournament.findUnique({
          where: { id: body.requestId },
          include: { members: true },
        });
        if (existing) {
          if (
            existing.organizationId !== organizationId ||
            !existing.members.some((m) => m.userId === user.userId)
          )
            throw AppError.conflict("ID permintaan sudah digunakan");
          const audit = await tx.auditLog.findFirst({
            where: {
              entityId: body.requestId,
              action: "CREATE_TOURNAMENT_SETUP",
            },
          });
          if (
            (audit?.after as { requestHash?: string } | null)?.requestHash !==
            requestHash
          )
            throw AppError.conflict(
              "Permintaan sebelumnya sudah membuat acara dengan data berbeda. Periksa daftar turnamen sebelum membuat acara baru.",
            );
          return existing;
        }
        const t = await tx.tournament.create({
          data: {
            id: body.requestId,
            name: body.name,
            slug: `${body.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .slice(0, 60)}-${randomUUID().slice(0, 8)}`,
            location: body.location,
            startDate: new Date(body.start),
            endDate: new Date(body.start),
            timezone: body.timezone,
            organizationId,
            members: { create: { userId: user.userId, role: "OWNER" } },
          },
        });
        const c = await tx.category.create({
          data: {
            tournamentId: t.id,
            name: body.category,
            format: body.format,
            rulesV2: JSON.parse(
              JSON.stringify({
                ...PRESETS[body.preset],
                ...(body.deuce ? { deuce: body.deuce } : {}),
              }),
            ),
          },
        });
        const courts = [];
        for (let i = 0; i < body.courts; i++)
          courts.push(
            await tx.court.create({
              data: {
                tournamentId: t.id,
                name: `Lapangan ${i + 1}`,
                priority: body.courts - i,
              },
            }),
          );
        const entries: Prisma.EntryGetPayload<{
          include: { players: true };
        }>[] = [];
        for (const pair of body.pairs) {
          const players = [];
          for (const fullName of pair)
            players.push(
              await tx.player.create({ data: { organizationId, fullName } }),
            );
          entries.push(
            await tx.entry.create({
              data: {
                categoryId: c.id,
                name: pair.join(" / "),
                players: { create: players.map((p) => ({ playerId: p.id })) },
              },
              include: { players: true },
            }),
          );
        }
        const nodes =
          body.format === "SINGLE_ELIMINATION"
            ? draw(
                entries,
                "SINGLE_ELIMINATION",
                "RANDOM",
                entries.map(() => randomInt(0, 0x1000000) / 0x1000000),
              )
            : generateRoundRobinSchedule(entries).map((match, i) => ({
                a: match.entryA?.id ?? null,
                b: match.entryB?.id ?? null,
                round: match.round,
                number: i + 1,
                bye: false,
                side: "WINNERS" as const,
                winnerTo: undefined,
                loserTo: undefined,
              }));
        const stage = await tx.stage.create({
          data: {
            categoryId: c.id,
            name:
              body.format === "ROUND_ROBIN" ? "Semua pasangan" : "Bagan utama",
            type:
              body.format === "ROUND_ROBIN" ? "GROUP" : "SINGLE_ELIMINATION",
            order: 1,
            config: JSON.parse(JSON.stringify({ draw: nodes })),
          },
        });
        const group =
          body.format === "ROUND_ROBIN"
            ? await tx.group.create({
                data: { stageId: stage.id, name: "Grup A" },
              })
            : null;
        const matches = [];
        for (const n of nodes)
          matches.push(
            await tx.match.create({
              data: {
                stageId: stage.id,
                groupId: group?.id,
                round: n.round,
                matchNumber: n.number,
                entryAId: n.a,
                entryBId: n.b,
                bracketSide: n.side,
                status: n.bye ? "APPROVED" : "SCHEDULED",
                approvalStatus: n.bye ? "APPROVED" : "PENDING",
                winnerId: n.bye ? (n.a ?? n.b) : null,
              },
            }),
          );
        const playable = matches.filter((m) => m.status === "SCHEDULED");
        const plan = scheduleMatches(
          playable.map((m) => ({
            id: m.id,
            round: m.round,
            matchNumber: m.matchNumber,
            entryAId: m.entryAId,
            entryBId: m.entryBId,
            playerIds: entries
              .filter((e) => e.id === m.entryAId || e.id === m.entryBId)
              .flatMap((e) => e.players.map((p) => p.playerId)),
            dependencyIds: playable
              .filter((parent) => {
                const n = nodes.find((n) => n.number === parent.matchNumber);
                return (
                  n?.winnerTo?.[0] === m.matchNumber ||
                  n?.loserTo?.[0] === m.matchNumber
                );
              })
              .map((m) => m.id),
          })),
          courts,
          {
            startTime: new Date(body.start),
            matchDurationMinutes: body.duration,
            minRestMinutes: body.rest,
          },
        );
        for (const item of plan.scheduledMatches)
          await tx.match.update({
            where: { id: item.matchId },
            data: {
              courtId: item.courtId,
              scheduledAt: item.scheduledAt,
              estimatedEndAt: item.estimatedEndAt,
            },
          });
        await tx.tournament.update({
          where: { id: t.id },
          data: { endDate: plan.timelineEnd },
        });
        await tx.auditLog.create({
          data: {
            userId: user.userId,
            tournamentId: t.id,
            action: "CREATE_TOURNAMENT_SETUP",
            entityType: "Tournament",
            entityId: t.id,
            after: {
              pairs: entries.length,
              matches: playable.length,
              requestHash,
            },
          },
        });
        return t;
      },
      { timeout: 30000 },
    );
    return NextResponse.json({ data: { id: tournament.id } }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
