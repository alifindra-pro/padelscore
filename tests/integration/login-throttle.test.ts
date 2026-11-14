import { afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { POST } from "@/app/api/v1/auth/login/route";
import { loginKeys } from "@/lib/login-throttle";

const identifier = `throttle-${randomUUID()}@test.invalid`;
const address = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
const attempt = (ip = address) =>
  POST(
    new NextRequest("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ identifier, password: "wrong-password" }),
    }),
  );
const keys = loginKeys(
  new NextRequest("http://localhost/", {
    headers: { "x-forwarded-for": address },
  }),
  identifier,
);
afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { action: "LOGIN_FAILED", entityId: keys.account },
  });
});

it("locks an account after repeated failed logins, even from another address", async () => {
  for (let i = 0; i < 8; i++) expect((await attempt()).status).toBe(401);
  const blocked = await attempt();
  expect(blocked.status).toBe(429);
  expect((await blocked.json()).error.code).toBe("RATE_LIMITED");
  expect((await attempt("198.51.100.7")).status).toBe(429);
  expect(
    await prisma.auditLog.count({
      where: { action: "LOGIN_FAILED", entityId: keys.account },
    }),
  ).toBe(8);
}, 60000);
