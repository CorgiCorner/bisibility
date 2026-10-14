import { contentKey } from "./key";
import { executionTargetKey, operationKey } from "./target-key";
import type { ExecutionTargetV1, OperationScope } from "./types";

/** Root claims the scan once; each selected target has a deterministic child submission identity. */
export function targetOperationScope(
  scan: OperationScope,
  target: ExecutionTargetV1,
): OperationScope {
  if (scan.projectId !== target.projectId) throw new Error("Scan and target project mismatch");
  return Object.freeze({
    ...scan,
    idempotencyKey: contentKey("local-scan-target-idempotency-v1", [
      operationKey(scan),
      executionTargetKey(target),
    ]),
  });
}
