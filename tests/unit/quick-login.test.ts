import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ default: { user: { findUnique } } }));
vi.mock("@/lib/auth", () => ({ AUTH_CONFIG: { COOKIE_NAME: "token" }, generateToken: () => "test-token" }));
import { POST } from "@/app/api/v1/auth/quick-login/route";

beforeEach(() => {
  vi.stubEnv("TEMPORARY_BUTTON_LOGIN", "true");
  vi.stubEnv("TEMPORARY_LOGIN_EMAIL", "preview@example.test");
  findUnique.mockResolvedValue({ id: "preview", role: "ORGANIZER", isActive: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function request(host: string, origin: string, site = "same-origin") {
  return new NextRequest(`http://${host}/api/v1/auth/quick-login`, {
    method: "POST", headers: { host, origin, "sec-fetch-site": site },
  });
}
describe("Preview login origin protection", () => {
  it.each(["127.0.0.1:3000", "localhost:3000", "[::1]:3000"])("allows matching browser origin for %s", async host => {
    const response = await POST(request(host, `http://${host}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("token=test-token");
  });
  it.each(["https://evil.example", "http://127.0.0.1:3001", "https://127.0.0.1:3000", "null"])("rejects mismatched origin %s", async origin => {
    expect((await POST(request("127.0.0.1:3000", origin))).status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
  });
  it("rejects cross-site requests even with a matching origin", async () => {
    expect((await POST(request("127.0.0.1:3000", "http://127.0.0.1:3000", "cross-site"))).status).toBe(403);
  });
  it("keeps temporary login disabled unless explicitly enabled", async () => {
    vi.stubEnv("TEMPORARY_BUTTON_LOGIN", "false");
    expect((await POST(request("127.0.0.1:3000", "http://127.0.0.1:3000"))).status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
