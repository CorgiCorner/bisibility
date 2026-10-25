import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  report: vi.fn(),
  state: vi.fn(),
  mutate: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/agent-reports/service", () => ({ getAgentReport: mocks.report }));
vi.mock("./prompt-research-project", () => ({ researchProjectState: mocks.state }));
vi.mock("@/lib/api/ai-tracking-service", () => ({ mutateTrackingCatalog: mocks.mutate }));

import { acceptResearchedPrompts } from "./prompt-research-accept";

const row = {
  prompt: "best tools?",
  answer: "",
  model: "chat_gpt",
  observedAt: null,
  brandMentioned: false,
  domainCited: false,
  citations: [],
};
const transaction = {};
vi.mock("@/lib/ai-tracking/stores/shared", () => ({
  prisma: { $transaction: async (run: (tx: object) => Promise<unknown>) => run(transaction) },
  lockTrackingProject: vi.fn(),
}));
const input = { reportId: "agr_a00000000000000000000000", rowIndices: [0, 0], topic: "Tools" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.report.mockResolvedValue({
    kind: "prompt_research",
    body: { result: { rows: [row] } },
    provenance: { evidence: "observed_dataset" },
  });
  mocks.state.mockResolvedValue({
    brand: "Example",
    domain: "example.com",
    tracked: [],
    topics: [],
  });
  mocks.mutate.mockImplementation(async (_project, resource) => ({
    publicId: resource === "topics" ? "ait_topic" : "aip_prompt",
  }));
});
it("creates topics and trusted prompt references through the existing paths, auditing each mutation", async () => {
  const result = await acceptResearchedPrompts("project", input, mocks.audit);
  expect(result.added).toBe(1);
  expect(mocks.mutate.mock.calls).toEqual([
    ["project", "topics", "POST", { name: "Tools" }, undefined, transaction],
    [
      "project",
      "prompts",
      "POST",
      {
        text: "Best tools?",
        topicId: "ait_topic",
        category: "neutral",
        providerDatasetReference: { reportId: input.reportId, rowIndex: 0 },
      },
      undefined,
      transaction,
    ],
  ]);
  expect(mocks.audit.mock.calls).toEqual([
    ["topics", { publicId: "ait_topic" }, transaction],
    ["prompts", { publicId: "aip_prompt" }, transaction],
  ]);
});
it("reuses a topic regardless of case and skips prompts already tracked, including variants", async () => {
  mocks.state.mockResolvedValue({
    brand: "Example",
    domain: "example.com",
    tracked: [],
    topics: [{ id: "ait_existing", name: "TOOLS" }],
  });
  await acceptResearchedPrompts("project", input, mocks.audit);
  expect(mocks.mutate).toHaveBeenCalledTimes(1);
  expect(mocks.mutate.mock.calls[0][3].topicId).toBe("ait_existing");
  mocks.mutate.mockClear();
  mocks.state.mockResolvedValue({
    brand: "Example",
    domain: "example.com",
    tracked: ["Best tool in 2026?"],
    topics: [],
  });
  expect((await acceptResearchedPrompts("project", input, mocks.audit)).added).toBe(0);
  expect(mocks.mutate).not.toHaveBeenCalled();
});
it("rejects missing, cross-project or fabricated dataset evidence before mutation", async () => {
  for (const report of [null, { kind: "external", provenance: {} }]) {
    mocks.report.mockResolvedValueOnce(report);
    await expect(acceptResearchedPrompts("project", input, mocks.audit)).rejects.toThrow(
      "report not found",
    );
  }
  expect(mocks.report).toHaveBeenCalledWith({ projectId: "project", reportId: input.reportId });
  expect(mocks.mutate).not.toHaveBeenCalled();
});
