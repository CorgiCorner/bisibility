import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ record: vi.fn(), estimate: vi.fn(), enabled: true }));
vi.mock("./config", () => ({ achievementsEnabled: () => m.enabled }));
vi.mock("./record-use", () => ({ recordQualifiedUse: m.record }));
vi.mock("./request", () => ({ isPracticeEstimate: m.estimate }));

import { withPracticeRequest } from "./api";

const input = {
  actorId: "a",
  req: new Request("https://example.com/api/v1/keywords"),
  url: new URL("https://example.com/api/v1/keywords"),
};
beforeEach(() => {
  vi.clearAllMocks();
  m.enabled = true;
  m.estimate.mockResolvedValue(false);
});
it("does not inspect or attribute anonymous/project-key/disabled and non-qualifying requests", async () => {
  for (const extra of [{ actorId: null }, { actorId: undefined }])
    await withPracticeRequest({ ...input, ...extra }, "researchKeywords", () => new Response("ok"));
  m.enabled = false;
  await withPracticeRequest(input, "researchKeywords", () => new Response("ok"));
  m.enabled = true;
  await withPracticeRequest(input, "health", () => new Response("ok"));
  expect(m.estimate).not.toHaveBeenCalled();
  expect(m.record).not.toHaveBeenCalled();
});
it("preserves null/failed/throwing route semantics and attributes only successful explicit completion", async () => {
  expect(await withPracticeRequest(input, "researchKeywords", () => null)).toBeNull();
  await withPracticeRequest(
    input,
    "researchKeywords",
    async () => new Response(null, { status: 403 }),
  );
  expect(m.record).not.toHaveBeenCalled();
  await expect(
    withPracticeRequest(input, "researchKeywords", async () => {
      throw new Error("route failure");
    }),
  ).rejects.toThrow("route failure");
  await withPracticeRequest(input, "researchKeywords", async () => new Response("ok"));
  expect(m.record).toHaveBeenCalledWith({
    actorId: "a",
    operation: "researchKeywords",
    estimate: false,
    success: true,
  });
});
