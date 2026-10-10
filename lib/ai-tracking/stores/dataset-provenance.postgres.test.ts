import { makePublicId } from "@/lib/db/public-id-resources";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isolatedTrackingDatabase, trackingProject } from "./fixtures.postgres-test-support";

const mock = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return mock.client;
  },
}));

import { createPrompt, updatePrompt } from "./prompts";

describe("provider dataset prompt provenance", () => {
  let db: Awaited<ReturnType<typeof isolatedTrackingDatabase>>;
  let a: Awaited<ReturnType<typeof trackingProject>>;
  let b: Awaited<ReturnType<typeof trackingProject>>;
  beforeAll(async () => {
    db = await isolatedTrackingDatabase();
    mock.client = db.client;
    a = await trackingProject(db.client, "dataset-a");
    b = await trackingProject(db.client, "dataset-b");
  }, 120000);
  afterAll(async () => {
    if (db) await db.dispose();
  });
  it("accepts only stored genuine provider dataset rows and preserves exact original query", async () => {
    const report = await db.client.agentReport.create({
      data: {
        projectId: a.project.id,
        publicId: makePublicId("agr"),
        kind: "ai_visibility",
        title: "Fixture observed dataset",
        provenance: {
          evidence: "observed_dataset",
          scope: "provider_dataset_only",
          provider: "dataforseo",
          endpoint: "llm_mentions/search_mentions/live",
          providerRequestIds: ["fixture-request"],
        },
        body: {
          input: { brand: "Brand", language_code: "en" },
          result: {
            evidence: "observed_dataset",
            fetchedAt: "2026-10-08T00:00:00Z",
            rows: [
              {
                prompt: " Exact provider query\n",
                model: "chat_gpt",
                answer: "Provider dataset answer",
                observedAt: null,
                brandMentioned: true,
                domainCited: false,
                citations: [
                  { title: "Observed", url: "https://fixture.example.com", targetDomain: true },
                ],
              },
            ],
          },
        },
      },
    });
    const reference = { reportId: report.publicId, rowIndex: 0 };
    await expect(
      createPrompt(b.project.id, { text: "Foreign", providerDatasetReference: reference }),
    ).rejects.toThrow("report");
    await expect(
      createPrompt(a.project.id, {
        text: "Missing",
        providerDatasetReference: { ...reference, rowIndex: 1 },
      }),
    ).rejects.toThrow("row");
    const accepted = await createPrompt(a.project.id, {
      text: "Edited provider query\n",
      providerDatasetReference: reference,
    });
    await db.client.agentReport.delete({ where: { id: report.id } });
    const edited = await updatePrompt(a.project.id, accepted.id, { category: "comparative" });
    expect(edited.revisions[0].provenance).toMatchObject({
      method: "provider_dataset",
      scope: "provider_dataset_only",
      originalPrompt: " Exact provider query\n",
      rowIndex: 0,
      measuredPopularity: null,
    });
    const synthetic = await db.client.agentReport.create({
      data: {
        projectId: a.project.id,
        publicId: makePublicId("agr"),
        kind: "prompt_explorer",
        title: "Synthetic",
        provenance: { evidence: "synthetic_prompt_test" },
        body: { result: { evidence: "synthetic_prompt_test", rows: [] } },
      },
    });
    await expect(
      createPrompt(a.project.id, {
        text: "Synthetic",
        providerDatasetReference: { reportId: synthetic.publicId, rowIndex: 0 },
      }),
    ).rejects.toThrow("report");
  });
});
