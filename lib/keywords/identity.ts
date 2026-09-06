export type KeywordIdentityField = "device" | "locationId" | "text";

type KeywordIdentity = Record<KeywordIdentityField, string>;
type KeywordIdentityUpdate = Partial<Record<KeywordIdentityField, string | undefined>>;

const immutableIdentityMessage =
  "A different term, market, or device is a different keyword. Add or restore it as its own row and archive the old keyword.";

export class KeywordIdentityImmutableError extends Error {
  readonly code = "conflict";
  readonly status = 409;

  constructor(
    readonly field: KeywordIdentityField,
    readonly storedValue: string,
    readonly attemptedValue: string,
  ) {
    super(immutableIdentityMessage);
    this.name = "KeywordIdentityImmutableError";
  }
}

export function assertKeywordIdentityUnchanged(
  current: KeywordIdentity,
  next: KeywordIdentityUpdate,
) {
  for (const field of ["text", "locationId", "device"] as const) {
    const attemptedValue = next[field];
    if (attemptedValue !== undefined && attemptedValue !== current[field]) {
      throw new KeywordIdentityImmutableError(field, current[field], attemptedValue);
    }
  }
}
