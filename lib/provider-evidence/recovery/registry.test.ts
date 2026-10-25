import { makePublicId } from "@/lib/db/public-id";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HistoryTask, ProviderRecoveryAdapter } from "./adapter";
import { identityFixture } from "./fixture.test-support";
import { lookupRecoveryEvidence } from "./lookup";
import { lookupFailure } from "./outcomes";
import { createRecoveryAdapterRegistry, recoveryAdapters } from "./registry";

vi.mock("@/lib/provider-evidence/dataforseo/account", () => ({ originalRecoveryAccount: vi.fn() }));
const now = new Date("2026-10-23T12:00:00Z");
const task: HistoryTask = {
  id: "second-task",
  endpointPath: "/second/submit",
  tag: "second-tag",
  function: null,
  datetimePosted: null,
  datetimeDone: null,
  costCents: 2,
  metadata: {},
};
function fakeAdapter(): ProviderRecoveryAdapter {
  return {
    provider: "second",
    capability: vi.fn<ProviderRecoveryAdapter["capability"]>((scope) =>
      scope.feature === "another_feature" && scope.submittedEndpointPath === "/second/submit"
        ? {
            kind: "supported",
            capability: { idListPath: "/second/history", taskGetPath: "/second/get" },
          }
        : lookupFailure("operator_review", "free_history_not_evaluated"),
    ),
    resolveAccount: vi.fn<ProviderRecoveryAdapter["resolveAccount"]>(async () => ({
      accountId: "original",
      credentialVersion: "v1",
      token: "fixture",
    })),
    createTransport: vi.fn<ProviderRecoveryAdapter["createTransport"]>(() => ({
      listIds: vi.fn(),
      getTask: vi.fn(),
    })),
    listHistory: vi.fn<ProviderRecoveryAdapter["listHistory"]>(async function* () {
      yield {
        kind: "page",
        tasks: [task],
        nextOffset: null,
        acceptance: "unknown",
        costCents: null,
        retryable: false,
        suggestedBackoffMs: null,
      };
    }),
    getTask: vi.fn<ProviderRecoveryAdapter["getTask"]>(async () => ({
      kind: "evidence",
      topStatus: { code: 20000, message: null },
      classification: "tasks",
      tasks: [
        {
          ...task,
          status: { code: 20000, message: null },
          classification: "success",
          submittedPayload: { tag: "second-tag" },
          results: [],
          organicItems: [],
          returnedDepth: 0,
          retryable: false,
          suggestedBackoffMs: null,
        },
      ],
      acceptance: "unknown",
      costCents: null,
      retryable: false,
      suggestedBackoffMs: null,
    })),
    matchTask: vi.fn<ProviderRecoveryAdapter["matchTask"]>(() => ({ kind: "match", task })),
    retention: vi.fn<ProviderRecoveryAdapter["retention"]>(() => null),
  };
}
const identity = () =>
  identityFixture({
    provider: "second",
    feature: "another_feature",
    endpointPath: "/second/submit",
  });
beforeEach(() => {
  vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 9).toString("base64"));
  vi.stubEnv("PROVIDER_RECOVERY", "on");
});
afterEach(() => vi.unstubAllEnvs());
it("registers only the implemented provider and rejects duplicate ids", () => {
  expect(recoveryAdapters.get("dataforseo")?.provider).toBe("dataforseo");
  expect(recoveryAdapters.get("second")).toBeUndefined();
  expect(createRecoveryAdapterRegistry([]).get("dataforseo")).toBeUndefined();
  expect(() => createRecoveryAdapterRegistry([fakeAdapter(), fakeAdapter()])).toThrow("Duplicate");
});
it.each([null, "second-task"])(
  "dispatches feature, history, get and validation to a second adapter (id %s)",
  async (nativeId) => {
    const adapter = fakeAdapter();
    const result = await lookupRecoveryEvidence(identity(), nativeId, now, {
      adapters: createRecoveryAdapterRegistry([adapter]),
    });
    expect(result).toMatchObject({ kind: "evidence", proofSource: { knownId: !!nativeId } });
    expect(adapter.capability).toHaveBeenCalledWith({
      provider: "second",
      feature: "another_feature",
      submittedEndpointPath: "/second/submit",
    });
    expect(adapter.resolveAccount).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "second", feature: "another_feature" }),
    );
    expect(adapter.getTask).toHaveBeenCalledOnce();
    expect(adapter.matchTask).toHaveBeenCalled();
    expect(adapter.listHistory).toHaveBeenCalledTimes(nativeId ? 0 : 1);
  },
);
it.each([{ provider: "unknown" }, { feature: "unsupported" }, { endpointPath: "/unsupported" }])(
  "unsupported scope %j is operator only before credentials",
  async (patch) => {
    const adapter = fakeAdapter();
    expect(
      await lookupRecoveryEvidence({ ...identity(), ...patch }, "id", now, {
        adapters: createRecoveryAdapterRegistry([adapter]),
      }),
    ).toEqual({ kind: "operator_review", reason: "adapter_not_opted_in" });
    expect(adapter.resolveAccount).not.toHaveBeenCalled();
    expect(adapter.createTransport).not.toHaveBeenCalled();
  },
);
it.each([undefined, "off"])("global lookup gate %s precedes adapter access", async (flag) => {
  vi.stubEnv("PROVIDER_RECOVERY", flag);
  const get = vi.fn();
  expect(await lookupRecoveryEvidence(identity(), "id", now, { adapters: { get } })).toMatchObject({
    kind: "inactive",
  });
  expect(get).not.toHaveBeenCalled();
});
it("demo denies registered adapters even with global switches enabled", async () => {
  vi.stubEnv("DEMO_USER_ID", makePublicId("usr"));
  vi.stubEnv("DEMO_PROJECT_ID", makePublicId("prj"));
  vi.stubEnv("READ_ONLY_DEMO", "1");
  const get = vi.fn();
  expect(await lookupRecoveryEvidence(identity(), "id", now, { adapters: { get } })).toMatchObject({
    kind: "inactive",
  });
  expect(get).not.toHaveBeenCalled();
});
