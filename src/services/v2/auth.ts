import prisma from "@/lib/db";
import { comparePassword, AUTH_CONFIG } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function mobileLogin(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (
    !user?.isActive ||
    user.role === "VIEWER" ||
    !(await comparePassword(password, user.passwordHash))
  )
    throw AppError.unauthorized("Email atau kata sandi salah");
  return newSession(user.id, user.role);
}
async function newSession(userId: string, role: string) {
  const refreshToken = randomBytes(48).toString("base64url");
  const session = await prisma.mobileSession.create({
    data: {
      userId,
      tokenHash: tokenHash(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
  });
  return {
    accessToken: jwt.sign(
      { userId, role, sessionId: session.id },
      AUTH_CONFIG.JWT_SECRET,
      { expiresIn: "15m" },
    ),
    refreshToken,
    expiresIn: 900,
  };
}
export async function refreshSession(token: string) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.mobileSession.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      !session.user.isActive
    )
      throw AppError.unauthorized("Sesi telah berakhir");
    const next = randomBytes(48).toString("base64url");
    const count = await tx.mobileSession.updateMany({
      where: { id: session.id, tokenHash: tokenHash(token), revokedAt: null },
      data: { tokenHash: tokenHash(next) },
    });
    if (count.count !== 1) throw AppError.unauthorized("Token telah digunakan");
    return {
      accessToken: jwt.sign(
        {
          userId: session.userId,
          role: session.user.role,
          sessionId: session.id,
        },
        AUTH_CONFIG.JWT_SECRET,
        { expiresIn: "15m" },
      ),
      refreshToken: next,
      expiresIn: 900,
    };
  });
}
