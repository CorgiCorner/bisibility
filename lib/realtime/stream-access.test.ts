import { beforeEach, expect, it, vi } from "vitest";
import { canReadStream } from "./stream-access";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  config: vi.fn(),
  findFirst: vi.fn(),
  legacy: vi.fn(),
  legacyIdentity: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { session: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/demo/config", () => ({
  readDemoConfig: mocks.config,
  readOnlyDemoConfig: mocks.legacy,
}));
vi.mock("@/lib/demo/identity", () => ({
  loadConfiguredDemoActor: mocks.actor,
  loadDemoIdentity: mocks.legacyIdentity,
}));
const session = { session: { id: "session" }, user: { id: "user" } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({ kind: "disabled" });
  mocks.legacy.mockReturnValue(null);
  mocks.findFirst.mockResolvedValue({ id: "session" });
});
it("requires a live session belonging to an active project member on every check", async () => {
  expect(await canReadStream(session, "project")).toBe(true);
  expect(mocks.findFirst).toHaveBeenCalledWith({
    select: { id: true },
    where: {
      id: "session",
      userId: "user",
      expiresAt: { gt: expect.any(Date) },
      user: { is: { deactivatedAt: null, memberships: { some: { projectId: "project" } } } },
    },
  });
  mocks.findFirst.mockResolvedValue(null);
  expect(await canReadStream(session, "project")).toBe(false);
  expect(mocks.findFirst).toHaveBeenCalledTimes(2);
});
it("does not preserve a grant after a database failure", async () => {
  await canReadStream(session, "project");
  mocks.findFirst.mockRejectedValue(new Error("offline"));
  await expect(canReadStream(session, "project")).rejects.toThrow("offline");
});
it("revalidates editable identity drift as well as its session", async () => {
  mocks.config.mockReturnValue({ kind: "editable" });
  mocks.actor.mockResolvedValue({ id: "user", kind: "viewer" });
  expect(await canReadStream(session, "project")).toBe(true);
  mocks.actor.mockResolvedValue(null);
  expect(await canReadStream(session, "project")).toBe(false);
  expect(mocks.findFirst).toHaveBeenCalledOnce();
});
