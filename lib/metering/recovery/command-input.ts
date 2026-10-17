import { z } from "zod";
import { MAX_RECOVERY_BATCH } from "./input";
export const RECOVERY_COMMAND_LEASE_MS = 120000;
export const recoveryCommandSchema = z
  .object({
    instance: z.string(),
    retries: z.record(z.string().regex(/^\d+$/), z.number().int().min(1).max(2)).optional(),
    items: z
      .array(
        z
          .object({
            token: z.string(),
            version: z.string(),
            action: z.enum(["recover_proof", "restore_result", "resume_queued_run"]),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_RECOVERY_BATCH),
  })
  .strict();
export type RecoveryCommandInput = z.infer<typeof recoveryCommandSchema>;
