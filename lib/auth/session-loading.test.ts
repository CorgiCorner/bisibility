import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadAuth: vi.fn(),
  getSession: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/auth/auth", () => {
  mocks.loadAuth();
  return { auth: { api: { getSession: mocks.getSession } } };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

// Complete cold module loading during collection; the assertions still detect an
// eager auth-engine import anywhere in the real dependency graph.
const { enforceActiveSession, getSessionReference } = await import("./session");

it("loads the authentication engine only when reading a request session", async () => {
  expect(mocks.loadAuth).not.toHaveBeenCalled();
  await expect(enforceActiveSession(null)).resolves.toBeNull();
  expect(mocks.loadAuth).not.toHaveBeenCalled();

  await expect(Promise.all([getSessionReference(), getSessionReference()])).resolves.toEqual([
    null,
    null,
  ]);
  expect(mocks.loadAuth).toHaveBeenCalledOnce();
  expect(mocks.getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) });
});
