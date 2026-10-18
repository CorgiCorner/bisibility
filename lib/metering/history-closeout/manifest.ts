import { z } from "zod";

export const closeoutPolicy = "known-cost-incomplete-byok-v1";
export const historyMigration = "20261011021000_accounting_history";
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127),
      "Control characters are not allowed.",
    );
export const closeoutManifest = z
  .object({
    policy: z.literal(closeoutPolicy),
    namespace: text(128),
    projectPublicId: text(100).regex(/^prj_/),
    connection: text(256),
    operator: text(100).regex(/^usr_/),
    reason: text(300).min(8),
    evidenceRef: text(200).min(8),
    recordedAt: z.iso.datetime(),
    operations: z
      .array(
        z
          .object({
            operationId: text(256),
            expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
            receiptId: text(256),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.operations.map((item) => item.operationId);
    if (ids.join("\n") !== [...new Set(ids)].sort().join("\n"))
      context.addIssue({
        code: "custom",
        path: ["operations"],
        message: "Operations must be unique and sorted.",
      });
  });
export type CloseoutManifest = z.infer<typeof closeoutManifest>;
