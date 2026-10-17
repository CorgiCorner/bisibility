import { expect, it } from "vitest";
import { providerConnectionRevision } from "./connection-revision";

const connection = {
  id: "connection",
  projectId: "project",
  provider: "dataforseo",
  kind: "serp",
  status: "connected",
  enabled: true,
  credentialSource: "own",
  credentialsEncrypted: "encrypted-fixture",
  providerUiRevision: 4n,
};
it("ignores traffic/sync telemetry, detects configuration and ABA revisions, and hides credentials", () => {
  const initial = providerConnectionRevision(connection);
  expect(initial).toMatch(/^[a-f0-9]{64}$/u);
  expect(
    providerConnectionRevision({
      ...connection,
      updatedAt: new Date(),
      lastUsedAt: new Date(),
      firstSyncFinishedAt: new Date(),
    } as typeof connection),
  ).toBe(initial);
  for (const edit of [
    { providerUiRevision: 5n },
    { credentialsEncrypted: "new-encrypted-fixture" },
    { provider: "serpapi" },
    { projectId: "other" },
    { kind: "analytics" },
    { enabled: false },
    { status: "disconnected" },
    { credentialSource: "hosted" },
  ])
    expect(providerConnectionRevision({ ...connection, ...edit })).not.toBe(initial);
  expect(providerConnectionRevision({ ...connection, providerUiRevision: "4" })).toBe(initial);
  expect(() =>
    providerConnectionRevision({ ...connection, providerUiRevision: "undefined" }),
  ).toThrow(/unavailable/);
});
