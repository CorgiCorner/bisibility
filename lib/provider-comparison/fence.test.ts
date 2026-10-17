import { dataForSeoRankRequest } from "@/lib/providers/serp/dataforseo-rank-request";
import { beforeEach, expect, it, vi } from "vitest";
import { comparisonFences } from "./fence";
import { comparisonFixture } from "./fixtures.test-support";
import { comparisonRankInput } from "./request";

vi.mock("./access", () => ({ assertComparisonAccess: vi.fn() }));
vi.mock("@/lib/provider-usage/credential-version", () => ({
  ownCredentialVersion: () => "binding",
}));
const snapshot = comparisonFixture(),
  connection = snapshot.connections[0];
let side: any, tx: any;
beforeEach(() => {
  side = {
    id: "side",
    projectId: "project",
    runId: "run",
    provider: "dataforseo",
    connectionId: connection.id,
    status: "claimed",
    claimToken: "token",
    requestKeys: [],
    attemptIds: [],
    run: { cancellationRequested: false },
  };
  tx = {
    $queryRaw: vi.fn(),
    providerComparisonSide: {
      findFirst: vi.fn(async () => side),
      update: vi.fn(async ({ data }: any) => {
        side.requestKeys.push(data.requestKeys.push);
        side.attemptIds.push(data.attemptIds.push);
      }),
    },
    keyword: {
      findFirst: vi.fn(async () => ({
        text: snapshot.text,
        device: snapshot.device,
        locationId: snapshot.locationId,
        locationRef: snapshot.location,
        project: { domain: snapshot.domain },
      })),
    },
    providerConnection: {
      findFirst: vi.fn(async () => ({
        id: connection.id,
        provider: connection.provider,
        projectId: "project",
        enabled: true,
        status: "connected",
        credentialSource: "own",
        updatedAt: new Date("2026-10-14T00:00:00.000Z"),
        providerUiRevision: 4n,
        kind: "serp",
        credentialsEncrypted: "encrypted-fixture",
      })),
    },
  };
});
function fences() {
  return comparisonFences({
    projectId: "project",
    runId: "run",
    sideId: "side",
    token: "token",
    actorId: "actor",
    snapshot,
    connection,
    tag: "tag",
  });
}
it("records exactly one semantic native request before dispatch and refuses the same page again", async () => {
  const guard = fences();
  const request = dataForSeoRankRequest(comparisonRankInput(snapshot, "tag"));
  await guard.beforeReserve.assertRequest(tx, "attempt", request);
  expect(side.attemptIds).toEqual(["attempt"]);
  await expect(guard.beforeReserve.assertRequest(tx, "another-attempt", request)).rejects.toThrow(
    /already admitted/,
  );
  await guard.beforeFence.assertDispatch(tx, [
    {
      operation: { operationId: "attempt" },
      context: {
        projectId: "project",
        connectionId: connection.id,
        correlationId: "comparison:side",
      },
    },
  ] as never);
  await expect(
    guard.beforeFence.assertDispatch(tx, [
      {
        operation: { operationId: "other" },
        context: {
          projectId: "project",
          connectionId: connection.id,
          correlationId: "comparison:side",
        },
      },
    ] as never),
  ).rejects.toThrow(/custody/);
});
it("cancellation, stale claim and mutated keyword stop the actual native fence", async () => {
  const guard = fences();
  side.run.cancellationRequested = true;
  await expect(guard.beforeFence.lockBusiness(tx, [])).rejects.toThrow(/custody/);
  side.run.cancellationRequested = false;
  side.claimToken = "other";
  await expect(guard.beforeReserve.lockBusiness(tx, "attempt")).rejects.toThrow(/custody/);
  side.claimToken = "token";
  tx.keyword.findFirst.mockResolvedValue({ text: "changed" });
  await expect(guard.beforeReserve.lockBusiness(tx, "attempt")).rejects.toThrow(/scope/);
});

it("accepts telemetry-only updates but fences configuration revisions and legacy timestamp snapshots", async () => {
  const guard = fences();
  const current = await tx.providerConnection.findFirst();
  current.updatedAt = new Date("2026-10-15T00:00:00Z");
  tx.providerConnection.findFirst.mockResolvedValue(current);
  await expect(guard.beforeReserve.lockBusiness(tx, "attempt")).resolves.toBeUndefined();
  current.providerUiRevision = 5n;
  await expect(guard.beforeReserve.lockBusiness(tx, "attempt")).rejects.toThrow(
    /connection changed/,
  );
  current.providerUiRevision = 4n;
  const old = { ...connection, revision: "2026-10-14T00:00:00.000Z" };
  await expect(
    comparisonFences({
      projectId: "project",
      runId: "run",
      sideId: "side",
      token: "token",
      actorId: "actor",
      snapshot,
      connection: old,
      tag: "tag",
    }).beforeReserve.lockBusiness(tx, "attempt"),
  ).rejects.toThrow(/connection changed/);
});
