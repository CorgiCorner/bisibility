export function frozenWeights(targets: readonly { id: string; volume: number | null }[]) {
  if (targets.some(({ volume }) => volume !== null && (!Number.isFinite(volume) || volume < 0))) {
    throw new Error("Measurement weights must be finite and nonnegative or unknown.");
  }
  const known = targets
    .flatMap(({ volume }) =>
      volume !== null && Number.isFinite(volume) && volume >= 0 ? [volume] : [],
    )
    .sort((a, b) => a - b);
  const middle = Math.floor(known.length / 2);
  const fallback = known.length
    ? known.length % 2
      ? known[middle]
      : known[middle - 1] + (known[middle] - known[middle - 1]) / 2
    : 1;
  const weights = new Map<string, number>();
  const imputed = new Set<string>();
  for (const { id, volume } of targets) {
    const valid = volume !== null && Number.isFinite(volume) && volume >= 0;
    weights.set(id, valid ? volume : fallback);
    if (!valid) imputed.add(id);
  }
  return { weights, imputed };
}
