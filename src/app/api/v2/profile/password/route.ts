import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { comparePassword, hashPassword } from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";
import { requireAuth } from "@/middleware/auth.middleware";

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z
    .string()
    .min(10, "Kata sandi baru minimal 10 karakter")
    .max(72)
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= 72,
      "Kata sandi terlalu panjang",
    ),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const input = passwordSchema.parse(await request.json());
    const account = await prisma.user.findUniqueOrThrow({
      where: { id: user.userId },
    });
    if (!(await comparePassword(input.currentPassword, account.passwordHash))) {
      throw AppError.badRequest("Kata sandi saat ini tidak sesuai");
    }
    if (input.currentPassword === input.newPassword) {
      throw AppError.badRequest(
        "Gunakan kata sandi yang berbeda dari sebelumnya",
      );
    }
    const passwordHash = await hashPassword(input.newPassword);
    // Compare-and-set prevents concurrent requests from overwriting a newer password.
    const result = await prisma.user.updateMany({
      where: { id: user.userId, passwordHash: account.passwordHash },
      data: { passwordHash },
    });
    if (result.count !== 1)
      throw AppError.conflict("Kata sandi telah berubah. Coba lagi.");
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
