import type { DataForSeoResponse } from "@/lib/providers/serp/dataforseo-payload";
import { dataForSeoUsageReceipt } from "@/lib/providers/serp/usage-receipts";
import type { LocalSubmissionOutcome } from "./contracts";
import { nonnegative, object, positiveInteger } from "./records";
import { nativeTaskId } from "./request";

function monetaryField(record: Record<string, unknown>, field: string): number | undefined {
  if (!Object.hasOwn(record, field)) return undefined;
  const value = record[field];
  return typeof value === "number" ? value : Number.NaN;
}
export function parseLocalSubmission(
  data: unknown,
  ok: boolean,
  expectedTasks: number,
  receivedAt: Date,
): LocalSubmissionOutcome {
  if (
    !Number.isSafeInteger(expectedTasks) ||
    expectedTasks < 1 ||
    expectedTasks > 100 ||
    !Number.isFinite(receivedAt.getTime())
  )
    throw new Error("Invalid local submission expectation");
  const root = object(data);
  const tasks = Array.isArray(root?.tasks) ? root.tasks : [];
  const charges = tasks.map((value) => {
    const task = object(value);
    return Object.freeze({
      taskId: nativeTaskId(task?.id),
      statusCode: positiveInteger(task?.status_code),
      costUsd: nonnegative(task?.cost),
    });
  });
  const accepted = charges.filter((task) => task.statusCode === 20100 && task.taskId !== null);
  const ids = [...new Set(accepted.map((task) => task.taskId as string))];
  const determinate = charges.every((task) =>
    task.statusCode === 20100
      ? task.taskId !== null
      : task.statusCode !== null && task.statusCode >= 40000 && task.statusCode < 50000,
  );
  const exhaustive =
    ok &&
    root?.status_code === 20000 &&
    tasks.length === expectedTasks &&
    (root.tasks_count === undefined || root.tasks_count === expectedTasks) &&
    determinate &&
    ids.length === accepted.length;
  const acceptance = exhaustive ? (ids.length > 0 ? "accepted" : "rejected") : "unknown";
  // Reuse existing receipt authority. Preserve malformed cost as unknown, not zero.
  const financial: DataForSeoResponse | null = root
    ? {
        status_code: root.status_code === 20000 ? 20000 : undefined,
        cost: monetaryField(root, "cost"),
        tasks: tasks.map((raw) => {
          const task = object(raw) ?? {};
          return {
            id: nativeTaskId(task.id) ?? undefined,
            cost: monetaryField(task, "cost"),
            status_code: positiveInteger(task.status_code) ?? undefined,
          };
        }),
      }
    : null;
  const usage = dataForSeoUsageReceipt(financial, { ok });
  return Object.freeze({
    acceptance,
    taskIds: Object.freeze(ids),
    receivedAt: receivedAt.toISOString(),
    usage: {
      ...usage,
      failed: !ok || acceptance !== "accepted" || charges.some((task) => task.statusCode !== 20100),
    },
    taskCharges: Object.freeze(charges),
    envelopeCostUsd: nonnegative(root?.cost),
    dispatchEvidenceVerified: false,
  });
}
export function unknownLocalSubmission(receivedAt: Date): LocalSubmissionOutcome {
  return Object.freeze({
    acceptance: "unknown",
    taskIds: Object.freeze([]),
    receivedAt: receivedAt.toISOString(),
    usage: { cached: false, costCents: null, quantity: null, failed: true },
    taskCharges: Object.freeze([]),
    envelopeCostUsd: null,
    dispatchEvidenceVerified: false,
  });
}
