import { setTimeout as defaultDelay } from "node:timers/promises";

export type LegacyVisibilityEvidence = {
  complete: boolean;
  count: number;
  samples: number;
};

export async function collectStableLegacyVisibility(options: {
  delay?: (milliseconds: number) => Promise<unknown>;
  intervalMs: number;
  sample: () => Promise<number>;
  stableSamples: number;
  timeoutMs: number;
}): Promise<LegacyVisibilityEvidence> {
  if (options.stableSamples < 2) throw new Error("stableSamples must be at least 2.");
  if (options.intervalMs < 1 || options.timeoutMs < options.intervalMs) {
    throw new Error("Legacy visibility timing bounds are invalid.");
  }
  const delay = options.delay ?? defaultDelay;
  const maxSamples = Math.floor(options.timeoutMs / options.intervalMs) + 1;
  let count = 0;
  let consecutive = 0;
  let previous: number | null = null;

  for (let samples = 1; samples <= maxSamples; samples += 1) {
    count = await options.sample();
    consecutive = count === previous ? consecutive + 1 : 1;
    previous = count;
    if (consecutive >= options.stableSamples) {
      return { complete: true, count, samples };
    }
    if (samples < maxSamples) await delay(options.intervalMs);
  }

  return { complete: false, count, samples: maxSamples };
}
