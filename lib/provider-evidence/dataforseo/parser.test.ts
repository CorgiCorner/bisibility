import fs from "node:fs";
import * as legacyCosts from "@/lib/providers/serp/dataforseo-payload";
import { describe, expect, it, vi } from "vitest";
import { envelope } from "./fixtures.test-support";
import { parseRecoveryGet } from "./parser";

describe("recovery GET parser (AD-2)", () => {
  it.each([
    [20000, "success"],
    [40102, "terminal_empty_success"],
    [40106, "partial"],
    [40101, "provider_error"],
    [20100, "pending"],
    [40601, "pending"],
    [40602, "pending"],
    [49999, "unknown_code"],
    [40103, "unknown_code"],
    [50000, "outage"],
    [40202, "rate_limited"],
  ])("preserves top and task status for %s", (code, classification) => {
    const body = envelope(Number(code), 0.0123);
    const result = parseRecoveryGet(body);
    expect(result.topStatus).toEqual({ code: 20000, message: null });
    expect(result.tasks[0]).toMatchObject({
      status: { code, message: null },
      classification,
      costCents: 1.23,
      returnedDepth: code === 40102 ? 0 : 2,
    });
    expect(result.tasks[0]?.organicItems).toHaveLength(2);
  });

  it.each([undefined, "No Search Results", "provider message changed", ""])(
    "40102 is terminal empty success regardless of message %s",
    (message) => {
      const body = {
        status_code: 20000,
        tasks: [{ id: "task-1", status_code: 40102, status_message: message, result: null }],
      };
      expect(parseRecoveryGet(body).tasks[0]).toMatchObject({
        classification: "terminal_empty_success",
        returnedDepth: 0,
        organicItems: [],
        retryable: false,
      });
    },
  );

  it("preserves error/partial payloads without throwing or substituting requested depth", () => {
    const body = {
      status_code: 40100,
      status_message: "top error",
      tasks: [
        {
          id: "task-1",
          status_code: 40106,
          status_message: "partial",
          data: { depth: 100 },
          result: [{ items: [{ type: "organic", rank_group: 5 }] }],
        },
        { status_code: 40101, result: null },
        null,
      ],
    };
    expect(parseRecoveryGet(body)).toMatchObject({
      topStatus: { code: 40100, message: "top error" },
      classification: "unknown_code",
      tasks: [
        { classification: "partial", returnedDepth: 5 },
        { classification: "provider_error", returnedDepth: null },
        { classification: "unknown_code" },
      ],
    });
  });

  it.each([null, undefined, {}, { status_code: 20000, tasks: null }, { tasks: "broken" }])(
    "handles absent or malformed evidence %s",
    (body) => {
      expect(() => parseRecoveryGet(body)).not.toThrow();
      expect(parseRecoveryGet(body).tasks).toEqual([]);
    },
  );

  it("marks envelope outage and empty task evidence explicitly", () => {
    expect(parseRecoveryGet({ status_code: 50301 })).toMatchObject({
      classification: "outage",
      retryable: true,
      suggestedBackoffMs: 60000,
    });
    expect(parseRecoveryGet({ status_code: 20000, tasks: [] })).toMatchObject({
      classification: "absent",
      acceptance: "unknown",
      costCents: null,
    });
  });
});

describe("nullable cost invariant (INV-4)", () => {
  it("never imports the zero-default helper or the queued envelope reader in recovery source", () => {
    const files = fs
      .readdirSync("lib/provider-evidence/dataforseo")
      .filter((file) => file.endsWith(".ts") && !file.includes(".test"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = fs.readFileSync(`lib/provider-evidence/dataforseo/${file}`, "utf8");
      expect(source, file).not.toMatch(
        /dataForSeoResponseCostCents|dataforseo-queued|queued-results/,
      );
    }
  });

  it("keeps missing cost null and never reaches the legacy cost helper (runtime spy)", () => {
    const spy = vi.spyOn(legacyCosts, "dataForSeoResponseCostCents");
    try {
      const missing = parseRecoveryGet({ ...envelope(), cost: 0 });
      const zero = parseRecoveryGet(envelope(20000, 0));
      const measured = parseRecoveryGet(envelope(40106, 0.004));
      expect(spy).not.toHaveBeenCalled();
      expect(missing.tasks[0]?.costCents).toBeNull();
      expect(zero.tasks[0]?.costCents).toBe(0);
      expect(measured.tasks[0]?.costCents).toBe(0.4);
    } finally {
      spy.mockRestore();
    }
  });

  it.each([-1, NaN, Infinity, "0.002", null])("treats invalid cost %s as unknown", (cost) => {
    const body = envelope();
    Object.assign(body.tasks[0], { cost });
    expect(parseRecoveryGet(body).tasks[0]?.costCents).toBeNull();
  });
});
