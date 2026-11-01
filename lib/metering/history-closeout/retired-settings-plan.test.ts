import { describe, expect, it } from "vitest";
import { closeoutManifest, closeoutPolicy, retiredSettingsCloseoutPolicy } from "./manifest";
import { planCloseout } from "./plan";
import { liveCloseoutFixture } from "./plan.test-fixture";

function fixture() {
  const base = liveCloseoutFixture();
  const { projectPublicId: _, ...manifest } = base.manifest;
  base.snapshot.project.publicId = null;
  base.snapshot.retiredSettings = { ...base.snapshot.live!, connection: null };
  base.snapshot.live = null;
  return {
    ...base,
    manifest: closeoutManifest.parse({
      ...manifest,
      retiredProjectId: "project",
      policy: retiredSettingsCloseoutPolicy,
    }),
  };
}

describe("retired-settings financial plan", () => {
  it("preserves measured money and original unknown identity while v1 remains frozen", () => {
    const f = fixture();
    const original = f.snapshot.entries[0]!.operation;
    const result = planCloseout(f.snapshot, f.manifest, f.now);
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0]!.receipt.cost).toEqual(original.receipts[0]!.cost);
    expect(result.corrections[0]!.receipt.measurements.some((m) => m.unit === "units")).toBe(false);
    expect(result.corrections[0]!.principal).toBe(original.scope.principal);
    expect(original.provider).toBe("historical-unknown");
    expect(original.version).toBe(1);
    expect(() =>
      planCloseout(f.snapshot, { ...f.manifest, policy: closeoutPolicy }, f.now),
    ).toThrow("Active, revised");
  });

  it.each(["binding", "evidence", "reference"] as const)("refuses retained %s", (flag) => {
    const f = fixture();
    f.snapshot.entries[0]!.facts[flag] = true;
    expect(() => planCloseout(f.snapshot, f.manifest, f.now)).toThrow("Active, revised");
  });

  it("refuses a surviving connection and a retained configuration from another project", () => {
    const f = fixture();
    f.snapshot.retiredSettings!.connection = liveCloseoutFixture().snapshot.live!.connection;
    expect(() => planCloseout(f.snapshot, f.manifest, f.now)).toThrow("remain absent");
    f.snapshot.retiredSettings!.connection = null;
    f.snapshot.retiredSettings!.retainedSettings[0]!.payload = {
      id: "connection",
      projectId: "other",
      provider: "dataforseo",
    };
    expect(() => planCloseout(f.snapshot, f.manifest, f.now)).toThrow(
      "original retired connection",
    );
  });

  it("refuses hidden native identity, duplicate snapshots and operations after the cutoff", () => {
    const f = fixture();
    const settings = f.snapshot.retiredSettings!.retainedSettings;
    const original = settings[0]!;
    settings[0] = {
      ...original,
      payload: {
        id: "connection",
        projectId: "project",
        provider: "dataforseo",
        providerRequestId: "native",
      },
    };
    expect(() => planCloseout(f.snapshot, f.manifest, f.now)).toThrow(
      "original retired connection",
    );
    settings[0] = original;
    settings.push(original);
    expect(() => planCloseout(f.snapshot, f.manifest, f.now)).toThrow("Exactly one");
    settings.pop();
    f.snapshot.retiredSettings!.cutoff = f.snapshot.entries[0]!.operation.createdAt;
    expect(() => planCloseout(f.snapshot, f.manifest, f.now)).toThrow(
      "before the original history snapshot",
    );
  });
});
