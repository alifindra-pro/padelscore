import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes, randomInt } from "node:crypto";
import prisma from "@/lib/db";
import { scheduleMatch } from "@/services/v2/schedule";
import { AppError, handleApiError } from "@/lib/errors";
import { requireAuth, requireRole } from "@/middleware/auth.middleware";
import { hashPassword } from "@/lib/auth";
import {
  organizationAccess,
  organizationFor,
  tournamentAccess,
  matchAccess,
  publicProjection,
  PUBLIC_STATUSES,
} from "@/lib/v2/access";
import {
  rulesSchema,
  socialConfigSchema,
  socialPlayersSchema,
  standingsSchema,
} from "@/lib/v2/validation";
import {
  claimMatch,
  syncActions,
  approveV2,
  json,
} from "@/services/v2/scoring";
import { mobileLogin, refreshSession, tokenHash } from "@/services/v2/auth";
import { saveAvatar, readAvatar, deleteAvatar } from "@/services/v2/storage";
import {
  PRESETS,
  CATEGORY_NAMES,
  Rules,
  validateRules,
  nextSocialRound,
  leaderboard,
  SocialRound,
  SocialPlayer,
  SocialConfig,
  setSocialScore,
  draw,
  DEFAULT_STANDINGS,
  standings,
  Result,
} from "../../../../../packages/core/src";
import {
  generateRoundRobinSchedule,
  generateGroupStageWithKnockout,
} from "@/engines/tournament/tournament-engine";
const ok = (data: unknown, status = 200) =>
  NextResponse.json({ data }, { status });
