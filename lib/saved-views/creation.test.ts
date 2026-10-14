import { describe, expect, it, vi } from "vitest";
import { createViewInTransaction, savedViewCreationHash } from "./creation";
import { keywordViewFixture, viewProjectId } from "./view-test-fixture";

const admission = vi.hoisted(() => ({ allowed: false }));
vi.mock("./creation-extension", () => ({
  privateViewCreationCapability: () => ({ canCreatePrivate: admission.allowed }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn() }));
describe("create request canonical identity", () => {
  it("hashes semantic input independently of object key order but preserves scope and visibility", () => {
    const config = keywordViewFixture();
    const original = {
      config,
      name: "Service",
      projectId: viewProjectId,
      visibility: "private" as const,
    };
    const reordered = {
      visibility: "private" as const,
      projectId: viewProjectId,
      name: "Service",
      config: {
        ...config,
        lens: { locationId: config.lens.locationId, device: config.lens.device },
      },
    };
    expect(savedViewCreationHash(original)).toBe(savedViewCreationHash(reordered));
    expect(savedViewCreationHash({ ...original, visibility: "project" })).not.toBe(
      savedViewCreationHash(original),
    );
    expect(
      savedViewCreationHash({
        ...original,
        config: { ...config, lens: { ...config.lens, locationId: "warsaw" } },
      }),
    ).not.toBe(savedViewCreationHash(original));
  });
});

it("rejects a forged private create after authorization before any lock, count or row write", async () => {
  const actor = {
    id: "user-a",
    memberships: [{ projectId: "project-a", role: "viewer" as const }],
  };
  const tx = { $queryRaw: vi.fn(), savedView: { count: vi.fn(), create: vi.fn() } };
  await expect(
    createViewInTransaction(
      tx as never,
      {
        actor,
        project: {
          id: "project-a",
          publicId: viewProjectId,
          isSample: false,
          writeMode: "active",
        },
      },
      { actor, auditActorId: actor.id, sessionUserId: actor.id, transport: "session" },
      { config: keywordViewFixture(), name: "Secret", visibility: "private" },
    ),
  ).rejects.toMatchObject({ code: "private_view_creation_unavailable", status: 403 });
  expect(tx.$queryRaw).not.toHaveBeenCalled();
  expect(tx.savedView.count).not.toHaveBeenCalled();
  expect(tx.savedView.create).not.toHaveBeenCalled();
});
