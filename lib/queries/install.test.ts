import { beforeEach, describe, expect, it, vi } from "vitest";
import { getInstallApiKeySummary } from "./install";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getRequestProjectDefaults: vi.fn(),
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { apiKey: { findFirst: mocks.findFirst } },
}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("./workspace-request-data", () => ({
  getRequestProjectDefaults: mocks.getRequestProjectDefaults,
}));

const now = new Date("2026-08-28T12:00:00.000Z");
const projectRef = "prj_abcdefghijklmnopqrstuvwx";

function apiKey(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-08-16T12:00:00.000Z"),
    prefix: "bsk_example_",
    scopes: ["read", "write"],
    ...overrides,
  };
}

describe("getInstallApiKeySummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: { id: "project_1" } });
    mocks.getRequestProjectDefaults.mockResolvedValue({ timezone: "Europe/Warsaw" });
    mocks.findFirst.mockResolvedValue(apiKey());
  });

  it("selects the newest active key for the authorized internal project", async () => {
    await getInstallApiKeySummary(projectRef, { now });

    expect(mocks.requireReadableProject).toHaveBeenCalledWith(projectRef);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, prefix: true, scopes: true },
      take: 1,
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        projectId: "project_1",
        revokedAt: null,
      },
    });
  });

  it("masks the returned row to its stored prefix", async () => {
    mocks.findFirst.mockResolvedValue(
      apiKey({ createdAt: new Date("2026-08-20T12:00:00.000Z"), prefix: "bsk_newest_" }),
    );

    await expect(getInstallApiKeySummary(projectRef, { now })).resolves.toMatchObject({
      maskedValue: "bsk_newest_******",
    });
  });

  it("uses the shared predicate to exclude revoked and expired keys", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(getInstallApiKeySummary(projectRef, { now })).resolves.toBeNull();

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          projectId: "project_1",
          revokedAt: null,
        },
      }),
    );
  });

  it("returns null when there is no active key", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(getInstallApiKeySummary(projectRef, { now })).resolves.toBeNull();
  });

  it.each([
    [["read"], "Read only"],
    [["read", "write"], "Read and write"],
    [["read", "write", "admin"], "Full access"],
  ] as const)("maps %j stored scopes to %s", async (scopes, scopeLabel) => {
    mocks.findFirst.mockResolvedValue(apiKey({ scopes }));

    await expect(getInstallApiKeySummary(projectRef, { now })).resolves.toEqual({
      createdLabel: "created 2026-08-16",
      maskedValue: "bsk_example_******",
      scopeLabel,
    });
  });
});
