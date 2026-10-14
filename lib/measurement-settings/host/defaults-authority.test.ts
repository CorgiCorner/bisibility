import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DefaultsHostContext } from "./defaults-authority";

const f = vi.hoisted(() => {
  const key = {
    id: "key",
    scopes: ["write"],
    revokedAt: null as Date | null,
    expiresAt: null as Date | null,
  };
  const project = {
    id: "project",
    publicId: `prj_${"a".repeat(24)}`,
    writeMode: "active",
    isSample: false,
  };
  return {
    key,
    project,
    absent: false,
    query: vi.fn(async () => []),
    keyRead: vi.fn(),
    projectRead: vi.fn(),
    memberRead: vi.fn(async () => ({ role: "viewer" })),
  };
});
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: f.query,
    project: { findUnique: f.projectRead },
    apiKey: { findFirst: f.keyRead },
    membership: { findFirst: f.memberRead },
  },
}));

import { defaultsApiContext } from "@/lib/api/project-defaults-authority";
import { prisma } from "@/lib/db/prisma";
import { defaultsApiFixture } from "./defaults-api.test-fixture";
import { defaultsProjectScope } from "./defaults-authority";

const now = new Date("2026-10-13T12:00:00Z");
const context: DefaultsHostContext = {
  actor: { id: "key" },
  auditActorId: null,
  credential: { kind: "project_key", id: "key" },
};
beforeEach(() => {
  vi.clearAllMocks();
  f.absent = false;
  Object.assign(f.key, { scopes: ["write"], revokedAt: null, expiresAt: null });
  Object.assign(f.project, { writeMode: "active", isSample: false });
  f.projectRead.mockImplementation(async () => f.project);
  f.keyRead.mockImplementation(async () => (f.absent ? null : f.key));
});
describe("reviewed defaults retain project-key authority, never a User alias", () => {
  it("uses the router's verified key identity even when the project owner is only a viewer", async () => {
    const adapter = defaultsApiContext(defaultsApiFixture(f.project.publicId, {}));
    expect(adapter).toEqual({ ...context, action: "project_defaults.update" });
    const scope = await defaultsProjectScope(prisma, adapter, f.project.publicId, true, now);
    expect(scope.role).toBe("admin");
    expect(f.memberRead).not.toHaveBeenCalled();
    expect(f.keyRead).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "key", projectId: "project" } }),
    );
    expect(f.query).toHaveBeenCalled();
  });
  it("preview is read-only and cannot borrow owner identity", async () => {
    await defaultsProjectScope(prisma, context, f.project.publicId, false, now);
    expect(f.query).not.toHaveBeenCalled();
    await expect(
      defaultsProjectScope(
        prisma,
        { ...context, actor: { id: "owner" } },
        f.project.publicId,
        true,
        now,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it.each(["revoked", "expired", "read_only", "malformed_scopes", "foreign_key"])(
    "revalidates %s credentials before write or replay",
    async (mode) => {
      if (mode === "revoked") f.key.revokedAt = now;
      if (mode === "expired") f.key.expiresAt = now;
      if (mode === "read_only") f.key.scopes = ["read"];
      if (mode === "malformed_scopes") f.key.scopes = ["unknown"];
      if (mode === "foreign_key") f.absent = true;
      await expect(
        defaultsProjectScope(prisma, context, f.project.publicId, true, now),
      ).rejects.toMatchObject({ code: "forbidden" });
    },
  );
  it.each(["migration_hold", "sample"])("refuses %s project writes", async (mode) => {
    if (mode === "sample") f.project.isSample = true;
    else f.project.writeMode = mode;
    await expect(
      defaultsProjectScope(prisma, context, f.project.publicId, true, now),
    ).rejects.toMatchObject({ name: "ProjectReadOnlyError" });
  });
});
