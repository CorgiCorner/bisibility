import { createHash } from "node:crypto";
import {
  account,
  envelope,
  httpDouble,
  now,
  payload,
} from "@/lib/provider-evidence/dataforseo/fixtures.test-support";
import { encryptSecret } from "@/lib/providers/crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { identityFixture } from "./fixture.test-support";
import { lookupRecoveryEvidence } from "./lookup";
import { classifyRecoveryPreview } from "./preview";

vi.mock("@/lib/provider-evidence/dataforseo/account", () => ({ originalRecoveryAccount: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected provider HTTP");
    }),
  );
  vi.stubEnv("PROVIDER_RECOVERY", "on");
  vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it.each(["hosted", "byok"])(
  "INV-1 INV-3 DV-1/2 %s keeps original account/version/principal after owner/key changes",
  async (payerKind) => {
    const identity = identityFixture({ payerKind });
    const double = httpDouble([envelope(40106, 0.002)]);
    const resolveAccount = vi.fn(async (binding) => {
      expect(binding).toEqual(identity);
      expect(binding.principal).toBe("original-principal");
      return account;
    });
    const transport = vi.fn((binding) => {
      expect(binding).toEqual(account);
      return double.transport;
    });
    const outcome = await lookupRecoveryEvidence(identity, "task-1", now, {
      resolveAccount,
      transport,
    });
    expect(outcome).toMatchObject({ kind: "evidence", tasks: [{ classification: "partial" }] });
    double.assertNoPaidRequests();
    expect(double.send).toHaveBeenCalledTimes(1);
  },
);
it("no lookup constructs transport when switched off or original identity/tag/version is absent", async () => {
  const transport = vi.fn();
  const resolveAccount = vi.fn(async () => ({ ...account, credentialVersion: "rotated" }));
  vi.stubEnv("PROVIDER_RECOVERY", "off");
  expect(
    await lookupRecoveryEvidence(identityFixture(), "task-1", now, { transport, resolveAccount }),
  ).toMatchObject({ kind: "inactive" });
  vi.stubEnv("PROVIDER_RECOVERY", "on");
  for (const identity of [
    null,
    identityFixture({ executionMode: "live", nativeTag: null }),
    identityFixture(),
  ]) {
    expect(
      await lookupRecoveryEvidence(identity, "task-1", now, { transport, resolveAccount }),
    ).toMatchObject({ kind: "operator_review" });
  }
  expect(transport).not.toHaveBeenCalled();
});
it("INV-1 missing-ID path exhausts free ID List and only retrieves a uniquely matched task", async () => {
  const double = httpDouble([
    {
      status_code: 20000,
      tasks: [
        {
          status_code: 20000,
          result: [
            {
              id: "task-1",
              url: "v3/serp/google/organic/task_post",
              metadata: payload,
            },
          ],
        },
      ],
    },
    envelope(),
  ]);
  expect(
    await lookupRecoveryEvidence(identityFixture(), null, now, {
      resolveAccount: async () => account,
      transport: () => double.transport,
    }),
  ).toMatchObject({ kind: "evidence" });
  double.assertNoPaidRequests();
  expect(double.send.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET"]);
});
it("RE-13 classifies the four captured classes and exclusions separately", () => {
  const row = {
    operationPk: "o",
    state: "pending",
    fenced: true,
    historical: false,
    identityComplete: true,
    measuredCost: false,
    unknownUnits: true,
    nativeProven: false,
  };
  expect(classifyRecoveryPreview(row)).toBe("current_ambiguous_submission");
  expect(classifyRecoveryPreview({ ...row, historical: true, measuredCost: true })).toBe(
    "measured_cost_import_unknown_units",
  );
  expect(classifyRecoveryPreview({ ...row, historical: true, identityComplete: false })).toBe(
    "identity_incomplete_historical_import",
  );
  expect(classifyRecoveryPreview({ ...row, nativeProven: true })).toBe("native_proven");
  expect(classifyRecoveryPreview({ ...row, fenced: false })).toBe(
    "not_eligible_unfenced_operator_only",
  );
  expect(classifyRecoveryPreview({ ...row, state: "released" })).toBe("not_eligible_released");
});
it.each([null, "live-id"])(
  "live lookup with native ID %s reads metadata only without priority or live/Task GET requests",
  async (nativeId) => {
    const { priority: _priority, ...livePayload } = payload;
    const body = JSON.stringify(livePayload);
    const { createHash } = await import("node:crypto");
    const { encryptSecret } = await import("@/lib/providers/crypto");
    const identity = identityFixture({
      executionMode: "live",
      endpointPath: "/v3/serp/google/organic/live/advanced",
      payloadEncrypted: encryptSecret(body),
      payloadHash: createHash("sha256").update(body).digest("hex"),
    });
    const double = httpDouble([
      {
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                id: "live-id",
                url: "v3/serp/google/organic/live/advanced",
                metadata: { ...livePayload, function: "live" },
                cost: 0.002,
              },
            ],
          },
        ],
      },
    ]);
    expect(
      await lookupRecoveryEvidence(identity, nativeId, now, {
        resolveAccount: async () => account,
        transport: () => double.transport,
      }),
    ).toMatchObject({
      kind: "metadata_evidence",
      resultAvailable: false,
      task: { id: "live-id", costCents: 0.2 },
    });
    expect(double.send).toHaveBeenCalledTimes(1);
    double.assertNoPaidRequests();
  },
);
it.each([{ namespace: "another-namespace" }, { instanceId: "another-instance" }])(
  "INV-3 foreign recovery scope %j cannot construct a transport",
  async (patch) => {
    const transport = vi.fn();
    const resolveAccount = vi.fn(async () => account);
    expect(
      await lookupRecoveryEvidence(identityFixture(patch), "task-1", now, {
        transport,
        resolveAccount,
      }),
    ).toMatchObject({ kind: "operator_review", reason: "foreign_recovery_scope" });
    expect(resolveAccount).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  },
);

