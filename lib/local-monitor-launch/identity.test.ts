import { describe, expect, it } from "vitest";
import { nativeOccurrenceKey, occurrenceBody, occurrenceKey } from "./identity";
import { command } from "./launch.test-fixture";

describe("monitor occurrence identity", () => {
  it("keeps an idempotent occurrence stable across token key rotation", () => {
    expect(occurrenceBody({ ...command, consentToken: "new-token" }, "actor")).toBe(
      occurrenceBody(command, "actor"),
    );
    expect(nativeOccurrenceKey(command)).toBe(`local-monitor:${occurrenceKey(command)}`);
  });
  it("separates monitors but retains changed-body conflicts for the same key", () => {
    expect(occurrenceKey({ ...command, monitorId: "lmn_bbbbbbbbbbbbbbbbbbbbbbbb" })).not.toBe(
      occurrenceKey(command),
    );
    const changed = { ...command, expectedVersion: 1 };
    expect(occurrenceKey(changed)).toBe(occurrenceKey(command));
    expect(occurrenceBody(changed, "actor")).not.toBe(occurrenceBody(command, "actor"));
  });
  it("binds actor, connection and complete target set", () => {
    expect(occurrenceBody(command, "other")).not.toBe(occurrenceBody(command, "actor"));
    expect(
      occurrenceBody({ ...command, connectionId: "conn_bbbbbbbbbbbbbbbbbbbbbbbb" }, "actor"),
    ).not.toBe(occurrenceBody(command, "actor"));
    expect(occurrenceBody({ ...command, targetIds: [] }, "actor")).not.toBe(
      occurrenceBody(command, "actor"),
    );
  });
});
