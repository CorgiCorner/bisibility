import { expect, test } from "vitest";
import { verifyTransportFenceRow } from "./transport-fence-history";

function evidence() {
  const scope = {
    namespace: "ns-a",
    principal: "owner",
    group: "project",
    connection: "connection",
    providerCredentialVersion: "version",
  };
  const input = {
    scope,
    provider: "dataforseo",
    operation: "rank_check",
    fundingSource: "byok",
    costOwner: "owner",
  };
  const lease = {
    leaseId: "original-lease",
    holder: "worker",
    expiresAt: "2026-10-01T12:01:00.000Z",
  };
  return {
    namespace: "ns-a",
    operation_id: "attempt",
    principal: "owner",
    context: {
      projectId: "project",
      connectionId: "connection",
      providerCredentialVersion: "version",
    },
    dispatch_lease_id: lease.leaseId,
    physical: "1790856000000.000000",
    fenced_at_iso: null as string | null,
    input,
    grant: { granted: true, lease, operation: { ...input, operationId: "attempt", lease } },
  };
}
test("legacy physical time remains unknown even when plausibly UTC or shifted", () => {
  const row = evidence();
  expect(verifyTransportFenceRow(row)).toBe("legacy_unknown");
  row.physical = "1790863200000.000000";
  expect(verifyTransportFenceRow(row)).toBe("legacy_unknown");
});
test("new original ISO must equal the actual physical instant", () => {
  const row = evidence();
  row.fenced_at_iso = "2026-10-01T12:00:00.000Z";
  expect(verifyTransportFenceRow(row)).toBe("utc_iso_v1");
  row.physical = "1790863200000.000000";
  expect(() => verifyTransportFenceRow(row)).toThrow("physical instant");
});
test.each(["namespace", "principal", "dispatch_lease_id"] as const)(
  "rejects mismatched %s",
  (field) => {
    const row = evidence();
    row[field] = "foreign";
    expect(() => verifyTransportFenceRow(row)).toThrow("original paid grant");
  },
);
test("a later recovery lease cannot stand in for original transport authority", () => {
  const row = evidence();
  row.grant.lease.leaseId = "recovery";
  expect(() => verifyTransportFenceRow(row)).toThrow();
});
test("provider/credential context is independently bound", () => {
  const row = evidence();
  row.context.providerCredentialVersion = "rotated";
  expect(() => verifyTransportFenceRow(row)).toThrow();
});
