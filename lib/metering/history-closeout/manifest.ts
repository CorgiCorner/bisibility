import { z } from "zod";

/** Accepted 2026-10-18: the original connection must be retired. Meaning is frozen. */
export const closeoutPolicy = "known-cost-incomplete-byok-v1";
/** Owner decision 2026-10-27 (ADR-020 amendment): the existing BYOK connection stays live. */
export const liveConnectionCloseoutPolicy = "known-cost-incomplete-byok-live-connection-v1";
export const retiredSettingsCloseoutPolicy = "known-cost-incomplete-byok-retired-settings-v1";
export const closeoutPolicies = [
  closeoutPolicy,
  liveConnectionCloseoutPolicy,
  retiredSettingsCloseoutPolicy,
] as const;
export type CloseoutPolicy = (typeof closeoutPolicies)[number];
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
    policy: z.enum(closeoutPolicies),
    namespace: text(128),
    // Exactly one: an existing project or the internal ID of a deleted project.
    projectPublicId: text(100).regex(/^prj_/).optional(),
    retiredProjectId: text(100)
      .regex(/^[a-z0-9]+$/)
      .optional(),
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
    if ((value.projectPublicId === undefined) === (value.retiredProjectId === undefined))
      context.addIssue({
        code: "custom",
        path: ["projectPublicId"],
        message: "Select exactly one existing project or one retired project.",
      });
    if (value.retiredProjectId !== undefined && value.policy === liveConnectionCloseoutPolicy)
      context.addIssue({
        code: "custom",
        path: ["retiredProjectId"],
        message: "A retired project requires the retired-connection policy.",
      });
    if (value.policy === retiredSettingsCloseoutPolicy && value.retiredProjectId === undefined)
      context.addIssue({
        code: "custom",
        path: ["retiredProjectId"],
        message: "The retired-settings policy requires an explicitly retired project.",
      });
    const ids = value.operations.map((item) => item.operationId);
    if (ids.join("\n") !== [...new Set(ids)].sort().join("\n"))
      context.addIssue({
        code: "custom",
        path: ["operations"],
        message: "Operations must be unique and sorted.",
      });
  });
export type CloseoutManifest = z.infer<typeof closeoutManifest>;
