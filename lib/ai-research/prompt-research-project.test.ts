import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  keywords: vi.fn(),
  topics: vi.fn(),
  prompts: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { project: { findUniqueOrThrow: mocks.project }, keyword: { findMany: mocks.keywords } },
}));
vi.mock("@/lib/ai-tracking/stores/topics", () => ({ listTopics: mocks.topics }));
vi.mock("@/lib/ai-tracking/stores/prompts", () => ({ listPrompts: mocks.prompts }));

import { researchProjectState } from "./prompt-research-project";

it("loads current topics, keyword text and prompt revisions without provider work", async () => {
  mocks.project.mockResolvedValue({
    name: "Example",
    domain: "example.com",
    lookupCacheTtlSeconds: 21600,
  });
  mocks.topics.mockResolvedValue([
    { publicId: "ait_topic", name: "Tools", description: null, archivedAt: null, pausedAt: null },
    { publicId: "ait_archived", name: "Old", archivedAt: new Date() },
  ]);
  mocks.prompts.mockResolvedValue([
    { archivedAt: null, revisions: [{ text: "Current question" }, { text: "Earlier wording" }] },
    { archivedAt: new Date(), revisions: [{ text: "Archived question" }] },
  ]);
  mocks.keywords.mockResolvedValue([{ text: "TOOLS" }, { text: "SEO tools" }]);
  expect(await researchProjectState("project")).toEqual({
    domain: "example.com",
    brand: "Example",
    lookupCacheTtlSeconds: 21600,
    tracked: ["Current question"],
    keywords: ["tools", "seo tools"],
    topics: [{ id: "ait_topic", name: "Tools", description: null, status: "active" }],
  });
  expect(mocks.keywords).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { projectId: "project", archivedAt: null },
      select: { text: true },
    }),
  );
});
