import { readFileSync } from "node:fs";
import { join } from "node:path";

export function slug(value) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

export function operationReferenceIndex(openapi) {
  const entries = new Map();
  for (const [httpPath, pathItem] of Object.entries(openapi.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!operation || typeof operation !== "object" || !operation.operationId) continue;
      if (entries.has(operation.operationId)) {
        throw new Error(`OpenAPI repeats operationId ${operation.operationId}`);
      }
      const tag = operation.tags?.[0] ?? "api";
      const summary = operation.summary ?? "";
      entries.set(operation.operationId, {
        href: `/api-reference/${slug(tag)}/${slug(summary)}`,
        method: method.toUpperCase(),
        operationId: operation.operationId,
        path: httpPath,
        summary,
      });
    }
  }
  return entries;
}

export function loadOperationReferenceIndex(root) {
  const openapi = JSON.parse(readFileSync(join(root, "docs/openapi.snapshot.json"), "utf8"));
  return operationReferenceIndex(openapi);
}
