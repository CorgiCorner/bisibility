export async function mapWithConcurrency<Input, Output>(
  values: readonly Input[],
  concurrency: number,
  work: (value: Input, index: number) => Promise<Output>,
): Promise<PromiseSettledResult<Output>[]> {
  const results: PromiseSettledResult<Output>[] = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value === undefined) continue;
      try {
        results[index] = { status: "fulfilled", value: await work(value, index) };
      } catch (reason) {
        results[index] = { reason, status: "rejected" };
      }
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
