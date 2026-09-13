import { updateProfileNameRecord } from "@/lib/account/profile-service";
import { issuePersonalToken } from "@/lib/api/pat-service";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  personalAccessToken: { create: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/auth/audit", () => ({ requiredPublicAuditId: vi.fn(), writeAudit: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { personalAccessToken: mocks.personalAccessToken, user: mocks.user },
}));

const ids = {
  owner: "usr_zyxwvutsrqponmlkjihgfedc",
  project: "prj_abcdefghijklmnopqrstuvwx",
  viewer: "usr_abcdefghijklmnopqrstuvwx",
};
const owner = {
  deactivatedAt: null as Date | null,
  email: "owner@example.com",
  emailVerified: true,
  id: "owner_db",
  isInstanceAdmin: true,
  memberships: [{ project: { ownerId: "owner_db", publicId: ids.project }, role: "owner" }],
  role: "owner",
  twoFactorEnabled: true,
};
let configuredOwner = owner;

beforeEach(() => {
  vi.clearAllMocks();
  configuredOwner = owner;
  for (const [key, value] of Object.entries({
    DEMO_MODE: "editable",
    DEMO_OWNER_ID: ids.owner,
    DEMO_PROJECT_ID: ids.project,
    DEMO_USER_ID: ids.viewer,
  }))
    vi.stubEnv(key, value);
  mocks.user.findUnique.mockImplementation(
    ({ where }: { where: { id?: string; publicId?: string } }) => {
      if (where.publicId)
        return Promise.resolve(where.publicId === ids.owner ? configuredOwner : null);
      if (where.id === owner.id) {
        return Promise.resolve({ name: "Before", publicId: ids.owner });
      }
      return Promise.resolve(null);
    },
  );
  mocks.user.update.mockResolvedValue({ name: "Changed" });
  mocks.personalAccessToken.create.mockResolvedValue({
    createdAt: new Date("2026-09-10T12:00:00.000Z"),
    expiresAt: null,
    id: "token_db",
    lastUsedAt: null,
    name: "Token",
    prefix: "bsb_pat_live_example",
    publicId: "pat_abcdefghijklmnopqrstuvwx",
    revokedAt: null,
    scopes: ["read"],
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("editable account write boundary", () => {
  it("permits a revalidated Owner to write profile and personal-token records", async () => {
    await expect(updateProfileNameRecord(owner.id, "Changed")).resolves.toEqual({
      name: "Changed",
    });
    await expect(
      issuePersonalToken(owner.id, { expiresInDays: 1, name: "Token", scope: "read" }),
    ).resolves.toMatchObject({ name: "Token" });

    expect(mocks.user.update).toHaveBeenCalledOnce();
    expect(mocks.personalAccessToken.create).toHaveBeenCalledOnce();
  });

  it.each([
    ["Viewer", "viewer_db", () => owner],
    ["Owner membership drift", owner.id, () => ({ ...owner, memberships: [] })],
    ["deactivated Owner", owner.id, () => ({ ...owner, deactivatedAt: new Date() })],
  ])("denies %s before profile and personal-token writes", async (_label, userId, identity) => {
    configuredOwner = identity();

    await expect(updateProfileNameRecord(userId, "Changed")).rejects.toThrow("locked");
    await expect(
      issuePersonalToken(userId, { expiresInDays: 1, name: "Token", scope: "read" }),
    ).rejects.toThrow("locked");

    expect(mocks.user.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: userId } }),
    );
    expect(mocks.user.update).not.toHaveBeenCalled();
    expect(mocks.personalAccessToken.create).not.toHaveBeenCalled();
  });
});
