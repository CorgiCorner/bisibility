import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock("@/lib/provider-lookups/cache", () => ({ writeProviderLookupCache: mocks.write }));

import { indexPromptResearchCache } from "./prompt-research-index";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("indexes only opened project results without extending the original reuse window", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
  const value = { fetchedAt: "2026-10-24T10:00:00Z", keyword: "tools", reportId: "agr_local" };
  const hash = "a".repeat(64);
  const key = `ai:prompt-research-v2:${hash}`;
  await indexPromptResearchCache("projectA", key, value, 43200);
  expect(mocks.write).toHaveBeenCalledWith(
    `ai:prompt-research-project-v2:projectA:${hash}`,
    value,
    36000,
  );
  mocks.write.mockClear();
  await indexPromptResearchCache("projectA", key, value, 3600);
  await indexPromptResearchCache("projectA", `${key}:lock`, value, 43200);
  await indexPromptResearchCache("projectA:*", key, value, 43200);
  expect(mocks.write).not.toHaveBeenCalled();
});
