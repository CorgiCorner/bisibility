import { prepareResourceCapacity } from "@/lib/capacity/capacity-extension";
import { researchTrackSchema } from "./prompt-research-schema";
import "server-only";
import { getAgentReport } from "@/lib/agent-reports/service";
import {
  lockTrackingProject,
  prisma,
  type TrackingTransaction,
} from "@/lib/ai-tracking/stores/shared";
import { mutateTrackingCatalog } from "@/lib/api/ai-tracking-service";
import { researchProjectState } from "./prompt-research-project";
import { normalizedResearchText, projectResearchQuestions } from "./prompt-research-projection";
import type { AiResearchRow } from "./types";

export async function acceptResearchedPrompts(
  projectId: string,
  value: unknown,
  onCreated: (
    resource: "topics" | "prompts",
    result: { publicId: string },
    tx: TrackingTransaction,
  ) => Promise<void>,
) {
  const input = researchTrackSchema.parse(value);
  const report = await getAgentReport({ projectId, reportId: input.reportId });
  if (report?.kind !== "prompt_research" || report.provenance.evidence !== "observed_dataset")
    throw new Error("Provider dataset report not found.");
  return prisma.$transaction(
    async (tx) => {
      await prepareResourceCapacity(tx, { projectId, dimensions: [] });
      await lockTrackingProject(tx, projectId);
      const state = await researchProjectState(projectId, tx);
      const rows = report.body.result as { rows: AiResearchRow[] };
      const selected = projectResearchQuestions(rows.rows, state).filter(
        (prompt) => input.rowIndices.includes(prompt.rowIndex) && !prompt.tracked,
      );
      if (selected.length === 0) return { added: 0, state };
      let topic = state.topics.find(
        (topic) => normalizedResearchText(topic.name) === normalizedResearchText(input.topic),
      );
      let createdTopic: { publicId: string } | undefined;
      if (!topic) {
        createdTopic = await mutateTrackingCatalog(
          projectId,
          "topics",
          "POST",
          { name: input.topic },
          undefined,
          tx,
        );
        await onCreated("topics", createdTopic, tx);
        topic = {
          id: createdTopic.publicId,
          name: input.topic,
          description: null,
          status: "active",
        };
      }
      const created = [];
      for (const prompt of selected) {
        const saved = await mutateTrackingCatalog(
          projectId,
          "prompts",
          "POST",
          {
            text: prompt.text,
            topicId: topic.id,
            category: "neutral",
            providerDatasetReference: { reportId: input.reportId, rowIndex: prompt.rowIndex },
          },
          undefined,
          tx,
        );
        await onCreated("prompts", saved, tx);
        created.push(saved);
      }
      return {
        added: created.length,
        state: await researchProjectState(projectId, tx),
        created,
        createdTopic,
      };
    },
    { timeout: 15_000 },
  );
}
