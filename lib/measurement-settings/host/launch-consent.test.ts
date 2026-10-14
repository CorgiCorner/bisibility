import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settingsActorScope, settingsHash } from "./hash";
import { launchMeasurementSettingsHost } from "./launch";
import { signSettingsQuote } from "./quote-binding";
import { consumeManualConsent } from "./reviewed-consent";

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  manual: vi.fn(),
  launch: vi.fn(),
  replay: vi.fn(),
  scope: vi.fn(),
  actor: vi.fn(),
  snapshot: vi.fn(),
  tx: {
    project: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    rankCheckRun: { findUnique: vi.fn() },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-manual-consent-key-012345")],
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: async (body: (tx: typeof mocks.tx) => unknown) => body(mocks.tx) },
}));
vi.mock("@/lib/measurement-definitions/access", () => ({
  definitionProjectScope: mocks.scope,
  assertDefinitionActor: mocks.actor,
}));
vi.mock("@/lib/rank-check/runs/launch", () => ({ launchRankCheckRun: mocks.launch }));
vi.mock("@/lib/rank-check/runs/launch-idempotency", () => ({
  apiIdempotencyKey: (key: string) => `api:${key}`,
  findIdempotentRun: mocks.replay,
}));
vi.mock("./source", () => ({ loadSettingsSource: mocks.source }));
vi.mock("./manual", () => ({ settingsManualEvidence: mocks.manual }));
vi.mock("./preview", () => ({ assertSettingsSnapshot: mocks.snapshot }));
vi.mock("./selection", () => ({
  assertSettingsSelection: vi.fn(),
  settingsManualSpec: () => ({ kind: "all", v: 1 }),
}));
const projectId = "prj_abcdefghijklmnopqrstuvwx" as const,
  actorId = "trusted-actor",
  now = new Date("2026-10-13T12:00:00.000Z");
const intent = {
  providerId: "dataforseo",
  capabilityVersion: "synthetic-capability-v1",
  surface: "web_serp" as const,
  geoId: "US",
  languageCode: "en",
  device: "desktop" as const,
  depth: 20 as const,
};
const source = { project: { id: "project" }, sourceHash: "a".repeat(64) };
const manual = {
  targetIds: ["kw_abcdefghijklmnopqrstuvwx"],
  estimates: [
    {
      providerId: "dataforseo",
      unit: "cents",
      quantity: "1.0000",
      unknownTargets: 0,
      certainty: "estimate",
    },
  ],
};
function command() {
  const binding = {
    projectId: "project",
    actorId,
    providerId: intent.providerId,
    depth: intent.depth,
    selection: { selection: intent, scheduleId: null },
    source: { sourceHash: source.sourceHash, manual, nativeToken: "synthetic-native-quote" },
  };
  return {
    projectId,
    spec: { kind: "all" as const, v: 1 as const },
    expectedRevision: 1,
    expectedSourceHash: source.sourceHash,
    scheduleId: null,
    intent,
    capabilityVersion: intent.capabilityVersion,
    confirmed: true as const,
    idempotencyKey: "synthetic-manual-key",
    previewToken: "synthetic-native-quote",
    measurementToken: signSettingsQuote("manual", binding, now).token,
    depth: intent.depth,
    providerId: intent.providerId,
  };
}
describe("actual manual host composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.scope.mockResolvedValue({ id: "project" });
    mocks.actor.mockResolvedValue(undefined);
    mocks.source.mockResolvedValue(source);
    mocks.manual.mockResolvedValue(manual);
    mocks.replay.mockResolvedValue(null);
    mocks.tx.project.findUniqueOrThrow.mockResolvedValue({
      id: "project",
      publicId: projectId,
      domain: "example.test",
      isSample: false,
    });
    mocks.tx.project.findUnique.mockResolvedValue({ writeMode: "active", isSample: false });
    mocks.launch.mockImplementation(async (_input, host) => {
      await host.assertActor(mocks.tx);
      return consumeManualConsent(await host.assertAdmission(mocks.tx), "project", actorId);
    });
  });
  afterEach(() => vi.useRealTimers());
  it("returns MAC-verified current actor/source consent through canonical admission", async () => {
    const result = await launchMeasurementSettingsHost({ actor: { id: actorId } }, command());
    expect(result).toMatchObject({
      purpose: "manual",
      outcome: "measurement_queued",
      confirmed: true,
      sourceDigest: source.sourceHash,
      reviewedTargetCount: 1,
      nativeEstimates: [{ quantity: "1.0000" }],
    });
    expect(mocks.snapshot).toHaveBeenCalledTimes(2);
    expect(mocks.actor).toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("synthetic-native-quote");
  });
  it("refuses changed native proof and current read-only project before providing consent", async () => {
    const request = command();
    mocks.manual.mockResolvedValue({ ...manual, targetIds: ["kw_bcdefghijklmnopqrstuvwxy"] });
    await expect(
      launchMeasurementSettingsHost({ actor: { id: actorId } }, request),
    ).rejects.toThrow();
    mocks.manual.mockResolvedValue(manual);
    mocks.tx.project.findUnique.mockResolvedValue({ writeMode: "read_only", isSample: false });
    await expect(
      launchMeasurementSettingsHost({ actor: { id: actorId } }, request),
    ).rejects.toThrow();
  });
  it("reuses original committed run before rebuilding quote while rechecking current access", async () => {
    const request = command(),
      { idempotencyKey: _key, ...body } = request;
    const existing = { publicId: "rcr_abcdefghijklmnopqrstuvwx", status: "queued" };
    mocks.replay.mockResolvedValue(existing);
    mocks.tx.rankCheckRun.findUnique.mockResolvedValue({
      projectId: "project",
      requestedById: actorId,
      selectionSpec: {
        measurementSettingsIntent: {
          actorScopeHash: settingsActorScope("project", actorId),
          bodyHash: settingsHash("manual-body", body),
        },
      },
    });
    expect(await launchMeasurementSettingsHost({ actor: { id: actorId } }, request)).toEqual(
      existing,
    );
    expect(mocks.scope).toHaveBeenCalled();
    expect(mocks.manual).not.toHaveBeenCalled();
    expect(mocks.launch).not.toHaveBeenCalled();
    mocks.scope.mockRejectedValueOnce(new Error("fresh_actor_revoked"));
    await expect(
      launchMeasurementSettingsHost({ actor: { id: actorId } }, request),
    ).rejects.toThrow("fresh_actor_revoked");
  });
});
