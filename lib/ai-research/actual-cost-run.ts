import "server-only";
import { createHash } from "node:crypto";
import { agentReportSchema } from "@/lib/agent-reports/model";
import { prisma } from "@/lib/db/prisma";
import { actualCostReplay, checkActualCostAttempt } from "./actual-cost-ledger";
import type { AiAdmission } from "./admission";
import type { requireAiSource } from "./context";
import { executeResearch } from "./execution";
import { settleNoDispatch } from "./no-dispatch-settlement";
import { researchProvenance } from "./report-provenance";
import type { PromptInput } from "./schema";
import type { AiResearchContext, AiResearchOutcome } from "./service";
import type { AiResearchResult } from "./types";
import { AiPreDispatchRefusal, AiResearchValidationError } from "./validation";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type State = "pending" | "unknown" | "confirmed" | "refused";

export async function runActualCost({
  context,
  input,
  source,
  loadAdmission,
  deadlineAt,
}: {
  context: AiResearchContext;
  input: PromptInput;
  source: Awaited<ReturnType<typeof requireAiSource>>;
  loadAdmission: () => Promise<AiAdmission>;
  deadlineAt: number;
}): Promise<AiResearchOutcome> {
  const { fresh: _fresh, estimate_only: _estimate, ...identity } = input;
  const binding = hash(identity);
  const id = `ai-actual:${hash([context.projectId, input.idempotency_key])}`;
  const checked = await checkActualCostAttempt({
    context,
    connectionId: source.connection.id,
    id,
    binding,
  });
  if (checked) return actualCostReplay(checked.row);
  let admission: AiAdmission;
  try {
    admission = await loadAdmission();
  } catch (error) {
    throw new AiPreDispatchRefusal(error);
  }
  if (admission.policy !== "provider_actual_cost")
    throw new Error("Invalid actual-cost admission.");
  if (admission.estimate > input.estimated_cost_limit_cents!)
    throw new AiPreDispatchRefusal(
      new AiResearchValidationError(
        "cost_limit_exceeded",
        "The partial forecast exceeds the advisory estimate limit.",
      ),
    );
  const pendingResult: AiResearchResult = {
    evidence: "synthetic_prompt_test",
    rows: [],
    totalAvailable: null,
    truncated: true,
    fetchedAt: new Date().toISOString(),
    costCents: 0,
    costStatus: "unknown",
    failure:
      "This provider attempt is pending. Its cost must be reconciled before another actual-cost attempt.",
  };
  const payload = agentReportSchema.parse(
    JSON.parse(
      JSON.stringify({
        kind: "prompt_explorer",
        title: `Prompt comparison: ${input.brand}`,
        body: { input: identity, result: pendingResult, requestBinding: binding },
        provenance: {
          costPolicy: "provider_actual_cost",
          actualCostState: "pending",
          connectionId: source.connection.id,
          executionDeadlineAt: deadlineAt,
          usageTags: [],
          acknowledgement: input.actual_cost_acknowledgement,
        },
      }),
    ),
  );
  const reservation = await checkActualCostAttempt({
    context,
    connectionId: source.connection.id,
    id,
    binding,
    payload,
  });
  if (!reservation) throw new Error("Actual-cost reservation was not created.");
  if (!reservation.created) return actualCostReplay(reservation.row);
  const usageTags: string[] = [];
  const noDispatchTags: string[] = [];
  let state: State = "pending";
  let anyDispatched = false;
  let cleanupPending = false;
  try {
    const executed = await executeResearch({
      context,
      kind: "prompt_explorer",
      input,
      source,
      admitted: admission,
      deadlineAt,
      onPaidDispatch: () => {
        anyDispatched = true;
      },
      onNoPaidDispatch: async (tag) => {
        cleanupPending = true;
        const index = usageTags.indexOf(tag);
        if (index >= 0) usageTags.splice(index, 1);
        noDispatchTags.push(tag);
        await prisma.agentReport.update({
          where: { id },
          data: { provenance: { ...payload.provenance, usageTags, noDispatchTags } },
        });
        await settleNoDispatch({
          projectId: context.projectId,
          connectionId: source.connection.id,
          tags: [tag],
        });
        cleanupPending = false;
      },
      onUsageTag: async (tag) => {
        usageTags.push(tag);
        await prisma.agentReport.update({
          where: { id },
          data: { provenance: { ...payload.provenance, usageTags, noDispatchTags } },
        });
      },
    });
    state = executed.result.costStatus === "unknown" ? "unknown" : "confirmed";
    const final = agentReportSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...payload,
          body: { input: identity, result: executed.result, requestBinding: binding },
          provenance: {
            ...researchProvenance({
              kind: "prompt_explorer",
              input,
              admission,
              estimate: admission.estimate,
              deadlineAt,
              providerRequestIds: executed.providerRequestIds,
              providerId: source.provider.id,
              rows: executed.result.rows,
            }),
            actualCostState: state,
            connectionId: source.connection.id,
            executionDeadlineAt: deadlineAt,
            costPolicy: "provider_actual_cost",
            usageTags,
            noDispatchTags,
          },
        }),
      ),
    );
    await prisma.agentReport.update({
      where: { id },
      data: { body: final.body, provenance: final.provenance },
    });
    return {
      ok: true,
      estimate: false,
      cached: false,
      reportId: reservation.row.publicId,
      result: executed.result,
      costCents: executed.result.costCents,
      retryBlocked: state === "unknown",
    };
  } catch (error) {
    // Only a proven pre-dispatch refusal may release the project for a new request.
    // Failed receipt/report persistence leaves a durable pending reservation.
    if (!anyDispatched && !cleanupPending && state === "pending") {
      await prisma.agentReport.update({
        where: { id },
        data: {
          body: {
            ...payload.body,
            result: {
              ...pendingResult,
              costStatus: "confirmed",
              failure:
                "This attempt was refused before any paid dispatch. No provider charge was incurred.",
            },
          },
          provenance: {
            ...payload.provenance,
            actualCostState: "refused",
            usageTags,
            noDispatchTags,
          },
        },
      });
      throw new AiPreDispatchRefusal(error);
    }
    throw error;
  }
}
