import { parseArgs } from "node:util";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { EvidenceReplayConflictError, REPLAY_LIMITS } from "./model";
import { replayRequestSchema } from "./schema";
export function parseEvidenceReplayOptions(args: string[] = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      project: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      "max-rows": { type: "string" },
      "batch-size": { type: "string" },
      "dry-run": { type: "boolean" },
      execute: { type: "boolean" },
      resume: { type: "string" },
      stop: { type: "string" },
      "max-batches": { type: "string" },
    },
  });
  const projectId = values.project;
  const batchSize = Number(values["batch-size"] ?? REPLAY_LIMITS.batchSize);
  const maxBatches = Number(values["max-batches"] ?? 1);
  if (
    !projectId ||
    !isPublicIdOfType(projectId, "prj") ||
    (values.execute && values["dry-run"]) ||
    (values.resume && values.stop) ||
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > REPLAY_LIMITS.batchSize ||
    !Number.isSafeInteger(maxBatches) ||
    maxBatches < 1 ||
    maxBatches > 100 ||
    ((values.resume || values.stop) && !values.execute)
  )
    throw new EvidenceReplayConflictError();
  if (values.resume || values.stop) {
    if (
      values.from ||
      values.to ||
      values["max-rows"] ||
      !/^[a-zA-Z0-9_-]{1,128}$/u.test(values.resume ?? values.stop ?? "")
    )
      throw new EvidenceReplayConflictError();
    return {
      projectId,
      execute: true,
      batchSize,
      maxBatches,
      resume: values.resume,
      stop: values.stop,
      request: null,
    };
  }
  const request = replayRequestSchema.parse({
    projectId,
    from: values.from,
    to: values.to,
    maxRows: Number(values["max-rows"] ?? REPLAY_LIMITS.maxRows),
    batchSize,
  });
  return {
    projectId,
    execute: values.execute ?? false,
    batchSize,
    maxBatches,
    resume: undefined,
    stop: undefined,
    request,
  };
}
