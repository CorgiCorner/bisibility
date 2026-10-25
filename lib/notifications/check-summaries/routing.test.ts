import { describe, expect, it } from "vitest";
import { type RoutingRun, routeCheckSummary } from "./routing";

const run = (patch: Partial<RoutingRun> = {}): RoutingRun => ({
  id: "run",
  projectId: "p",
  trigger: "manual",
  source: "app",
  parentRunId: null,
  requestedById: "requester",
  deletedAt: null,
  ...patch,
});
describe("CN-2/CN-3/INV-8 routing", () => {
  it.each(["api", "sdk", "cli", "mcp"])("rejects %s sources and retries", (source) => {
    const parent = run({ source });
    expect(routeCheckSummary(null, parent, new Map())).toEqual({ kind: "none" });
    expect(
      routeCheckSummary(
        null,
        run({ id: "retry", trigger: "retry", parentRunId: parent.id }),
        new Map([[parent.id, parent]]),
      ),
    ).toEqual({ kind: "none" });
  });
  it.each(["manual", "scheduled", "api"])(
    "inherits %s trigger across nested retries",
    (trigger) => {
      const parent = run({ trigger, source: trigger === "scheduled" ? "worker" : "app" });
      const retry = run({ id: "r2", trigger: "retry", parentRunId: parent.id });
      const route = routeCheckSummary(
        null,
        run({ id: "r3", trigger: "retry", parentRunId: retry.id }),
        new Map([
          [parent.id, parent],
          [retry.id, retry],
        ]),
      );
      expect(route.kind).toBe(trigger === "api" ? "none" : trigger);
    },
  );
  it("routes requester-only and fails closed for missing, cyclic, deleted and foreign parents", () => {
    expect(routeCheckSummary(null, run(), new Map())).toEqual({
      kind: "manual",
      runId: "run",
      userId: "requester",
    });
    expect(routeCheckSummary(null, run({ requestedById: null }), new Map())).toEqual({
      kind: "none",
    });
    expect(
      routeCheckSummary(null, run({ trigger: "retry", parentRunId: "missing" }), new Map()),
    ).toEqual({ kind: "none" });
    const cyclic = run({ trigger: "retry", parentRunId: "run" });
    expect(routeCheckSummary(null, cyclic, new Map([[cyclic.id, cyclic]]))).toEqual({
      kind: "none",
    });
    expect(routeCheckSummary(null, run({ deletedAt: new Date() }), new Map())).toEqual({
      kind: "none",
    });
    expect(
      routeCheckSummary(
        null,
        run({ trigger: "retry", parentRunId: "foreign" }),
        new Map([["foreign", run({ id: "foreign", projectId: "other" })]]),
      ),
    ).toEqual({ kind: "none" });
    expect(routeCheckSummary("scheduled", null, new Map())).toEqual({ kind: "scheduled" });
    expect(routeCheckSummary("manual", null, new Map())).toEqual({ kind: "none" });
    expect(routeCheckSummary(null, run({ trigger: "scheduled", source: null }), new Map())).toEqual(
      { kind: "scheduled" },
    );
  });
  it("fails closed for unknown sources and unsupported triggers", () => {
    expect(routeCheckSummary(null, run({ source: "unknown" }), new Map())).toEqual({
      kind: "none",
    });
    expect(routeCheckSummary(null, run({ trigger: "unknown" }), new Map())).toEqual({
      kind: "none",
    });
  });
});
