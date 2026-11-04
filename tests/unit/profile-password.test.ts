import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  updateMany: vi.fn(),
  comparePassword: vi.fn(),
  hashPassword: vi.fn(),
}));
vi.mock("@/middleware/auth.middleware", () => ({
  requireAuth: mocks.requireAuth,
}));
vi.mock("@/lib/db", () => ({
  default: {
    user: {
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      updateMany: mocks.updateMany,
    },
  },
}));
vi.mock("@/lib/auth", () => ({
  comparePassword: mocks.comparePassword,
  hashPassword: mocks.hashPassword,
}));
import { POST } from "@/app/api/v2/profile/password/route";
const request = (body = {}) =>
  new NextRequest("https://padel.test/api/v2/profile/password", {
    method: "POST",
    body: JSON.stringify({
      currentPassword: "old-password",
      newPassword: "new-password",
      ...body,
    }),
  });
beforeEach(() => {
  mocks.requireAuth.mockResolvedValue({ userId: "self" });
  mocks.findUniqueOrThrow.mockResolvedValue({ passwordHash: "old-hash" });
  mocks.comparePassword.mockResolvedValue(true);
  mocks.hashPassword.mockResolvedValue("new-hash");
  mocks.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.resetAllMocks());
it("changes only authenticated account even with injected userId", async () => {
  const result = await POST(request({ userId: "someone-else" }));
  expect(result.status).toBe(200);
  expect(mocks.updateMany).toHaveBeenCalledWith({
    where: { id: "self", passwordHash: "old-hash" },
    data: { passwordHash: "new-hash" },
  });
  expect(await result.json()).toEqual({ data: { success: true } });
});
it("rejects competing password update instead of overwriting", async () => {
  mocks.updateMany.mockResolvedValue({ count: 0 });
  expect((await POST(request())).status).toBe(409);
});
it("requires authentication before reading credentials", async () => {
  mocks.requireAuth.mockRejectedValue(AppError.unauthorized());
  expect((await POST(request())).status).toBe(401);
  expect(mocks.findUniqueOrThrow).not.toHaveBeenCalled();
});
it("requires correct current password before hashing replacement", async () => {
  mocks.comparePassword.mockResolvedValue(false);
  expect((await POST(request())).status).toBe(400);
  expect(mocks.hashPassword).not.toHaveBeenCalled();
  expect(mocks.updateMany).not.toHaveBeenCalled();
});
it.each(["short", "😊".repeat(30), "old-password"])(
  "rejects invalid or unchanged replacement",
  async (newPassword) => {
    expect((await POST(request({ newPassword }))).status).toBe(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  },
);
