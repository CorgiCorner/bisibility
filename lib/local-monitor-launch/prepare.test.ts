import { prisma } from "@/lib/db/prisma";
import type { LocalSubmitCollectAdapter } from "@/lib/local-monitoring/execution-types";
import type { LocalHostPorts, LocalRunBinding } from "@/lib/local-monitoring-store/context";
import { prepareLocalMeasurementRun } from "@/lib/local-monitoring-store/prepare-run";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { command, now } from "./launch.test-fixture";

const f = vi.hoisted(() => ({ admit: vi.fn(), journal: vi.fn(), submit: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/local-monitoring-store/run-admission", () => ({
  admitLocalMeasurementRun: f.admit,
}));
vi.mock("@/lib/local-monitoring-store/prepared-journal", () => ({
  preparedLocalJournal: f.journal,
}));
vi.mock("@/lib/local-monitoring-store/prepared-submit", () => ({
  submitPreparedLocalItem: f.submit,
}));
vi.mock("@/lib/local-monitoring-store/operation-store", () => ({
  localOperationStore: () => ({}),
}));
function adapter(): LocalSubmitCollectAdapter {
  return {
    capability: {
      version: "cap",
      provider: "provider",
      adapterVersion: "adapter",
      expiresAt: command.quote.expiresAt,
      nativeBillingUnit: "USD",
      implementations: [],
    },
    providerPriceVersion: "price",
    buildRequest: () => ({ method: "POST", url: "https://example.invalid" }),
    assertPreparedQuote: async () => {},
    assertRetrieval: async () => {},
    submit: async () => {
      throw new Error("No real submit");
    },
    collect: async () => {
      throw new Error("No real collect");
    },
  };
}
function ports(): LocalHostPorts {
  return {
    adapter: adapter(),
    clock: () => now,
    policy: {
      capture: async () => ({ keywordRevision: "1", policyRevision: "revision" }),
      assertCurrent: async () => {},
    },
    activation: {
      assertRegistered: async () => {},
      assertPreparedTaskset: async () => {},
      verifyConsent: async () => [],
    },
  };
}
const input = {
  projectId: command.projectId,
  connectionId: command.connectionId,
  targetIds: command.targetIds,
  idempotencyKey: command.idempotencyKey,
  quote: command.quote,
  source: "app",
  trigger: "manual",
};
const binding: LocalRunBinding = { verify: vi.fn(), replay: vi.fn(), created: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  f.admit.mockResolvedValue({
    fresh: true,
    run: { publicId: "run", id: "db-run", projectId: "db-project" },
    prepared: [
      { key: "a", record: { targetKey: "a" }, grant: {}, workerToken: "wa" },
      { key: "b", record: { targetKey: "b" }, grant: {}, workerToken: "wb" },
    ],
  });
});
describe("per-item paid permits and monitor guards", () => {
  it("forwards the same guard to admission and every journal; consumes distinct permits once", async () => {
    const bound = [adapter(), adapter()];
    let index = 0;
    const prepared = await prepareLocalMeasurementRun(
      input,
      { actor: { id: "actor" } },
      ports(),
      prisma,
      { binding, adapterForItem: () => bound[index++] },
    );
    expect(f.admit.mock.calls[0][4]).toBe(binding);
    expect(f.journal.mock.calls.map(([arg]) => arg.binding)).toEqual([binding, binding]);
    await prepared.submitters[0].submit();
    await expect(prepared.submitters[0].submit()).rejects.toThrow("consumed");
    await prepared.submitters[1].submit();
    expect(f.submit.mock.calls.map(([arg]) => arg.adapter)).toEqual(bound);
  });
  it("does not bind or dispatch new adapters for a retained admission", async () => {
    f.admit.mockResolvedValue({ fresh: false, run: { publicId: "run" }, prepared: [] });
    const binder = vi.fn(() => adapter());
    expect(
      await prepareLocalMeasurementRun(input, { actor: { id: "actor" } }, ports(), prisma, {
        binding,
        adapterForItem: binder,
      }),
    ).toEqual({ id: "run", fresh: false, submitters: [] });
    expect(binder).not.toHaveBeenCalled();
    expect(f.journal).not.toHaveBeenCalled();
    expect(f.submit).not.toHaveBeenCalled();
  });
  it("rejects accidental reuse of a bound adapter before any dispatch", async () => {
    const same = adapter();
    await expect(
      prepareLocalMeasurementRun(input, { actor: { id: "actor" } }, ports(), prisma, {
        binding,
        adapterForItem: () => same,
      }),
    ).rejects.toThrow("Per-item adapter");
    expect(f.submit).not.toHaveBeenCalled();
  });
  it("rejects a different price or capability before dispatch", async () => {
    const changed = { ...adapter(), providerPriceVersion: "changed" };
    await expect(
      prepareLocalMeasurementRun(input, { actor: { id: "actor" } }, ports(), prisma, {
        binding,
        adapterForItem: () => changed,
      }),
    ).rejects.toThrow("Per-item adapter");
    expect(f.submit).not.toHaveBeenCalled();
  });
});
