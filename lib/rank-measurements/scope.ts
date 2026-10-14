import type { MeasurementScope } from "./types";

export function scopeKey(scope: MeasurementScope | null) {
  if (!scope) return null;
  const fields = [
    scope.projectId,
    scope.targetId,
    scope.engine,
    scope.surface,
    scope.resultKind,
    scope.rankScale,
    scope.location,
    scope.language,
    scope.device,
  ];
  if (fields.some((field) => !field)) return null;
  return JSON.stringify([
    ...fields,
    scope.targetRevision,
    scope.policyRevision ?? null,
    scope.identityRevision ?? null,
  ]);
}

export function comparableScopeKey(scope: MeasurementScope | null) {
  return scope?.targetRevision ? scopeKey(scope) : null;
}
