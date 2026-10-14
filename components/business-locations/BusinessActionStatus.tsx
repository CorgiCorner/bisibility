import type { BusinessCommandResult, BusinessTranslator } from "./contracts";

export function BusinessActionStatus({
  result,
  pending,
  translate: t,
}: {
  result: BusinessCommandResult<unknown> | null;
  pending: boolean;
  translate: BusinessTranslator;
}) {
  const key = pending
    ? "saving"
    : result?.kind === "saved"
      ? "saved"
      : result?.kind === "identifier_claimed"
        ? "identifierClaimed"
        : result?.kind === "identity_error"
          ? result.reason === "maps_identifier_conflict"
            ? "mapsIdentifierConflict"
            : "invalidMapsIdentifier"
          : result?.kind === "conflict"
            ? result.reason === "idempotency_conflict"
              ? "idempotencyConflict"
              : "conflict"
            : result?.kind === "error"
              ? "saveError"
              : null;
  return (
    <p role="status" aria-live="polite" className="mt-3 text-sm text-fg-muted">
      {key ? t(key) : ""}
    </p>
  );
}
