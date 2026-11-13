import { expect, it } from "vitest";
import {
  openRecoveryCase,
  openRecoveryCursor,
  openRecoveryPreview,
  recoveryCaseReference,
  sealRecoveryCase,
  sealRecoveryCursor,
  sealRecoveryPreview,
} from "./tokens";

const scope = { actor: "admin", namespace: "default", instance: "production" };
it("binds every case to actor, instance and accounting namespace", () => {
  const token = sealRecoveryCase(scope, "operation", "private-operation");
  for (const different of [
    { ...scope, actor: "other" },
    { ...scope, instance: "demo" },
    { ...scope, namespace: "other" },
  ])
    expect(() => openRecoveryCase(token, different)).toThrow("Invalid recovery token");
  expect(token).not.toContain("private-operation");
  expect(() => openRecoveryCase(`${token}changed`, scope)).toThrow();
});
it("gives a case one reference on every read while its token is sealed anew", () => {
  const first = sealRecoveryCase(scope, "operation", "private-operation");
  expect(sealRecoveryCase(scope, "operation", "private-operation")).not.toBe(first);
  const reference = recoveryCaseReference(scope, "operation", "private-operation");
  expect(recoveryCaseReference(scope, "operation", "private-operation")).toBe(reference);
  // Another administrator opening a shared link must resolve the same case.
  expect(
    recoveryCaseReference({ ...scope, actor: "other" }, "operation", "private-operation"),
  ).toBe(reference);
  expect(reference).not.toContain("private-operation");
  expect(reference).toMatch(/^[A-Za-z0-9_-]{43}$/);
  for (const different of [
    recoveryCaseReference(scope, "operation", "other-operation"),
    recoveryCaseReference(scope, "run", "private-operation"),
    recoveryCaseReference({ ...scope, instance: "demo" }, "operation", "private-operation"),
    recoveryCaseReference({ ...scope, namespace: "other" }, "operation", "private-operation"),
  ])
    expect(different).not.toBe(reference);
});
it("prevents a filtered cursor from being replayed in a different list", () => {
  const token = sealRecoveryCursor(
    "operation:private",
    "2026-10-13T10:00:00Z",
    { category: "accounting" },
    scope,
  );
  if (!token) throw new Error("Expected a sealed cursor");
  expect(openRecoveryCursor(token, { category: "accounting" }, scope)?.after).toBe(
    "operation:private",
  );
  expect(() => openRecoveryCursor(token, { category: "all" }, scope)).toThrow(
    "Invalid recovery cursor",
  );
});
it("expires a read-only plan without extending its authorization", () => {
  const now = new Date("2026-10-13T10:00:00Z");
  const preview = sealRecoveryPreview(
    scope,
    [{ token: "case-token", version: "version", action: "recover_proof" }],
    now,
  );
  expect(openRecoveryPreview(preview.token, scope, now).items).toHaveLength(1);
  expect(() => openRecoveryPreview(preview.token, scope, new Date(preview.expiresAt))).toThrow(
    "Recovery preview expired",
  );
  expect(() => openRecoveryPreview(preview.token, { ...scope, actor: "other" }, now)).toThrow();
});
