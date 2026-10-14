import type { RecoveryCommandResult } from "@/lib/metering/recovery/contract";
import { recoveryViewFixture } from "@/lib/metering/recovery/view-fixture";

let command: RecoveryCommandResult | null = null;
export async function loadRecoveryPageAction(_input: unknown) {
  return { ok: true as const, value: recoveryViewFixture() };
}
export async function previewRecoveryAction(input: { caseTokens: string[] }) {
  const rows = recoveryViewFixture().rows.filter((row) => input.caseTokens.includes(row.token));
  const eligible = rows.flatMap((row) =>
    row.action ? [{ caseToken: row.token, action: row.action }] : [],
  );
  return {
    ok: true as const,
    value: {
      token: "storybook-preview",
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      eligible,
      excluded: [],
      newPaidAttempts: 0 as const,
      providerCalls: 0 as const,
      originalRuns: eligible.filter((row) => row.action === "resume_queued_run").length,
      originalExposure: rows.flatMap((row) =>
        row.action === "resume_queued_run" && row.originalAuthorization
          ? [
              {
                caseToken: row.token,
                project: row.project,
                funding: row.funding,
                ...row.originalAuthorization,
              },
            ]
          : [],
      ),
    },
  };
}
export async function commitRecoveryAction(input: { commandId: string }) {
  command = {
    commandId: input.commandId,
    state: "completed",
    outcomes: [{ caseToken: "case-result", status: "recovered", code: null }],
  };
  return { ok: true as const, value: command };
}
export async function getRecoveryCommandAction(commandId: string) {
  return {
    ok: true as const,
    value: command ?? { commandId, state: "queued" as const, outcomes: [] },
  };
}
export async function updateRecoveryTriageAction(_input: unknown) {
  return { ok: true as const, value: { status: "acknowledged" } };
}
