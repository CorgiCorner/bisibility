import "server-only";
import { createHash } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import { z } from "zod";
import type { RecoveryCaseKind, RecoveryFilters } from "./contract";
import { RecoveryCaseChangedError } from "./errors";
import { MAX_RECOVERY_BATCH } from "./input";

const kind = z.enum(["operation", "evidence", "run", "result", "check"]);
const base = {
  actor: z.string().min(1),
  instance: z.string().min(1),
  namespace: z.string().min(1),
};
const caseEnvelope = z
  .object({ ...base, type: z.literal("recovery-case"), kind, id: z.string().min(1) })
  .strict();
const cursorEnvelope = z
  .object({
    ...base,
    type: z.literal("recovery-cursor"),
    after: z.string(),
    filters: z.string(),
    to: z.iso.datetime(),
  })
  .strict();
const previewEnvelope = z
  .object({
    ...base,
    type: z.literal("recovery-preview"),
    expiresAt: z.iso.datetime(),
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
export type RecoveryTokenScope = { actor: string; namespace: string; instance: string };
export const recoveryInstance = () =>
  createHash("sha256")
    .update(process.env.SITE_URL ?? "self-host")
    .digest("hex")
    .slice(0, 16);
export const recoveryHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function open<T>(token: string, schema: z.ZodType<T>, scope: RecoveryTokenScope): T {
  try {
    const parts = token.split(":"),
      payload = parts[0] === "v2" ? parts.slice(2) : parts.slice(1);
    if (
      !payload.length ||
      payload.some((part) => Buffer.from(part, "base64").toString("base64") !== part)
    )
      throw new Error();
    const value = schema.parse(JSON.parse(decryptSecret(token)));
    const envelope = value as T & RecoveryTokenScope;
    if (
      envelope.actor !== scope.actor ||
      envelope.instance !== scope.instance ||
      envelope.namespace !== scope.namespace
    )
      throw new Error();
    return value;
  } catch {
    throw new RecoveryCaseChangedError("Invalid recovery token");
  }
}
export const recoveryCaseKey = (kind: RecoveryCaseKind, id: string) => `${kind}:${id}`;
export function sealRecoveryCase(scope: RecoveryTokenScope, kind: RecoveryCaseKind, id: string) {
  return encryptSecret(JSON.stringify({ ...scope, type: "recovery-case", kind, id }));
}
export function openRecoveryCase(token: string, scope: RecoveryTokenScope) {
  return open(token, caseEnvelope, scope);
}
const filtersKey = (filters: RecoveryFilters) =>
  JSON.stringify([filters.category ?? "all", filters.provider ?? null]);
export function sealRecoveryCursor(
  after: string | null,
  to: string,
  filters: RecoveryFilters,
  scope: RecoveryTokenScope,
) {
  return after
    ? encryptSecret(
        JSON.stringify({
          ...scope,
          type: "recovery-cursor",
          after,
          to,
          filters: filtersKey(filters),
        }),
      )
    : null;
}
export function openRecoveryCursor(
  token: string | undefined,
  filters: RecoveryFilters,
  scope: RecoveryTokenScope,
) {
  if (!token) return null;
  const value = open(token, cursorEnvelope, scope);
  if (value.filters !== filtersKey(filters))
    throw new RecoveryCaseChangedError("Invalid recovery cursor");
  return value;
}
export function sealRecoveryPreview(
  scope: RecoveryTokenScope,
  items: z.infer<typeof previewEnvelope>["items"],
  now: Date,
) {
  const expiresAt = new Date(now.getTime() + 5 * 60000).toISOString();
  return {
    token: encryptSecret(JSON.stringify({ ...scope, type: "recovery-preview", expiresAt, items })),
    expiresAt,
  };
}
export function openRecoveryPreview(
  token: string,
  scope: RecoveryTokenScope,
  now: Date,
  allowExpired = false,
) {
  const value = open(token, previewEnvelope, scope);
  if (!allowExpired && Date.parse(value.expiresAt) <= now.getTime())
    throw new RecoveryCaseChangedError("Recovery preview expired");
  return value;
}
