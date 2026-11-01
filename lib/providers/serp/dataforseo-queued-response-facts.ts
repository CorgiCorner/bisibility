export function queuedResponseCostCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Number((value * 100).toFixed(4));
}

export function queuedAccountFailureCodes(codes: readonly (number | undefined)[]) {
  return [
    ...new Set(
      codes.filter(
        (code): code is number => code !== undefined && [40104, 40200, 40201, 40210].includes(code),
      ),
    ),
  ];
}
