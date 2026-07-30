import { setTimeout as defaultDelay } from "node:timers/promises";

function convergenceOptions(options: {
  intervalMs?: number;
  maxAttempts?: number;
  stableSamples?: number;
}) {
  const intervalMs = options.intervalMs ?? 1_000;
  const maxAttempts = options.maxAttempts ?? 31;
  const stableSamples = options.stableSamples ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("maxAttempts must be a positive integer.");
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 0) {
    throw new Error("intervalMs must be a non-negative integer.");
  }
  if (!Number.isInteger(stableSamples) || stableSamples < 2) {
    throw new Error("stableSamples must be an integer of at least 2.");
  }
  return { intervalMs, maxAttempts, stableSamples };
}

export async function waitForStableSchedulerCount(options: {
  delay?: (milliseconds: number) => Promise<unknown>;
  intervalMs?: number;
  maxAttempts?: number;
  read: () => Promise<number>;
  stableSamples?: number;
}) {
  const { intervalMs, maxAttempts, stableSamples } = convergenceOptions(options);
  const delay = options.delay ?? defaultDelay;
  const samples: number[] = [];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const count = await options.read();
    samples.push(count);
    const tail = samples.slice(-stableSamples);
    if (tail.length === stableSamples && tail.every((sample) => sample === count)) {
      return { converged: true, count, samples, stable: true };
    }
    if (attempt + 1 < maxAttempts && intervalMs > 0) await delay(intervalMs);
  }
  const count = samples.at(-1) ?? 0;
  const tail = samples.slice(-stableSamples);
  return {
    converged: false,
    count,
    samples,
    stable: tail.length === stableSamples && tail.every((sample) => sample === count),
  };
}

export async function waitForExactSchedulerCount(options: {
  delay?: (milliseconds: number) => Promise<unknown>;
  expected: number;
  intervalMs?: number;
  maxAttempts?: number;
  read: () => Promise<number>;
  stableSamples?: number;
}) {
  const { intervalMs, maxAttempts, stableSamples } = convergenceOptions(options);
  const delay = options.delay ?? defaultDelay;
  const samples: number[] = [];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const count = await options.read();
    samples.push(count);
    const exactTail = samples.slice(-stableSamples);
    if (
      exactTail.length === stableSamples &&
      exactTail.every((sample) => sample === options.expected)
    ) {
      return { converged: true, count, samples, stable: true };
    }
    if (attempt + 1 < maxAttempts && intervalMs > 0) await delay(intervalMs);
  }
  const tail = samples.slice(-stableSamples);
  return {
    converged: false,
    count: samples.at(-1) ?? 0,
    samples,
    stable: tail.length === stableSamples && tail.every((count) => count === tail[0]),
  };
}
