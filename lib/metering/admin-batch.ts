/** Bound independent Meter reads while preserving their input order. */
export async function mapAdminQueries<Input, Output>(
  inputs: readonly Input[],
  read: (input: Input) => Promise<Output>,
  concurrency: 1 | 4 = 4,
): Promise<Output[]> {
  const output: Output[] = [];
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const worker = async () => {
    while (!failed) {
      const index = next++;
      if (index >= inputs.length) return;
      try {
        output[index] = await read(inputs[index] as Input);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
  if (failed) throw firstError;
  return output;
}

/** Log only safe classification, never database messages, SQL or request content. */
export function logBudgetReadFailure(error: unknown, phase: string) {
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^P\d{4}$/.test(error.code)
      ? error.code
      : undefined;
  const log = code === "P2028" || code === "P2024" ? console.warn : console.error;
  const locations =
    error instanceof TypeError
      ? (error.stack ?? "")
          .split("\n")
          .filter((line) => /^\s+at\s/.test(line))
          .flatMap(
            (line) =>
              line.match(/(?:lib\/metering|lib\/private-adapters|@usagekit)\/[\w./-]+:\d+:\d+/g) ??
              [],
          )
          .slice(0, 5)
      : [];
  log("[metering] project usage unavailable", {
    phase,
    name: error instanceof Error ? error.name : "UnknownError",
    code,
    ...(locations.length ? { locations } : {}),
  });
}
