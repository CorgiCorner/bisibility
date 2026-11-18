import { lockResourceOwners } from "@/lib/capacity/resource-lock";
import * as dispatch from "@/lib/provider-usage/model-dispatch";
import { afterEach, expect, test, vi } from "vitest";
import { paymentSqlClient } from "./admission.postgres.test-support";
import { readModelAttempts } from "./admission-storage";
import { executeModelPlayground } from "./execute";
import { launchModelPlayground } from "./launch";
import { launchHarness, launchRequest } from "./launch.test-support";
import { previewModelPlayground } from "./preview";
import * as stores from "./store";

const h = launchHarness();
const resolveFixture = vi.mocked(h.runtime.resolve).getMockImplementation();
if (!resolveFixture) throw new Error("Missing fixture resolver");
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(h.runtime.resolve).mockImplementation(resolveFixture);
});
const preview = () => previewModelPlayground(h.runtime, { revision: "revision", input: h.input });

test("a concurrent duplicate's store outage leaves the first executor free to dispatch", async () => {
  const q = await preview();
  let release!: () => void, entered!: () => void;
  const paused = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const continueA = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = stores.createModelPlaygroundStore;
  let launches = 0;
  vi.spyOn(stores, "createModelPlaygroundStore").mockImplementation((db) => {
    const store = original(db);
    return {
      ...store,
      launch: async (value) => {
        if (++launches === 1) {
          entered();
          await continueA;
        } else throw new Error("Synthetic sibling pool failure");
        return store.launch(value);
      },
    };
  });
  const a = launchModelPlayground(h.runtime, launchRequest(q));
  try {
    await Promise.race([
      paused,
      a.then((out) => {
        throw new Error(`First launch exited before pause: ${out.kind}`);
      }),
    ]);
    expect((await launchModelPlayground(h.runtime, launchRequest(q))).kind).toBe("uncertain");
    expect(launches).toBe(2);
    const [attempt] = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
    expect(attempt).toMatchObject({
      state: "admitted",
      dispatched: false,
      reservationState: "reserved",
    });
  } finally {
    release();
    await a;
  }
  expect((await a).kind).toBe("admitted");
  expect(h.calls).toHaveLength(1);
});

test.skipIf(!process.env.MODEL_LAUNCH_TEST_DATABASE_URL)(
  "real owner lock timeout rolls back and retries the same admitted attempt",
  async () => {
    const q = await preview();
    const run = await h.admitOnly(q);
    const attempts = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
    let release!: () => void, locked!: () => void;
    const acquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const unlock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = h.sql.transaction(async (tx) => {
      await lockResourceOwners(paymentSqlClient(tx), [h.context.principal]);
      locked();
      await unlock;
    });
    await acquired;
    const transaction = h.runtime.db.$transaction.bind(h.runtime.db);
    let timeouts = 0,
      waits = 0;
    vi.spyOn(h.runtime.db, "$transaction").mockImplementation((work) =>
      transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout='25ms'");
        try {
          return await work(tx);
        } catch (error) {
          if ((error as { code?: string }).code === "55P03") timeouts++;
          throw error;
        }
      }),
    );
    const mark = vi.spyOn(dispatch, "beforeModelDispatch");
    h.runtime.wait = async () => {
      waits++;
      const [attempt] = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
      expect(attempt).toMatchObject({
        state: "admitted",
        dispatched: false,
        reservationState: "reserved",
      });
      expect(h.calls).toHaveLength(0);
      release();
      await holder;
    };
    try {
      expect(
        (
          await executeModelPlayground(h.runtime, {
            projectId: h.context.projectId,
            runId: run.id,
            attempts,
          })
        )[0].state,
      ).toBe("finished");
      expect(waits).toBe(1);
      expect(timeouts).toBe(1);
      expect(mark).toHaveBeenCalledTimes(2);
      expect(h.calls).toHaveLength(1);
    } finally {
      release();
      await holder;
    }
  },
);
