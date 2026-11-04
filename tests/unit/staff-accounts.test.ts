import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";

const { requireRole, membership, organization, create, hashPassword } =
  vi.hoisted(() => ({
    requireRole: vi.fn(),
    membership: vi.fn(),
    organization: vi.fn(),
    create: vi.fn(),
    hashPassword: vi.fn(),
  }));
vi.mock("@/middleware/auth.middleware", () => ({ requireRole }));
vi.mock("@/lib/db", () => ({
  default: {
    organizationMember: { findUnique: membership },
    organization: { findUnique: organization },
    user: { create },
  },
}));
vi.mock("@/lib/auth", () => ({ hashPassword }));
import { POST } from "@/app/api/v2/staff/accounts/route";

const input = {
  organizationId: "451cd926-8845-4d2f-bc94-9c742e6c56fe",
  fullName: " Referee Name ",
  email: " REFEREE@EXAMPLE.TEST ",
  username: " referee_1 ",
  password: "test-password-123",
  role: "REFEREE",
};
const request = (data = input) =>
  new NextRequest("https://padel.test/api/v2/staff/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

beforeEach(() => {
  requireRole.mockResolvedValue({ userId: "admin-id", role: "ORGANIZER" });
  membership.mockResolvedValue({ role: "OWNER" });
  organization.mockResolvedValue({ id: input.organizationId });
  hashPassword.mockResolvedValue("hashed-password");
  create.mockResolvedValue({
    id: "new-user",
    fullName: "Referee Name",
    email: "referee@example.test",
    username: "referee_1",
    isActive: true,
  });
});
afterEach(() => vi.resetAllMocks());

describe("Admin-created accounts", () => {
  it.each(["REFEREE", "STAFF", "ADMIN"])(
    "creates %s and its membership together without returning credentials",
    async (role) => {
      const response = await POST(request({ ...input, role }));
      expect(response.status).toBe(201);
      expect(requireRole).toHaveBeenCalledWith(expect.any(NextRequest), [
        "SUPER_ADMIN",
        "ORGANIZER",
      ]);
      expect(membership).toHaveBeenCalledWith({
        where: {
          organizationId_userId: {
            organizationId: input.organizationId,
            userId: "admin-id",
          },
        },
      });
      expect(hashPassword).toHaveBeenCalledWith(input.password);
      expect(create).toHaveBeenCalledWith({
        data: {
          fullName: "Referee Name",
          email: "referee@example.test",
          username: "referee_1",
          passwordHash: "hashed-password",
          role: role === "REFEREE" ? "REFEREE" : "ORGANIZER",
          organizationMemberships: {
            create: { organizationId: input.organizationId, role },
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
      const body = await response.json();
      expect(body.data.role).toBe(role);
      expect(body.data).not.toHaveProperty("password");
      expect(body.data).not.toHaveProperty("passwordHash");
    },
  );

  it("allows an organization ADMIN", async () => {
    membership.mockResolvedValue({ role: "ADMIN" });
    expect((await POST(request())).status).toBe(201);
  });
  it.each([null, { role: "STAFF" }, { role: "REFEREE" }])(
    "denies absent or insufficient target-organization membership %j",
    async (member) => {
      membership.mockResolvedValue(member);
      expect((await POST(request())).status).toBe(403);
      expect(hashPassword).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );
  it.each([401, 403])(
    "does not write when authentication/role authorization fails with %s",
    async (status) => {
      requireRole.mockRejectedValue(new AppError(status, "DENIED", "Denied"));
      expect((await POST(request())).status).toBe(status);
      expect(membership).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );
  it.each([
    { role: "SUPER_ADMIN" },
    { role: "OWNER" },
    { password: "short" },
    { password: "é".repeat(37) },
    { username: "name with spaces" },
    { email: "bad" },
  ])("rejects invalid or privileged input %j", async (change) => {
    expect((await POST(request({ ...input, ...change }))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
  it("reports identity conflicts without updating an existing account", async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "5.22.0",
      }),
    );
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toContain(
      "Email atau nama pengguna sudah digunakan",
    );
  });
  it("requires a real target organization for super admins", async () => {
    requireRole.mockResolvedValue({ userId: "super-id", role: "SUPER_ADMIN" });
    organization.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });
});
