import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { z } from "zod";
import { REPLAY_LIMITS } from "./model";
export const replayRequestSchema = z
  .object({
    projectId: z.string().refine((value) => isPublicIdOfType(value, "prj")),
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    maxRows: z.int().min(1).max(REPLAY_LIMITS.maxRows).default(REPLAY_LIMITS.maxRows),
    batchSize: z.int().min(1).max(REPLAY_LIMITS.batchSize).default(REPLAY_LIMITS.batchSize),
  })
  .strict()
  .refine((value) => Date.parse(value.from) <= Date.parse(value.to), "Invalid replay window");
export const replayCandidateSchema = z
  .object({
    checkId: z.string().min(1),
    checkPublicId: z.string(),
    keywordId: z.string().min(1),
    keywordPublicId: z.string(),
    checkedAtText: z.string().min(1),
    createdAtText: z.string().min(1),
    status: z.string(),
    provider: z.string(),
    normalizationVersion: z.string().nullable(),
    requestedDepth: z.int().nullable(),
    rawBytes: z.int().nonnegative(),
    rawHash: z.string().regex(/^[a-f0-9]{64}$/u),
    storedHash: z.string().regex(/^[a-f0-9]{64}$/u),
    observationHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
  })
  .strict();
