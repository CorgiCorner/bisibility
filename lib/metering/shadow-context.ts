import { AsyncLocalStorage } from "node:async_hooks";
import type { createShadowEngine } from "./shadow-engine";

type Engine = ReturnType<typeof createShadowEngine> | null;
const contexts = new AsyncLocalStorage<{
  enabled: boolean;
  projects: Map<string, Promise<Engine>>;
}>();
export const shadowRequestContext = () => contexts.getStore();
export function withShadowRequest<T>(run: () => Promise<T>): Promise<T> {
  if (contexts.getStore()) return run();
  return contexts.run({ enabled: process.env.METERING_SHADOW === "on", projects: new Map() }, run);
}
