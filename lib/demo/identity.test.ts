import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));

import {
  assertEditableDemoAccountMutable,
  assertEditableDemoIdentityPreserved,
  assertEditableDemoProjectPreserved,
  loadConfiguredDemoActor,
  loadEditableDemoOwner,
  loadEditableDemoViewer,
} from "./identity";

const ids = {
  owner: "usr_zyxwvutsrqponmlkjihgfedc",
  project: "prj_abcdefghijklmnopqrstuvwx",
  viewer: "usr_abcdefghijklmnopqrstuvwx",
};

const owner = {
  deactivatedAt: null,
  email: "owner@example.com",
  emailVerified: true,
  id: "owner_db",
  isInstanceAdmin: true,
  memberships: [
    { project: { ownerId: "owner_db", publicId: ids.project }, role: "owner" },
    { project: { ownerId: "other", publicId: "prj_zyxwvutsrqponmlkjihgfedc" }, role: "member" },
  ],
  role: "owner",
  twoFactorEnabled: true,
};

const viewer = {
  deactivatedAt: null,
  email: "viewer@example.com",
  emailVerified: true,
  id: "viewer_db",
  isInstanceAdmin: false,
  memberships: [{ project: { ownerId: "owner_db", publicId: ids.project }, role: "viewer" }],
  role: "viewer",
  twoFactorEnabled: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({
    DEMO_MODE: "editable",
    DEMO_OWNER_ID: ids.owner,
    DEMO_PROJECT_ID: ids.project,
    DEMO_USER_ID: ids.viewer,
  }))
    vi.stubEnv(key, value);
  mocks.findUnique.mockImplementation(({ where }: { where: { publicId: string } }) => {
    if (where.publicId === ids.owner) return Promise.resolve(owner);
    if (where.publicId === ids.viewer) return Promise.resolve(viewer);
    return Promise.resolve(null);
  });
});
afterEach(() => vi.unstubAllEnvs());

it("revalidates both configured actors from project and membership facts", async () => {
  await expect(loadEditableDemoOwner()).resolves.toEqual(owner);
  await expect(loadEditableDemoViewer()).resolves.toEqual(viewer);
  await expect(loadConfiguredDemoActor("owner_db")).resolves.toEqual({
    id: "owner_db",
    kind: "owner",
  });
  await expect(loadConfiguredDemoActor("viewer_db")).resolves.toEqual({
    id: "viewer_db",
    kind: "viewer",
  });
  mocks.findUnique.mockImplementation(({ where }: { where: { publicId: string } }) =>
    Promise.resolve(where.publicId === ids.owner ? { ...owner, memberships: [] } : viewer),
  );
  await expect(loadConfiguredDemoActor("owner_db")).resolves.toBeNull();
});

it("rejects viewer membership drift and deactivated configured actors", async () => {
  mocks.findUnique.mockImplementation(({ where }: { where: { publicId: string } }) => {
    if (where.publicId === ids.owner) return Promise.resolve(owner);
    if (where.publicId === ids.viewer) return Promise.resolve({ ...viewer, memberships: [] });
    return Promise.resolve(null);
  });
  await expect(loadConfiguredDemoActor("viewer_db")).resolves.toBeNull();

  mocks.findUnique.mockImplementation(({ where }: { where: { publicId: string } }) =>
    Promise.resolve(
      where.publicId === ids.owner ? { ...owner, deactivatedAt: new Date() } : viewer,
    ),
  );
  await expect(loadConfiguredDemoActor("owner_db")).resolves.toBeNull();
});

it("permits mutable account work only for the revalidated owner", async () => {
  await expect(assertEditableDemoAccountMutable("owner_db")).resolves.toBeUndefined();
  await expect(assertEditableDemoAccountMutable("viewer_db")).rejects.toThrow("locked");
});

it("forbids deleting the configured Owner, Viewer, and project", async () => {
  await expect(assertEditableDemoIdentityPreserved("owner_db")).rejects.toThrow(
    "cannot be deleted",
  );
  await expect(assertEditableDemoIdentityPreserved("viewer_db")).rejects.toThrow(
    "cannot be deleted",
  );
  await expect(assertEditableDemoIdentityPreserved("other_db")).resolves.toBeUndefined();
  expect(() => assertEditableDemoProjectPreserved(ids.project)).toThrow("cannot be deleted");
  expect(() => assertEditableDemoProjectPreserved("prj_otherabcdefghijklmnopqrstu")).not.toThrow();
});
