import "server-only";

export function modelOwnKeyValuation(
  _column: import("@/lib/model-playground/types").ModelColumn,
  _input: import("@/lib/model-playground/types").ModelPlaygroundInput,
): ReturnType<
  NonNullable<import("@/lib/model-playground/runtime-contract").ModelPlaygroundRuntime["valuation"]>
> | null {
  return null;
}
