import { confirmCloseoutPolicy } from "@/scripts/ops/closeout-historical-finances";
import { expect, it } from "vitest";
import { closeoutManifest, closeoutPolicy, liveConnectionCloseoutPolicy } from "./manifest";
import { planCloseout } from "./plan";
import { closeoutFixture, liveCloseoutFixture } from "./plan.test-fixture";

const retiredManifest = () => {
  const { manifest } = closeoutFixture();
  const { projectPublicId: _, ...rest } = manifest;
  return { ...rest, retiredProjectId: "project" };
};

it("selects exactly one existing or retired project, and a retired project only under v1", () => {
  const { manifest } = closeoutFixture();
  expect(closeoutManifest.safeParse(retiredManifest()).success).toBe(true);
  expect(closeoutManifest.safeParse({ ...manifest, retiredProjectId: "project" }).success).toBe(
    false,
  );
  const { projectPublicId: _, ...neither } = manifest;
  expect(closeoutManifest.safeParse(neither).success).toBe(false);
  expect(
    closeoutManifest.safeParse({ ...retiredManifest(), policy: liveConnectionCloseoutPolicy })
      .success,
  ).toBe(false);
  expect(
    closeoutManifest.safeParse({ ...retiredManifest(), retiredProjectId: "prj_public" }).success,
  ).toBe(false);
  expect(closeoutManifest.safeParse({ ...manifest, policy: "guessed-v2" }).success).toBe(false);
});

it("plans a retired project with the ordinary v1 rules and binds it into the digest", () => {
  const { snapshot, now } = closeoutFixture();
  const manifest = closeoutManifest.parse(retiredManifest());
  const existing = closeoutFixture();
  snapshot.project = { id: "project", publicId: null };
  const plan = planCloseout(snapshot, manifest, now);
  expect(plan.corrections).toHaveLength(1);
  expect(plan.planHash).not.toBe(
    planCloseout(existing.snapshot, existing.manifest, existing.now).planHash,
  );
  snapshot.project = { id: "other-project", publicId: null };
  expect(() =>
    planCloseout(snapshot, { ...manifest, retiredProjectId: "other-project" }, now),
  ).toThrow("Historical project, connection or namespace mismatch");
  snapshot.project = { id: "project", publicId: null };
  snapshot.entries[0]!.facts.retainedIdentity = true;
  expect(() => planCloseout(snapshot, manifest, now)).toThrow("Active, revised");
});

it("requires an explicit matching --policy for the live variant only", () => {
  const { manifest } = liveCloseoutFixture();
  expect(() => confirmCloseoutPolicy(manifest)).toThrow("explicit matching --policy");
  expect(() => confirmCloseoutPolicy(manifest, closeoutPolicy)).toThrow("must equal");
  expect(() => confirmCloseoutPolicy(manifest, "guessed")).toThrow("Unknown closeout policy");
  expect(() => confirmCloseoutPolicy(manifest, liveConnectionCloseoutPolicy)).not.toThrow();
  const v1 = closeoutFixture().manifest;
  expect(() => confirmCloseoutPolicy(v1)).not.toThrow();
  expect(() => confirmCloseoutPolicy(v1, closeoutPolicy)).not.toThrow();
  expect(() => confirmCloseoutPolicy(v1, liveConnectionCloseoutPolicy)).toThrow("must equal");
});
