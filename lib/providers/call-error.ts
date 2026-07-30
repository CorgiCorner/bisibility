export class ProviderCallError extends Error {
  constructor(
    message: string,
    readonly costCents: number | null = null,
  ) {
    super(message);
    this.name = "ProviderCallError";
  }
}

export function chargedProviderCostCents(error: unknown): number | null {
  if (!(error instanceof ProviderCallError)) return null;
  return error.costCents != null && Number.isFinite(error.costCents) && error.costCents > 0
    ? error.costCents
    : null;
}