it.each([
  [{ keyword: "changed" }],
  [{ location_code: 2616 }],
  [{ device: "mobile" }],
  [{ depth: 10 }],
  [{ stop_crawl_on_match: [] }],
  [{ priority: 1 }],
  [{ function: "task_post" }],
  [null],
])("live lookup fails closed on conflicting or duplicate ID List metadata %s", async (change) => {
  const { priority: _priority, ...livePayload } = payload;
  const identity = identityFixture({ executionMode: "live" });
  const row = {
    id: "live-id",
    url: "v3/serp/google/organic/live/advanced",
    metadata: { ...livePayload, function: "live" },
  };
  const rows =
    change === null
      ? [row, { ...row, id: "other-live-id" }]
      : [{ ...row, metadata: { ...row.metadata, ...change } }];
  const double = httpDouble([
    { status_code: 20000, tasks: [{ status_code: 20000, result: rows }] },
  ]);
  expect(
    await lookupRecoveryEvidence(identity, null, now, {
      resolveAccount: async () => account,
      transport: () => double.transport,
    }),
  ).toEqual({ kind: "operator_review", reason: change === null ? "ambiguous" : "no_match" });
  expect(double.send).toHaveBeenCalledTimes(1);
  expect(new URL(String(double.send.mock.calls[0][0])).pathname).toBe("/v3/serp/id_list");
  double.assertNoPaidRequests();
});

it("legacy null-tag live identity remains untagged_live_task before account lookup or matching", async () => {
  const { priority: _priority, ...livePayload } = payload;
  const body = JSON.stringify({ ...livePayload, tag: null });
  const identity = identityFixture({
    executionMode: "live",
    nativeTag: null,
    payloadEncrypted: encryptSecret(body),
    payloadHash: createHash("sha256").update(body).digest("hex"),
  });
  const resolveAccount = vi.fn(async () => account);
  const double = httpDouble([
    {
      status_code: 20000,
      tasks: [
        {
          status_code: 20000,
          result: [
            {
              id: "legacy-live-id",
              url: "v3/serp/google/organic/live/advanced",
              metadata: { ...livePayload, tag: null, function: "live" },
            },
          ],
        },
      ],
    },
  ]);
  const transport = vi.fn(() => double.transport);
  expect(await lookupRecoveryEvidence(identity, null, now, { resolveAccount, transport })).toEqual({
    kind: "operator_review",
    reason: "untagged_live_task",
  });
  expect(resolveAccount).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
  expect(double.send).not.toHaveBeenCalled();
  double.assertNoPaidRequests();
});
