import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMe } from "./me";
import { getProjectOverview } from "./project-overview";

const mocks = vi.hoisted(() => ({
  fetchProjectKeywordVolumes: vi.fn(),
  prisma: {
    keyword: { count: vi.fn(), findMany: vi.fn() },
    membership: { findMany: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    rankCheck: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/queries/keyword-metrics-query", () => ({
  fetchProjectKeywordVolumes: mocks.fetchProjectKeywordVolumes,
}));

const invalidProjectIds = ["project_db_1", "kw_a00000000000000000000000"];

describe("public API project ID outputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchProjectKeywordVolumes.mockResolvedValue(new Map());
    mocks.prisma.keyword.count.mockResolvedValue(0);
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      frequency: "daily",
      nextCheckAt: null,
    });
    mocks.prisma.rankCheck.findFirst.mockResolvedValue(null);
  });

  it.each(invalidProjectIds)(
    "fails closed instead of serializing /me project ID %s",
    async (publicId) => {
      mocks.prisma.membership.findMany.mockResolvedValue([
        {
          project: { domain: "example.com", name: "Example", publicId },
          role: "owner",
        },
      ]);

      await expect(
        getMe({
          auth: {
            kind: "personal_token",
            memberships: [],
            token: {
              id: "pat_db_1",
              name: "CLI",
              prefix: "bsb_pat_live_",
              publicId: "pat_a00000000000000000000000",
              scopes: ["read"],
              userId: "user_db_1",
            },
            user: {
              email: "owner@example.com",
              id: "user_db_1",
              name: "Owner",
              publicId: "usr_a00000000000000000000000",
            },
          },
          headers: new Headers(),
          instance: "urn:test",
          method: "GET",
          path: ["me"],
          req: new Request("https://example.com/api/v1/me"),
          url: new URL("https://example.com/api/v1/me"),
        }),
      ).rejects.toMatchObject({ code: "invalid_public_id" });
    },
  );

  it.each(invalidProjectIds)(
    "fails closed instead of serializing overview project ID %s",
    async (publicId) => {
      const req = new Request(`https://example.com/api/v1/projects/${publicId}/overview`);

      await expect(
        getProjectOverview(
          {
            auth: {
              apiKey: {
                id: "key_db_1",
                name: "Key",
                prefix: "bsb_key_live_",
                projectId: "project_db_1",
                scopes: ["read"],
              },
              project: {
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                domain: "example.com",
                id: "project_db_1",
                name: "Example",
                publicId,
                updatedAt: new Date("2026-01-02T00:00:00.000Z"),
              },
            },
            headers: new Headers(),
            instance: "urn:test",
            method: "GET",
            path: ["projects", publicId, "overview"],
            req,
            url: new URL(req.url),
          },
          publicId,
        ),
      ).rejects.toMatchObject({ code: "invalid_public_id" });
    },
  );
});
