import { z } from "zod";

export const unknownCloseoutPolicy = "native-byok-cost-unknown-v1";
export const unknownCloseoutManifest = z
  .object({
    policy: z.literal(unknownCloseoutPolicy),
    namespace: z.string().min(1).max(128),
    operator: z.string().regex(/^usr_[a-z0-9]+$/),
    reason: z.string().trim().min(8).max(300),
    evidenceRef: z.string().trim().min(8).max(200),
    recordedAt: z.iso.datetime(),
    operations: z
      .array(
        z
          .object({
            operationId: z.string().min(1).max(256),
            expectedVersion: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(25),
  })
  .strict()
  .refine((value) => {
    const ids = value.operations.map((item) => item.operationId);
    return ids.join("\n") === [...new Set(ids)].sort().join("\n");
  }, "Operations must be unique and sorted");
export type UnknownCloseoutManifest = z.infer<typeof unknownCloseoutManifest>;
