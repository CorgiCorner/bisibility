import { afterEach, expect, it, vi } from "vitest";
import { getModelProvider, registerModelProvider } from "./registry";
import type { ModelProvider } from "./types";
import { NATIVE_MODEL_PROVIDERS } from "./types";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each(NATIVE_MODEL_PROVIDERS)(
  "leaves %s unavailable without a registered adapter",
  async (id) => {
    expect(await getModelProvider(id)).toBeNull();
  },
);

it("loads only on demand and caches the registered adapter", async () => {
  const adapter: ModelProvider = {
    id: "openai",
    probe: vi.fn(),
    generate: vi.fn(),
  };
  const load = vi.fn(async () => adapter);
  const unregister = registerModelProvider("openai", load);
  try {
    expect(load).not.toHaveBeenCalled();
    expect(await getModelProvider("anthropic")).toBeNull();
    expect(await getModelProvider("openai")).toBe(adapter);
    expect(await getModelProvider("openai")).toBe(adapter);
    expect(load).toHaveBeenCalledOnce();
    expect(adapter.probe).not.toHaveBeenCalled();
    expect(adapter.generate).not.toHaveBeenCalled();
  } finally {
    unregister();
  }
  expect(await getModelProvider("openai")).toBeNull();
});

it("rejects an adapter for a different provider", async () => {
  const unregister = registerModelProvider("openai", async () => ({
    id: "anthropic",
    probe: vi.fn(),
    generate: vi.fn(),
  }));
  try {
    await expect(getModelProvider("openai")).rejects.toThrow(
      "Model provider is not available yet.",
    );
  } finally {
    unregister();
  }
});

it("discards loader errors and retains only a fixed unavailable failure", async () => {
  const canary = "fixture-loader-error-canary";
  const unregister = registerModelProvider("openai", async () => {
    throw new Error(canary);
  });
  try {
    const error = await getModelProvider("openai").catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected loader failure");
    expect(error.message).toBe("Model provider is not available yet.");
    expect(error.stack).not.toContain(canary);
    expect(error.cause).toBeUndefined();
  } finally {
    unregister();
  }
});

const adapter: ModelProvider = { id: "openai", probe: vi.fn(), generate: vi.fn() };
const unavailable = "Model provider is not available yet.";

it("detaches a default caller at 15 s while a shared 20 s load stays cached", async () => {
  vi.useFakeTimers();
  const load = vi.fn(
    () => new Promise<ModelProvider>((resolve) => setTimeout(() => resolve(adapter), 20_000)),
  );
  const unregister = registerModelProvider("openai", load);
  try {
    let settled = false;
    const first = getModelProvider("openai")
      .catch((error: Error) => error.message)
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toBe(unavailable);
    const second = getModelProvider("openai");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await second).toBe(adapter);
    expect(await getModelProvider("openai")).toBe(adapter);
    expect(load).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    unregister();
  }
});

it("shares one pending load among concurrent callers and cleans settled timers", async () => {
  vi.useFakeTimers();
  let resolveLoad: (value: ModelProvider) => void = () => {};
  const load = vi.fn(
    () =>
      new Promise<ModelProvider>((resolve) => {
        resolveLoad = resolve;
      }),
  );
  const unregister = registerModelProvider("openai", load);
  const caller = new AbortController();
  try {
    const first = getModelProvider("openai", caller.signal).catch((error: Error) => error.message);
    const second = getModelProvider("openai");
    await vi.advanceTimersByTimeAsync(0);
    caller.abort();
    expect(await first).toBe(unavailable);
    resolveLoad(adapter);
    expect(await second).toBe(adapter);
    expect(load).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    unregister();
  }
});

it("retries only a rejected load and keeps the sanitized error", async () => {
  vi.useFakeTimers();
  const load = vi
    .fn<() => Promise<ModelProvider>>()
    .mockRejectedValueOnce(new Error("fixture-loader-canary"))
    .mockResolvedValue(adapter);
  const unregister = registerModelProvider("openai", load);
  try {
    await expect(getModelProvider("openai")).rejects.toThrow(unavailable);
    expect(await getModelProvider("openai")).toBe(adapter);
    expect(load).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    unregister();
  }
});

it("evicts a never-settling load at 120 s without a caller abort evicting its retry", async () => {
  vi.useFakeTimers();
  let rejectOld: (error: Error) => void = () => {};
  const load = vi
    .fn<() => Promise<ModelProvider>>()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        }),
    )
    .mockResolvedValue(adapter);
  const unregister = registerModelProvider("openai", load);
  const caller = new AbortController();
  const unhandled = vi.fn();
  process.on("unhandledRejection", unhandled);
  try {
    let settled = false;
    const first = getModelProvider("openai", caller.signal)
      .catch((error: Error) => error.message)
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(119_999);
    expect(settled).toBe(false);
    expect(load).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toBe(unavailable);
    expect(await getModelProvider("openai")).toBe(adapter);
    caller.abort();
    rejectOld(new Error("fixture-late-rejection"));
    await vi.advanceTimersByTimeAsync(0);
    expect(await getModelProvider("openai")).toBe(adapter);
    expect(load).toHaveBeenCalledTimes(2);
    expect(unhandled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    unregister();
    process.off("unhandledRejection", unhandled);
  }
});

it("keeps a newer registration when an old caller aborts or its loader rejects", async () => {
  vi.useFakeTimers();
  let rejectOld: (error: Error) => void = () => {};
  const unregisterOld = registerModelProvider(
    "openai",
    () =>
      new Promise((_resolve, reject) => {
        rejectOld = reject;
      }),
  );
  const caller = new AbortController();
  const first = getModelProvider("openai", caller.signal).catch((error: Error) => error.message);
  await vi.advanceTimersByTimeAsync(0);
  const load = vi.fn(async () => adapter);
  const unregister = registerModelProvider("openai", load);
  try {
    expect(await getModelProvider("openai")).toBe(adapter);
    caller.abort();
    expect(await first).toBe(unavailable);
    rejectOld(new Error("fixture-old-registration"));
    await vi.advanceTimersByTimeAsync(0);
    unregisterOld();
    expect(await getModelProvider("openai")).toBe(adapter);
    expect(load).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    unregisterOld();
    unregister();
  }
});
