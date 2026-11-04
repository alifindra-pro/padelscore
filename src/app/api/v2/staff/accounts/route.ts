import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";
import { requireRole } from "@/middleware/auth.middleware";

const accountSchema = z.object({
  organizationId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).toLowerCase(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/),
  password: z
    .string()
    .min(10)
    .max(72)
    .refine((value) => Buffer.byteLength(value, "utf8") <= 72, {
      message: "Kata sandi terlalu panjang",
    }),
  role: z.enum(["REFEREE", "STAFF", "ADMIN"]),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await requireRole(request, ["SUPER_ADMIN", "ORGANIZER"]);
    const input = accountSchema.parse(await request.json());
    if (admin.role !== "SUPER_ADMIN") {
      const membership = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: input.organizationId,
            userId: admin.userId,
          },
        },
      });
      if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
        throw AppError.forbidden(
          "Hanya admin organisasi ini yang dapat membuat akun",
        );
      }
    }
    const organization = await prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });
    if (!organization) throw AppError.notFound("Organisasi tidak ditemukan");

    // The nested write creates the account and membership atomically.
    const account = await prisma.user.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        username: input.username,
        passwordHash: await hashPassword(input.password),
        role: input.role === "REFEREE" ? "REFEREE" : "ORGANIZER",
        organizationMemberships: {
          create: { organizationId: input.organizationId, role: input.role },
        },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        username: true,
        isActive: true,
      },
    });
    return NextResponse.json(
      { data: { ...account, role: input.role } },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return handleApiError(
        AppError.conflict(
          "Email atau nama pengguna sudah digunakan. Gunakan identitas lain.",
        ),
      );
    }
    return handleApiError(error);
  }
}
