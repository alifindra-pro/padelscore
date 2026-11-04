import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { findUnique, comparePassword, generateToken } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  comparePassword: vi.fn(),
  generateToken: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@/lib/auth", () => ({
  comparePassword,
  generateToken,
  AUTH_CONFIG: { COOKIE_NAME: "token" },
}));
import { POST } from "@/app/api/v1/auth/login/route";

const user = {
  id: "organizer-id",
  email: "owner@example.test",
  username: "Owner_1",
  fullName: "Owner Name",
  role: "ORGANIZER",
  isActive: true,
  passwordHash: "private-hash",
};
const request = (body: unknown) =>
  new NextRequest("https://padel.test/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  findUnique.mockResolvedValue(user);
  comparePassword.mockResolvedValue(true);
  generateToken.mockReturnValue("session-token");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("Web login identity", () => {
  it.each([
    [{ identifier: " Owner_1 " }, { username: "Owner_1" }],
    [{ identifier: " OWNER@EXAMPLE.TEST " }, { email: "owner@example.test" }],
    [{ email: " OWNER@EXAMPLE.TEST " }, { email: "owner@example.test" }],
  ])(
    "accepts a username, email, or legacy email payload: %j",
    async (identity, where) => {
      const response = await POST(
        request({ ...identity, password: "secret-password" }),
      );
      expect(response.status).toBe(200);
      expect(findUnique).toHaveBeenCalledWith({ where });
      expect(comparePassword).toHaveBeenCalledWith(
        "secret-password",
        "private-hash",
      );
      const cookie = response.headers.get("set-cookie");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=lax");
      const body = await response.json();
      expect(body.data.user.id).toBe(user.id);
      expect(body.data.user).not.toHaveProperty("passwordHash");
    },
  );

  it.each(["missing", "inactive", "wrong-password"])(
    "rejects %s without issuing a session",
    async (reason) => {
      if (reason === "missing") findUnique.mockResolvedValue(null);
      if (reason === "inactive")
        findUnique.mockResolvedValue({ ...user, isActive: false });
      if (reason === "wrong-password") comparePassword.mockResolvedValue(false);
      const response = await POST(
        request({ identifier: "Owner_1", password: "wrong-password" }),
      );
      expect(response.status).toBe(401);
      expect((await response.json()).error.message).toBe(
        "Nama pengguna, email, atau kata sandi tidak sesuai",
      );
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(generateToken).not.toHaveBeenCalled();
    },
  );

  it.each([
    {},
    { identifier: "   " },
    { identifier: "a".repeat(255) },
    { email: "not-an-email" },
  ])("rejects malformed identity %j before querying", async (identity) => {
    const response = await POST(
      request({ ...identity, password: "secret-password" }),
    );
    expect(response.status).toBe(400);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
