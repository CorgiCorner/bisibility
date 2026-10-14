"use server";
import { consume } from "@/lib/api/ratelimit";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { RecoveryAuthorizationError } from "@/lib/metering/recovery/authorization";
import { commitRecovery, getRecoveryCommand } from "@/lib/metering/recovery/commands";
import { RecoveryCaseChangedError } from "@/lib/metering/recovery/errors";
import { previewRecovery } from "@/lib/metering/recovery/preview";
import { getRecoveryPage } from "@/lib/metering/recovery/service";
import { updateRecoveryTriage } from "@/lib/metering/recovery/triage";
import { ZodError } from "zod";

export type RecoveryActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "forbidden" | "rate_limited" | "unavailable" | "case_changed" };
async function run<T>(
  kind: string,
  write: boolean,
  work: () => Promise<T>,
): Promise<RecoveryActionResult<T>> {
  const session = await getInstanceAdminSession();
  if (!session) return { ok: false, code: "forbidden" };
  let allowed: Awaited<ReturnType<typeof consume>>;
  try {
    allowed = await consume({
      prefix: "bisibility:admin-recovery",
      bucketKey: `${session.user.id}:${kind}`,
      limit: write ? 6 : 60,
      windowSeconds: 60,
    });
  } catch {
    return { ok: false, code: "unavailable" };
  }
  if (!allowed.success) return { ok: false, code: "rate_limited" };
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    if (error instanceof RecoveryAuthorizationError) return { ok: false, code: "forbidden" };
    if (error instanceof RecoveryCaseChangedError || error instanceof ZodError)
      return { ok: false, code: "case_changed" };
    return { ok: false, code: "unavailable" };
  }
}
export async function loadRecoveryPageAction(input: unknown) {
  return run("read", false, () => getRecoveryPage(input));
}
export async function previewRecoveryAction(input: unknown) {
  return run("preview", false, () => previewRecovery(input));
}
export async function commitRecoveryAction(input: unknown) {
  return run("commit", true, () => commitRecovery(input));
}
export async function updateRecoveryTriageAction(input: unknown) {
  return run("triage", true, () => updateRecoveryTriage(input));
}
export async function getRecoveryCommandAction(commandId: string) {
  return run("status", false, () => getRecoveryCommand(commandId));
}
