import { randomUUID } from "node:crypto";
import type { CostReceipt } from "../ai-tracking/contract";
import { samplePlan } from "../ai-tracking/execution/fixture";
import type { ExecutableSample, TrackingExecutionPorts } from "../ai-tracking/execution/ports";
import { executeTrackingSample } from "../ai-tracking/execution/sample";
import type { AiTrackingProgress, AiTrackingWorkflowInput } from "./ai-tracking-contract";

export function trackingTemporalFixture() {
  const runId = `tracking-temporal-fixture-${randomUUID()}`;
  const plan = samplePlan({ runId, projectId: `fixture-${randomUUID()}` });
  const row: ExecutableSample = {
    plan,
    dispatch: "planned",
    providerTaskId: null,
    receipt: null,
    cancelled: false,
  };
  const calls = { post: 0, get: 0, activity: 0, collectionOnly: 0, persist: 0 };
  const receipts = new Map<string, CostReceipt>();
  const ports: TrackingExecutionPorts = {
    load: async () => ({ ...row }),
    claim: async () => {
      if (row.dispatch !== "planned") return false;
      row.dispatch = "claimed";
      return true;
    },
    transition: async (_plan, expected, next, taskId, receipt) => {
      if (row.dispatch !== expected) return false;
      row.dispatch = next;
      if (taskId) row.providerTaskId = taskId;
      if (receipt) row.receipt = receipt;
      return true;
    },
    prepare: async () => ({
      observer: { begin: async () => "fixture-ledger", settle: async () => undefined },
      submit: async () => {
        calls.post += 1;
        return {
          status_code: 20000,
          tasks: [{ id: "fixture-purchased-task", status_code: 20100, cost: 0.0102 }],
        };
      },
    }),
    collect: async (_plan, taskId) => {
      if (taskId !== "fixture-purchased-task") throw new Error("Unexpected fixture task.");
      calls.get += 1;
      return {
        status_code: 20000,
        tasks: [
          {
            id: taskId,
            status_code: 20000,
            cost: 0,
            result: [{ money_spent: 0.003, items: [{ text: "Fixture answer" }] }],
          },
        ],
      };
    },
    settle: async (_plan, receipt) => {
      receipts.set(receipt.providerCostEntryId ?? "missing", receipt);
    },
    persist: async () => {
      row.dispatch = "terminal";
      calls.persist += 1;
      return true;
    },
  };
  async function collect(input: AiTrackingWorkflowInput): Promise<AiTrackingProgress> {
    if (input.runId !== plan.runId || input.projectId !== plan.projectId)
      throw new Error("Fixture activity scope mismatch.");
    calls.activity += 1;
    if (input.collectionOnly) {
      calls.collectionOnly += 1;
      row.cancelled = true;
    }
    const state = await executeTrackingSample(ports, plan.projectId, plan.sampleId, {
      forceCollection: input.collectionOnly,
    });
    return {
      pending: ["submitted", "collecting", "deferred"].includes(state) ? 1 : 0,
      unknown: state === "submission_unknown" ? 1 : 0,
      terminal: state === "terminal" ? 1 : 0,
      deadline: plan.deadline,
    };
  }
  return {
    input: { projectId: plan.projectId, runId },
    row,
    calls,
    receipts,
    collect,
    workflowId: `ai-tracking:${runId}`,
    taskQueue: `tracking-fixture-${randomUUID()}`,
  };
}
