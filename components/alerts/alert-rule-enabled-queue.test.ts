import { describe, expect, it } from "vitest";
import { SerializedToggleQueue } from "./alert-rule-enabled-queue";

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("SerializedToggleQueue", () => {
  it("serializes rapid intents and keeps the newest confirmed value", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const saves: boolean[] = [];
    const states: boolean[] = [];
    const queue = new SerializedToggleQueue(true, {
      onPending: () => undefined,
      onState: (value) => states.push(value),
      save: (value) => {
        saves.push(value);
        return saves.length === 1 ? first.promise : second.promise;
      },
    });

    queue.request(false);
    queue.request(true);
    expect(saves).toEqual([false]);

    first.resolve();
    await settle();
    expect(saves).toEqual([false, true]);

    second.resolve();
    await settle();
    expect(states.at(-1)).toBe(true);
  });

  it("restores the last confirmed value and drops stale queued intent after a failure", async () => {
    const first = deferred<void>();
    const saves: boolean[] = [];
    const states: boolean[] = [];
    const errors: string[] = [];
    const queue = new SerializedToggleQueue(true, {
      onError: () => errors.push("failed"),
      onPending: () => undefined,
      onState: (value) => states.push(value),
      save: (value) => {
        saves.push(value);
        return first.promise;
      },
    });

    queue.request(false);
    queue.request(true);
    first.reject(new Error("save failed"));
    await settle();

    expect(saves).toEqual([false]);
    expect(states.at(-1)).toBe(true);
    expect(errors).toEqual(["failed"]);
  });

  it("clears a previous error when a retry succeeds", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    let error: string | null = null;
    const queue = new SerializedToggleQueue(true, {
      onError: () => {
        error = "Could not update this rule. Try again.";
      },
      onPending: () => undefined,
      onRequest: () => {
        error = null;
      },
      onState: () => undefined,
      save: (value) => (value ? second.promise : first.promise),
    });

    queue.request(false);
    first.reject(new Error("save failed"));
    await settle();
    expect(error).toBe("Could not update this rule. Try again.");

    queue.request(true);
    expect(error).toBeNull();
    second.resolve();
    await settle();

    expect(error).toBeNull();
  });
});