const uuid = z.string().uuid();
const publicWhere = {
  status: {
    in: PUBLIC_STATUSES as (
      "PUBLISHED" | "IN_PROGRESS" | "COMPLETED" | "ARCHIVED"
    )[],
  },
};
type Context = { params: Promise<{ path: string[] }> };
async function dispatch(req: NextRequest, context: Context): Promise<Response> {
  try {
    const { path } = await context.params;
    const [resource, id, operation] = path;
    const method = req.method;
    if (resource === "public" && method === "GET") {
      if (id === "tournaments") {
        const search = req.nextUrl.searchParams.get("search") ?? "";
        return ok(
          await prisma.tournament.findMany({
            where: {
              ...publicWhere,
              name: { contains: search, mode: "insensitive" },
            },
            select: {
              id: true,
              name: true,
              slug: true,
              location: true,
              timezone: true,
              startDate: true,
              endDate: true,
              status: true,
            },
            take: 100,
            orderBy: { startDate: "desc" },
          }),
        );
      }
      if (id === "matches") {
        const match = await prisma.match.findUnique({
          where: { id: operation },
          include: {
            entryA: true,
            entryB: true,
            court: true,
            scoreSnapshot: true,
            stage: { include: { category: { include: { tournament: true } } } },
          },
        });
        if (
          !match ||
          !PUBLIC_STATUSES.includes(match.stage.category.tournament.status)
        )
          throw AppError.notFound();
        return ok({
          ...(publicProjection(match) as object),
          state: match.stateV2,
          approvalStatus: match.approvalStatus,
        });
      }
      if (id === "social") {
        if (!operation)
          return ok(
            await prisma.socialEvent.findMany({
              where: { published: true },
              select: { id: true, name: true, format: true },
              take: 100,
            }),
          );
        const event = await prisma.socialEvent.findUnique({
          where: { id: operation },
        });
        if (!event?.published) throw AppError.notFound();
        return ok({
          id: event.id,
          name: event.name,
          format: event.format,
          config: event.config,
          participants: event.participants,
          rounds: event.rounds,
          leaderboard: leaderboard(
            event.participants as unknown as SocialPlayer[],
            event.rounds as unknown as SocialRound[],
            (event.config as unknown as SocialConfig).ranking,
          ),
        });
      }
      throw AppError.notFound();
    }
    if (resource === "auth" && method === "POST") {
      const body = await req.json();
      if (id === "login") {
        const input = z
          .object({ email: z.string().email(), password: z.string().min(1) })
          .parse(body);
        return ok(await mobileLogin(input.email, input.password));
      }
      if (id === "refresh")
        return ok(
          await refreshSession(z.string().min(32).parse(body.refreshToken)),
        );
      if (id === "logout") {
        const token = z.string().min(32).parse(body.refreshToken);
        await prisma.mobileSession.updateMany({
          where: { tokenHash: tokenHash(token) },
          data: { revokedAt: new Date() },
        });
        return ok({ success: true });
      }
    }
    if (resource === "invitations" && id === "accept" && method === "POST") {
      const input = z
        .object({
          token: z.string().min(32),
          fullName: z.string().min(2),
          username: z
            .string()
            .min(3)
            .max(30)
            .regex(/^[a-zA-Z0-9_]+$/),
          password: z.string().min(10),
        })
        .parse(await req.json());
      const invitation = await prisma.staffInvitation.findUnique({
        where: { tokenHash: tokenHash(input.token) },
      });
      if (
        !invitation ||
        invitation.acceptedAt ||
        invitation.expiresAt < new Date()
      )
        throw AppError.badRequest("Undangan kedaluwarsa atau sudah digunakan");
      const passwordHash = await hashPassword(input.password);
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.staffInvitation.updateMany({
          where: { id: invitation.id, acceptedAt: null },
          data: { acceptedAt: new Date() },
        });
        if (claimed.count !== 1)
          throw AppError.conflict("Undangan sudah digunakan");
        const user = await tx.user.create({
          data: {
            email: invitation.email,
            fullName: input.fullName,
            username: input.username,
            passwordHash,
            role: invitation.role === "REFEREE" ? "REFEREE" : "ORGANIZER",
          },
        });
        await tx.organizationMember.create({
          data: {
            organizationId: invitation.organizationId,
            userId: user.id,
            role: invitation.role,
          },
        });
      });
      return ok({ success: true });
    }
    const user = await requireAuth(req);
    if (resource === "presets" && method === "GET")
      return ok({
        presets: PRESETS,
        categories: CATEGORY_NAMES,
        standings: DEFAULT_STANDINGS,
      });
    if (resource === "profile") {
      if (id === "avatar") {
        const account = await prisma.user.findUniqueOrThrow({
          where: { id: user.userId },
        });
        if (method === "GET") {
          if (!account.avatarKey) throw AppError.notFound();
          const bytes = await readAvatar(account.avatarKey);
          return new Response(bytes as BodyInit, {
            headers: {
              "Content-Type": "image/webp",
              "Cache-Control": "private, no-store",
            },
          });
        }
        await requireRole(req, ["SUPER_ADMIN", "ORGANIZER"]);
        if (method === "POST") {
          const form = await req.formData();
          const file = form.get("file");
          if (!(file instanceof File)) throw AppError.badRequest("Pilih foto");
          const key = await saveAvatar(file, user.userId);
          await prisma.user.update({
            where: { id: user.userId },
            data: { avatarKey: key },
          });
          if (account.avatarKey)
            await deleteAvatar(account.avatarKey).catch(() => {});
          return ok({ avatarUrl: "/api/v2/profile/avatar" });
        }
        if (method === "DELETE") {
          await prisma.user.update({
            where: { id: user.userId },
            data: { avatarKey: null },
          });
          if (account.avatarKey) await deleteAvatar(account.avatarKey);
          return ok({ success: true });
        }
      }
      if (method === "GET") {
        const account = await prisma.user.findUniqueOrThrow({
          where: { id: user.userId },
          select: {
            id: true,
            fullName: true,
            email: true,
            username: true,
            role: true,
            avatarKey: true,
          },
        });
        return ok({
          ...account,
          avatarKey: undefined,
          avatarUrl: account.avatarKey ? "/api/v2/profile/avatar" : null,
        });
      }
      if (method === "PATCH") {
        const body = z
          .object({ fullName: z.string().trim().min(2).max(100) })
          .parse(await req.json());
        await prisma.user.update({ where: { id: user.userId }, data: body });
        return ok(body);
      }
    }
    if (resource === "organizations") {
      if (method === "GET")
        return ok(
          await prisma.organization.findMany({
            where:
              user.role === "SUPER_ADMIN"
                ? {}
                : { members: { some: { userId: user.userId } } },
            include: {
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      fullName: true,
                      email: true,
                      role: true,
                    },
                  },
                },
              },
            },
          }),
        );
      if (method === "POST") {
        await requireRole(req, ["SUPER_ADMIN"]);
        const input = z
          .object({ name: z.string().min(2).max(100) })
          .parse(await req.json());
        return ok(
          await prisma.organization.create({
            data: {
              name: input.name,
              features: { scoringV2: true, social: true },
              members: { create: { userId: user.userId, role: "OWNER" } },
            },
          }),
          201,
        );
      }
    }
    if (resource === "staff" && method === "POST") {
      const input = z
        .object({
          organizationId: z.string(),
          email: z.string().email(),
          role: z.enum(["ADMIN", "STAFF", "REFEREE"]),
        })
        .parse(await req.json());
      await organizationAccess(user, input.organizationId);
      if (user.role !== "SUPER_ADMIN") {
        const membership = await prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: input.organizationId,
              userId: user.userId,
            },
          },
        });
        if (!membership || !["OWNER", "ADMIN"].includes(membership.role))
          throw AppError.forbidden("Hanya admin dapat mengundang staf");
      }
      const token = randomBytes(32).toString("base64url");
      await prisma.staffInvitation.create({
        data: {
          ...input,
          email: input.email.toLowerCase(),
          tokenHash: tokenHash(token),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      return ok(
        {
          invitationUrl: `${req.nextUrl.origin}/invite?token=${token}`,
          expiresInDays: 7,
        },
        201,
      );
    }
    if (resource === "venues") {
      const input =
        method === "GET"
          ? {
              organizationId:
                req.nextUrl.searchParams.get("organizationId") ?? undefined,
            }
          : await req.json();
      const organizationId = await organizationFor(
        user,
        input.organizationId ??
          req.headers.get("X-Organization-Id") ??
          undefined,
      );
      if (method === "GET")
        return ok(
          await prisma.venue.findMany({
            where: { organizationId },
            include: { courts: true },
          }),
        );
      if (method === "POST") {
        const body = z
          .object({
            name: z.string().min(2),
            address: z.string().optional(),
            timezone: z.string().default("Asia/Jakarta"),
            courts: z.array(z.string().min(1)).min(1).max(40),
          })
          .parse(input);
        try {
          new Intl.DateTimeFormat("id-ID", { timeZone: body.timezone });
        } catch {
          throw AppError.badRequest("Zona waktu tidak valid");
        }
        return ok(
          await prisma.venue.create({
            data: {
              organizationId,
              name: body.name,
              address: body.address,
              timezone: body.timezone,
              courts: { create: body.courts.map((name) => ({ name })) },
            },
            include: { courts: true },
          }),
          201,
        );
      }
    }
    if (resource === "players" && method === "PATCH") {
      const player = await prisma.player.findUniqueOrThrow({ where: { id } });
      if (player.organizationId)
        await organizationAccess(user, player.organizationId);
      else await requireRole(req, ["SUPER_ADMIN"]);
      const input = z
        .object({
          federationId: z.string().max(100).nullable().optional(),
          verificationStatus: z
            .enum(["UNVERIFIED", "VERIFIED", "REJECTED"])
            .optional(),
          level: z.string().max(50).nullable().optional(),
          rating: z.number().min(0).max(10000).optional(),
          birthDate: z.string().date().nullable().optional(),
          gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
          organizationId: z.string().optional(),
        })
        .parse(await req.json());
      if (input.organizationId) {
        await requireRole(req, ["SUPER_ADMIN"]);
        await organizationAccess(user, input.organizationId);
      }
      const data = {
        ...input,
        birthDate:
          input.birthDate === undefined
            ? undefined
            : input.birthDate === null
              ? null
              : new Date(input.birthDate),
      };
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.player.update({ where: { id }, data });
        await tx.auditLog.create({
          data: {
            userId: user.userId,
            action: "UPDATE_PLAYER_PROFILE",
            entityType: "Player",
            entityId: id,
            before: json(player),
            after: json(result),
          },
        });
        return result;
      });
      return ok(updated);
    }
    if (resource === "tournaments" && method === "PATCH") {
      await tournamentAccess(user, id);
      const body = z
        .object({
          responsibleName: z.string().max(100).optional(),
          handbookUrl: z.string().url().optional(),
          approvalNote: z.string().max(2000).optional(),
        })
        .parse(await req.json());
      return ok(await prisma.tournament.update({ where: { id }, data: body }));
    }
    if (resource === "categories") {
      const category = await prisma.category.findUniqueOrThrow({
        where: { id },
        include: { entries: true, stages: true },
      });
      await tournamentAccess(user, category.tournamentId);
      if (method === "GET")
        return ok(
          operation === "standings" ? await categoryStandings(id) : category,
        );
      if (method === "PATCH") {
        const body = z
          .object({
            rules: rulesSchema.optional(),
            eligibility: z
              .object({
                minAge: z.number().int().min(0).optional(),
                maxAge: z.number().int().max(120).optional(),
                gender: z
                  .enum(["ANY", "MALE", "FEMALE", "MIXED"])
                  .default("ANY"),
                levels: z.array(z.string()).default([]),
                notes: z.string().max(2000).default(""),
              })
              .optional(),
            standingsPolicy: standingsSchema.optional(),
            qualificationPolicy: z
              .object({
                perGroup: z.number().int().min(1).max(4),
                bestRunnersUp: z.number().int().min(0).max(16).default(0),
                normalization: z.enum(["NONE", "PER_MATCH"]).default("NONE"),
              })
              .optional(),
          })
          .parse(await req.json());
        if (body.rules) validateRules(body.rules);
        if (
          body.eligibility?.minAge !== undefined &&
          body.eligibility.maxAge !== undefined &&
          body.eligibility.minAge > body.eligibility.maxAge
        )
          throw AppError.badRequest("Rentang usia tidak valid");
        if (body.standingsPolicy || body.qualificationPolicy) {
          const started = await prisma.match.count({
            where: { stage: { categoryId: id }, status: { not: "SCHEDULED" } },
          });
          if (started)
            throw AppError.conflict(
              "Kebijakan klasemen dikunci setelah kompetisi dimulai",
            );
        }
        return ok(
          await prisma.category.update({
            where: { id },
            data: {
              rulesV2: body.rules ? json(body.rules) : undefined,
              eligibility: body.eligibility
                ? json(body.eligibility)
                : undefined,
              standingsPolicy: body.standingsPolicy
                ? json(body.standingsPolicy)
                : undefined,
              qualificationPolicy: body.qualificationPolicy
                ? json(body.qualificationPolicy)
                : undefined,
            },
          }),
        );
      }
      if (operation === "qualify" && method === "POST") {
        if (category.format !== "GROUP_KNOCKOUT")
          throw AppError.badRequest("Kategori bukan grup + knockout");
        const unapproved = await prisma.match.count({
          where: {
            stage: { categoryId: id, type: "GROUP" },
            NOT: {
              OR: [{ approvalStatus: "APPROVED" }, { status: "APPROVED" }],
            },
          },
        });
        if (unapproved)
          throw AppError.conflict("Sahkan semua hasil grup terlebih dahulu");
        const groups = await categoryStandings(id);
        const policy = category.qualificationPolicy as {
          perGroup: number;
          bestRunnersUp: number;
          normalization: string;
        } | null;
        if (!policy)
          throw AppError.badRequest("Atur kebijakan kelolosan dahulu");
        if (groups.some((g) => g.standings.some((r) => r.needsPlayoff)))
          throw AppError.conflict(
            "Masih ada peringkat seri: selesaikan playoff/keputusan admin dahulu",
          );
        const qualified = groups.flatMap((g) =>
          g.standings.slice(0, policy.perGroup),
        );
        const candidates = groups
          .map((g) => g.standings[policy.perGroup])
          .filter(Boolean);
        if (
          policy.bestRunnersUp &&
          new Set(candidates.map((c) => c.played)).size > 1 &&
          policy.normalization === "NONE"
        )
          throw AppError.badRequest(
            "Pilih normalisasi untuk grup yang tidak seimbang",
          );
        candidates.sort((a, b) =>
          policy.normalization === "PER_MATCH"
            ? b.points / Math.max(1, b.played) -
              a.points / Math.max(1, a.played)
            : b.points - a.points,
        );
        if (
          policy.bestRunnersUp > 0 &&
          candidates[policy.bestRunnersUp] &&
          candidates[policy.bestRunnersUp - 1].points /
            Math.max(1, candidates[policy.bestRunnersUp - 1].played) ===
            candidates[policy.bestRunnersUp].points /
              Math.max(1, candidates[policy.bestRunnersUp].played)
        )
          throw AppError.conflict(
            "Batas best runners-up masih seri; perlu playoff",
          );
        qualified.push(...candidates.slice(0, policy.bestRunnersUp));
        const nodes = draw(
          qualified.map((r, i) => ({ id: r.id, seed: i + 1 })),
          "SINGLE_ELIMINATION",
          "SEEDED",
          Array.from(
            { length: qualified.length },
            () => randomInt(0, 0x1000000) / 0x1000000,
          ),
        );
        return ok(
          await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM categories WHERE id = ${id} FOR UPDATE`;
            if (
              await tx.stage.count({
                where: { categoryId: id, type: "SINGLE_ELIMINATION" },
              })
            )
              throw AppError.conflict("Babak kelolosan sudah dibuat");
            const stage = await tx.stage.create({
              data: {
                categoryId: id,
                name: "Babak Gugur",
                type: "SINGLE_ELIMINATION",
                order: 2,
                config: json({ draw: nodes }),
              },
            });
            for (const n of nodes)
              await tx.match.create({
                data: {
                  stageId: stage.id,
                  round: n.round,
                  matchNumber: n.number,
                  entryAId: n.a,
                  entryBId: n.b,
                  bracketSide: n.side,
                  status: n.bye ? "APPROVED" : "SCHEDULED",
                  approvalStatus: n.bye ? "APPROVED" : "PENDING",
                  winnerId: n.bye ? (n.a ?? n.b) : null,
                },
              });
            return stage;
          }),
          201,
        );
      }
      if (operation === "draw" && method === "POST") {
        const input = z
          .object({
            mode: z.enum(["RANDOM", "SEEDED", "MANUAL"]).default("SEEDED"),
            entryOrder: z.array(uuid).optional(),
            thirdPlace: z.boolean().default(false),
            groups: z.number().int().min(1).max(16).default(2),
          })
          .parse(await req.json());
        const participants = category.entries.filter((e) =>
          ["REGISTERED", "CONFIRMED"].includes(e.status),
        );
        if (participants.length < 2)
          throw AppError.badRequest("Minimal dua pasangan");
        const entries =
          input.mode === "MANUAL"
            ? input.entryOrder?.map((entryId) =>
                participants.find((e) => e.id === entryId)!,
              )
            : participants;
        if (
          !entries ||
          entries.length !== participants.length ||
          entries.some((e) => !e) ||
          new Set(entries.map((e) => e.id)).size !== participants.length
        )
          throw AppError.badRequest(
            "Urutan manual harus memuat semua peserta tepat sekali",
          );
        const response = await prisma.$transaction(async (tx) => {
          // Serialize drawing with match starts and preserve all started/history records.
          await tx.$queryRaw`SELECT id FROM categories WHERE id = ${id} FOR UPDATE`;
          const started = await tx.match.count({
            where: {
              stage: { categoryId: id },
              OR: [{ status: { not: "SCHEDULED" } }, { engineVersion: 2 }],
            },
          });
          if (started)
            throw AppError.conflict(
              "Bagan sudah digunakan; buat kategori baru atau selesaikan dampak perubahan",
            );
          await tx.stage.deleteMany({ where: { categoryId: id } });
          if (
            ["SINGLE_ELIMINATION", "DOUBLE_ELIMINATION"].includes(
              category.format,
            )
          ) {
            const nodes = draw(
              entries,
              category.format as "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION",
              input.mode,
              Array.from(
                { length: entries.length },
                () => randomInt(0, 0x1000000) / 0x1000000,
              ),
              input.thirdPlace,
            );
            const stage = await tx.stage.create({
              data: {
                categoryId: id,
                name: "Bagan Utama",
                type:
                  category.format === "DOUBLE_ELIMINATION"
                    ? "DOUBLE_ELIMINATION"
                    : "SINGLE_ELIMINATION",
                order: 1,
                config: json({ draw: nodes }),
              },
            });
            for (const node of nodes)
              await tx.match.create({
                data: {
                  stageId: stage.id,
                  round: node.round,
                  matchNumber: node.number,
                  entryAId: node.a,
                  entryBId: node.b,
                  bracketSide: node.side,
                  status: node.bye ? "APPROVED" : "SCHEDULED",
                  approvalStatus: node.bye ? "APPROVED" : "PENDING",
                  winnerId: node.bye ? (node.a ?? node.b) : null,
                },
              });
            return { ...stage, draw: nodes };
          }
          if (
            category.format === "ROUND_ROBIN" ||
            category.format === "GROUP_KNOCKOUT"
          ) {
            const pools =
              category.format === "ROUND_ROBIN"
                ? [
                    {
                      groupName: "Grup A",
                      matches: generateRoundRobinSchedule(entries),
                    },
                  ]
                : generateGroupStageWithKnockout(entries, {
                    numGroups: input.groups,
                    advancePerGroup: 2,
                  }).groups;
            const stage = await tx.stage.create({
              data: {
                categoryId: id,
                name: "Penyisihan Grup",
                type: "GROUP",
                order: 1,
                config: {},
              },
            });
            let number = 0;
            for (const pool of pools) {
              const group = await tx.group.create({
                data: { stageId: stage.id, name: pool.groupName },
              });
              for (const m of pool.matches)
                await tx.match.create({
                  data: {
                    stageId: stage.id,
                    groupId: group.id,
                    round: m.round,
                    matchNumber: ++number,
                    entryAId: m.entryA?.id,
                    entryBId: m.entryB?.id,
                  },
                });
            }
            return stage;
          }
          throw AppError.badRequest(
            "Gunakan menu Pertandingan Sosial untuk Americano/Mexicano",
          );
        });
        return ok(response, 201);
      }
      if (operation === "standings" && method === "GET")
        return ok(await categoryStandings(id));
    }
    if (resource === "stages" && method === "PATCH") {
      const stage = await prisma.stage.findUniqueOrThrow({
        where: { id },
        include: { category: true },
      });
      await tournamentAccess(user, stage.category.tournamentId);
      const body = z
        .object({
          rules: rulesSchema.partial().optional(),
          roundRules: z
            .record(z.string().regex(/^\d+$/), rulesSchema.partial())
            .optional(),
        })
        .parse(await req.json());
      const base = stage.category.rulesV2 as unknown as Rules;
      if (!base) throw AppError.badRequest("Atur aturan kategori dahulu");
      validateRules({ ...base, ...body.rules });
      for (const override of Object.values(body.roundRules ?? {}))
        validateRules({ ...base, ...body.rules, ...override });
      return ok(
        await prisma.stage.update({
          where: { id },
          data: {
            rulesOverride: body.rules ? json(body.rules) : undefined,
            roundRules: body.roundRules ? json({ ...((stage.roundRules as Record<string, unknown>) ?? {}), ...body.roundRules }) : undefined,
          },
        }),
      );
    }
    if (resource === "matches") {
      if (id === "assigned" && method === "GET")
        return ok(
          await prisma.match.findMany({
            where: {
              officials: { some: { userId: user.userId } },
              status: {
                in: ["SCHEDULED", "WARMUP", "IN_PROGRESS", "SUSPENDED"],
              },
            },
            include: { entryA: true, entryB: true, court: true },
          }),
        );
      await matchAccess(
        user,
        id,
        ["approve", "officials", "schedule"].includes(operation),
      );
      if (operation === "schedule" && method === "POST") {
        const body = z
          .object({
            courtId: uuid,
            start: z.string().datetime({ offset: true }),
            duration: z.number().int().min(1).max(300),
            restMinutes: z.number().int().min(0).max(180),
          })
          .parse(await req.json());
        return ok(
          await scheduleMatch(
            user,
            id,
            body.courtId,
            new Date(body.start),
            body.duration,
            body.restMinutes,
          ),
        );
      }
      if (method === "GET") {
        const m = await prisma.match.findUniqueOrThrow({
          where: { id },
          include: {
            entryA: true,
            entryB: true,
            court: true,
            actionEvents: { orderBy: { sequence: "asc" } },
          },
        });
        return ok({ ...m, sequence: m.actionEvents.at(-1)?.sequence ?? 0 });
      }
      if (operation === "claim" && method === "POST") {
        const body = z
          .object({ deviceId: uuid, takeover: z.boolean().default(false) })
          .parse(await req.json());
        return ok(await claimMatch(user, id, body.deviceId, body.takeover));
      }
      if (operation === "actions" && method === "POST")
        return ok(await syncActions(user, id, await req.json()));
      if (operation === "approve" && method === "POST")
        return ok(await approveV2(user, id));
      if (operation === "officials" && method === "POST") {
        const { userId } = z.object({ userId: uuid }).parse(await req.json());
        const m = await prisma.match.findUniqueOrThrow({
          where: { id },
          include: {
            stage: { include: { category: { include: { tournament: true } } } },
          },
        });
        const org = m.stage.category.tournament.organizationId;
        if (
          !org ||
          !(await prisma.organizationMember.findUnique({
            where: { organizationId_userId: { organizationId: org, userId } },
          }))
        )
          throw AppError.badRequest("Wasit harus menjadi anggota organisasi");
        return ok(
          await prisma.matchOfficial.upsert({
            where: { matchId_userId: { matchId: id, userId } },
            create: { matchId: id, userId },
            update: {},
          }),
        );
      }
    }
    if (resource === "social") {
      if (!id) {
        if (method === "GET") {
          const organizationId = await organizationFor(
            user,
            req.nextUrl.searchParams.get("organizationId") ?? undefined,
          );
          return ok(
            await prisma.socialEvent.findMany({
              where: { organizationId },
              orderBy: { createdAt: "desc" },
            }),
          );
        }
        if (method === "POST") {
          const body = z
            .object({
              organizationId: z.string().optional(),
              name: z.string().min(2).max(120),
              format: z.enum(["AMERICANO", "MEXICANO"]),
              config: socialConfigSchema,
              participants: socialPlayersSchema,
              published: z.boolean().default(false),
            })
            .parse(await req.json());
          const organizationId = await organizationFor(
            user,
            body.organizationId ??
              req.headers.get("X-Organization-Id") ??
              undefined,
          );
          const count = await prisma.player.count({
            where: {
              id: { in: body.participants.map((p) => p.id) },
              organizationId,
            },
          });
          if (count !== body.participants.length)
            throw AppError.badRequest("Peserta harus pemain organisasi ini");
          return ok(
            await prisma.socialEvent.create({
              data: {
                organizationId,
                name: body.name,
                format: body.format,
                config: json(body.config),
                participants: json(body.participants),
                published: body.published,
              },
            }),
            201,
          );
        }
      }
      const event = await prisma.socialEvent.findUniqueOrThrow({
        where: { id },
      });
      await organizationAccess(user, event.organizationId);
      const participants = event.participants as unknown as SocialPlayer[],
        rounds = event.rounds as unknown as SocialRound[],
        config = event.config as unknown as SocialConfig;
      if (method === "GET")
        return ok({
          ...event,
          leaderboard: leaderboard(participants, rounds, config.ranking),
        });
      if (method === "POST" || method === "PATCH") {
        const body = await req.json();
        const version = z.number().int().parse(body.version);
        let nextRounds = rounds;
        let nextParticipants = participants;
        let published = event.published;
        if (operation === "rounds") {
          nextRounds = [
            ...rounds,
            nextSocialRound(
              event.format as "AMERICANO" | "MEXICANO",
              participants,
              rounds,
              config,
            ),
          ];
        } else if (operation === "results") {
          const input = z
            .object({
              round: z.number().int().min(1),
              court: z.number().int().min(1),
              scoreA: z.number().int(),
              scoreB: z.number().int(),
            })
            .parse(body);
          if (input.round !== rounds.length)
            throw AppError.conflict(
              "Riwayat ronde yang telah dipakai tidak dapat diubah",
            );
          nextRounds = rounds.map((r) =>
            r.number === input.round
              ? setSocialScore(
                  r,
                  input.court,
                  input.scoreA,
                  input.scoreB,
                  config.target,
                )
              : r,
          );
        } else {
          const input = z
            .object({
              participants: socialPlayersSchema.optional(),
              published: z.boolean().optional(),
            })
            .parse(body);
          if (input.participants) {
            if (
              participants.some(
                (p) => !input.participants!.some((n) => n.id === p.id),
              )
            )
              throw AppError.badRequest(
                "Nonaktifkan peserta; jangan hapus riwayatnya",
              );
            const count = await prisma.player.count({
              where: {
                id: { in: input.participants.map((p) => p.id) },
                organizationId: event.organizationId,
              },
            });
            if (count !== input.participants.length)
              throw AppError.badRequest("Peserta tidak valid");
            nextParticipants = input.participants;
          }
          published = input.published ?? published;
        }
        const changed = await prisma.socialEvent.updateMany({
          where: { id, version },
          data: {
            rounds: json(nextRounds),
            participants: json(nextParticipants),
            published,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw AppError.conflict("Acara berubah; muat ulang");
        return ok(
          await prisma.socialEvent.findUniqueOrThrow({ where: { id } }),
        );
      }
    }
    throw AppError.notFound("Endpoint tidak ditemukan");
  } catch (error) {
    return handleApiError(error);
  }
}
async function categoryStandings(id: string) {
  const category = await prisma.category.findUniqueOrThrow({ where: { id } });
  const groups = await prisma.group.findMany({
    where: { stage: { categoryId: id } },
    include: {
      matches: {
        include: { scoreSnapshot: true },
      },
    },
  });
  return groups.map((g) => {
    const ids = [
      ...new Set(
        g.matches
          .flatMap((m) => [m.entryAId, m.entryBId])
          .filter((x): x is string => !!x),
      ),
    ];
    const results: Result[] = g.matches
      .filter((m) => m.approvalStatus === "APPROVED" || m.status === "APPROVED")
      .map((m) => ({
        a: m.entryAId!,
        b: m.entryBId!,
        winner: m.winnerId,
        setsA: m.scoreSnapshot?.setsA ?? 0,
        setsB: m.scoreSnapshot?.setsB ?? 0,
        gamesA: m.scoreSnapshot?.gamesA.reduce((a, b) => a + b, 0) ?? 0,
        gamesB: m.scoreSnapshot?.gamesB.reduce((a, b) => a + b, 0) ?? 0,
      }));
    return {
      id: g.id,
      name: g.name,
      standings: standings(
        ids,
        results,
        (category.standingsPolicy as unknown as typeof DEFAULT_STANDINGS) ??
          DEFAULT_STANDINGS,
      ),
    };
  });
}
export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
