/** Bound independent Meter reads while preserving their input order. */
export async function mapAdminQueries<Input, Output>(
  inputs: readonly Input[],
  read: (input: Input) => Promise<Output>,
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
  await Promise.all(Array.from({ length: Math.min(4, inputs.length) }, worker));
  if (failed) throw firstError;
  return output;
}
