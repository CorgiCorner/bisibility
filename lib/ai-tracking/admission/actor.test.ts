import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  apiKey: { findFirst: vi.fn() },
  personalAccessToken: { findFirst: vi.fn() },
  oauthClient: { findUnique: vi.fn() },
  oauthConsent: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth/authorize", () => ({
  authorize: vi.fn((actor) => {
    if (!actor.memberships.length) throw new Error("forbidden");
    return {};
  }),
}));

import { reauthorizeTrackingActor } from "./actor";

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({
    id: "user",
    deactivatedAt: null,
    memberships: [{ projectId: "project", role: "member" }],
  });
});
it("fails closed when original membership is removed, without owner fallback", async () => {
  db.user.findUnique.mockResolvedValue({ id: "user", memberships: [], deactivatedAt: null });
  await expect(reauthorizeTrackingActor("project", { actorId: "user" })).rejects.toThrow(
    "forbidden",
  );
});
it("checks project-key affinity, revocation, expiry and current write scope", async () => {
  db.apiKey.findFirst.mockResolvedValue({ scopes: ["read"], revokedAt: null, expiresAt: null });
  await expect(
    reauthorizeTrackingActor("project", {
      actorId: "synthetic",
      actorCredential: { id: "key", kind: "project_key" },
    }),
  ).rejects.toThrow(/write scope/);
  db.apiKey.findFirst.mockResolvedValue({
    scopes: ["write"],
    revokedAt: new Date(),
    expiresAt: null,
  });
  await expect(
    reauthorizeTrackingActor("project", {
      actorId: "synthetic",
      actorCredential: { id: "key", kind: "project_key" },
    }),
  ).rejects.toThrow(/revoked/);
  db.apiKey.findFirst.mockResolvedValue({ scopes: ["write"], revokedAt: null, expiresAt: null });
  await reauthorizeTrackingActor("project", {
    actorId: "synthetic",
    actorCredential: { id: "key", kind: "project_key" },
  });
  expect(db.apiKey.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "key", projectId: "project" } }),
  );
  expect(db.user.findUnique).not.toHaveBeenCalled();
});
it("checks personal token identity and user deactivation independently", async () => {
  db.personalAccessToken.findFirst.mockResolvedValue({
    scopes: ["write"],
    revokedAt: null,
    expiresAt: null,
  });
  db.user.findUnique.mockResolvedValue({
    id: "user",
    deactivatedAt: new Date(),
    memberships: [{ projectId: "project", role: "member" }],
  });
  await expect(
    reauthorizeTrackingActor("project", {
      actorId: "user",
      actorCredential: { id: "token", kind: "personal_token" },
    }),
  ).rejects.toThrow(/unavailable/);
  expect(db.personalAccessToken.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "token", userId: "user" } }),
  );
});
