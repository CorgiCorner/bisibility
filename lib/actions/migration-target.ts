import { type ActionResult, actionFailureResult } from "@/lib/actions/action-result";
import { resolveMigrationTargetOrigin } from "@/lib/migration/target-origin";

export function resolveMigrationTargetActionResult(raw: string | undefined): ActionResult<string> {
  const target = resolveMigrationTargetOrigin(raw);
  if (!target.ok) {
    return actionFailureResult({
      code: "invalid_migration_target",
      message: target.reason,
      status: 400,
    });
  }
  return { ok: true, value: target.origin };
}
