import { NATIVE_MODEL_PROVIDERS } from "./types";

/** Model usage is provider-billed and cannot use legacy per-check estimates. */
export function assertNoModelManualRate(providerId: string) {
  if (NATIVE_MODEL_PROVIDERS.some((id) => id === providerId)) {
    throw new Error("Model providers do not support manual costs or legacy rates.");
  }
}
