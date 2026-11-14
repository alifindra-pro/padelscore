import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { AppError } from "@/lib/errors";

// Failed logins are counted in the audit log, so no extra table or service is needed.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_ACCOUNT = 8;
const MAX_PER_ADDRESS = 40;

const hash = (value: string) =>
  createHmac("sha256", process.env.JWT_SECRET || "login-throttle")
    .update(value)
    .digest("hex")
    .slice(0, 40);

export function loginKeys(request: NextRequest, identifier: string) {
  const address = (
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    "local"
  )
    .split(",")[0]
    .trim();
  return {
    account: hash(`account:${identifier.trim().toLowerCase()}`),
    address: hash(`address:${address}`),
  };
}
type Keys = ReturnType<typeof loginKeys>;

/** Throws 429 when this account or address has failed too often recently. */
export async function assertLoginAllowed(keys: Keys) {
  const since = { gte: new Date(Date.now() - WINDOW_MS) };
  const [byAccount, byAddress] = await Promise.all([
    prisma.auditLog.count({
      where: {
        action: "LOGIN_FAILED",
        entityType: "Auth",
        entityId: keys.account,
        createdAt: since,
      },
    }),
    prisma.auditLog.count({
      where: {
        action: "LOGIN_FAILED",
        entityType: "Auth",
        ipAddress: keys.address,
        createdAt: since,
      },
    }),
  ]);
  if (byAccount >= MAX_PER_ACCOUNT || byAddress >= MAX_PER_ADDRESS)
    throw new AppError(
      429,
      "RATE_LIMITED",
      "Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.",
    );
}

export async function recordLoginFailure(keys: Keys) {
  await prisma.auditLog.create({
    data: {
      action: "LOGIN_FAILED",
      entityType: "Auth",
      entityId: keys.account,
      ipAddress: keys.address,
    },
  });
}
