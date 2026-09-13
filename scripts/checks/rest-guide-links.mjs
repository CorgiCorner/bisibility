import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { operationReferenceIndex } from "./api-reference-paths.mjs";
import { restGuideOperations } from "./rest-guide-operations.mjs";

export function checkRestGuideOperations({
  docsRoot,
  openapi,
  guides = restGuideOperations,
}) {
  const failures = [];
  const references = operationReferenceIndex(openapi);
  const declaredOperationIds = new Set(Object.values(guides).flat());

  for (const operationId of declaredOperationIds) {
    if (!references.has(operationId)) {
      failures.push(`REST guide map references unknown operation ${operationId}`);
    }
  }

  for (const [guide, operationIds] of Object.entries(guides)) {
    const guidePath = join(docsRoot, guide);
    if (!existsSync(guidePath)) {
      failures.push(`REST resource guide is missing: ${guide}`);
      continue;
    }
    const guideText = readFileSync(guidePath, "utf8");
    if (!guideText.includes("## Related operations")) {
      failures.push(`${guide} must include a Related operations section`);
    }
    for (const operationId of operationIds) {
      const reference = references.get(operationId);
      if (!guideText.includes(`\`${operationId}\``)) {
        failures.push(`${guide} must declare related operation ${operationId}`);
      }
      if (reference && !guideText.includes(`](${reference.href})`)) {
        failures.push(`${guide} must link ${operationId} to ${reference.href}`);
      }
    }
  }

  return failures;
}
