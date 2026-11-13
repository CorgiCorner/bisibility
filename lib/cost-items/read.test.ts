import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  items: vi.fn(),
  projects: vi.fn(),
  scope: vi.fn(),
  spend: vi.fn(),
  suggest: vi.fn(),
}));

vi.mock("@/lib/queries/_auth", () => ({ getQueryActor: mocks.actor }));
vi.mock("@/lib/actions/_shared", () => ({ requireProjectScope: mocks.scope }));
vi.mock("@/lib/metering/usage-read", () => ({ monthlySpendCents: mocks.spend }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    costItem: { findMany: mocks.items },
    project: { findMany: mocks.projects },
  },
}));
vi.mock("./suggest-link-extension", () => ({ suggestToolHref: mocks.suggest }));

import { readUsageCosts } from "./read";

const actor = {
  id: "user_1",
  memberships: [{ projectId: "project_1", role: "owner" as const }],
};

describe("usage cost reader", () => {
  beforeEach(() => {
    mocks.actor.mockResolvedValue(actor);
    mocks.scope.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: "prj_example",
      writeMode: "active",
    });
    mocks.items.mockResolvedValue([]);
    mocks.projects.mockResolvedValue([
      { id: "project_1", name: "Example", publicId: "prj_example", writeMode: "active" },
    ]);
    mocks.spend.mockResolvedValue(0);
  });

  it("passes the suggest link through", async () => {
    mocks.suggest.mockReturnValue("/tools/suggest");
    await expect(readUsageCosts("prj_example")).resolves.toMatchObject({
      suggestHref: "/tools/suggest",
    });
  });

  it("passes an absent suggest link through", async () => {
    mocks.suggest.mockReturnValue(null);
    await expect(readUsageCosts("prj_example")).resolves.toMatchObject({ suggestHref: null });
  });
});
