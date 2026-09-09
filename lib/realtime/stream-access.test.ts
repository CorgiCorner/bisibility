import { beforeEach, expect, it, vi } from "vitest";
import { canReadStream } from "./stream-access";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), demo: vi.fn(), identity: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { session: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/demo/config", () => ({ readOnlyDemoConfig: mocks.demo }));
vi.mock("@/lib/demo/identity", () => ({ loadDemoIdentity: mocks.identity }));
const session = { session: { id: "session" }, user: { id: "user" } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.demo.mockReturnValue(null);
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
it("revalidates the restricted demo identity as well as its session", async () => {
  mocks.demo.mockReturnValue({});
  mocks.identity.mockResolvedValue({ id: "user" });
  expect(await canReadStream(session, "project")).toBe(true);
  mocks.identity.mockResolvedValue(null);
  expect(await canReadStream(session, "project")).toBe(false);
  expect(mocks.findFirst).toHaveBeenCalledOnce();
});
