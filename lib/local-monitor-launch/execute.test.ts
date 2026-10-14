import { describe, expect, it, vi } from "vitest";
import { executePreparedMonitorRun } from "./execute";

describe("manual monitor one-shot dispatch", () => {
  it("reads a replay without invoking a submitter", async () => {
    const read = vi.fn(async (id) => ({ id, state: "retained" }));
    expect(
      await executePreparedMonitorRun({ id: "run", fresh: false, submitters: [] }, read),
    ).toEqual({ id: "run", state: "retained" });
    expect(read).toHaveBeenCalledExactlyOnceWith("run");
  });
  it("runs every fresh permit once then reports canonical state", async () => {
    const events: string[] = [];
    const result = await executePreparedMonitorRun(
      {
        id: "run",
        fresh: true,
        submitters: [
          {
            targetKey: "a",
            submit: async () => {
              events.push("a");
              return undefined;
            },
          },
          {
            targetKey: "b",
            submit: async () => {
              events.push("b");
              return undefined;
            },
          },
        ],
      },
      async () => {
        events.push("read");
        return { complete: 0, unknown: 1 };
      },
    );
    expect(events).toEqual(["a", "b", "read"]);
    expect(result).toEqual({ complete: 0, unknown: 1 });
  });
  it("never retries an uncertain transport or replaces it with success", async () => {
    const submit = vi.fn(async () => {
      throw new Error("ambiguous transport");
    });
    const result = await executePreparedMonitorRun(
      { id: "run", fresh: true, submitters: [{ targetKey: "a", submit }] },
      async () => ({ state: "needs_provider_evidence" }),
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(result.state).toBe("needs_provider_evidence");
  });
  it("does not invent a receipt if the authoritative read fails", async () => {
    await expect(
      executePreparedMonitorRun({ id: "run", fresh: false, submitters: [] }, async () => {
        throw new Error("read denied");
      }),
    ).rejects.toThrow("read denied");
  });
});
