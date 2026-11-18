import type { ModelPlaygroundRuntime } from "./runtime-contract";

/** Shared by request, receipt recovery and worker runtimes. */
export const modelPlaygroundRuntimeBindings: Pick<
  ModelPlaygroundRuntime,
  "onTerminal" | "valuation"
> = {};
