import { dataForSeoRedirectTransport } from "@/lib/providers/serp/dataforseo-redirect-transport";
import converter from "@/lib/providers/serp/fixtures/goto/converter_full_page.json";
import heavy from "@/lib/providers/serp/fixtures/goto/task_get_goto_heavy.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decideGotoHistoryBody, guardedGotoFetch, withGuardedFetch } from "./goto-history-source";

const taskId = heavy.tasks[0]?.id ?? "";

afterEach(() => vi.unstubAllGlobals());

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("historical GoTo source", () => {
  it("rejects paid submission before any network call", async () => {
    const inner = vi.fn();
    await expect(
      guardedGotoFetch(inner)("https://api.example.com/v3/serp/google/organic/task_post", {
        method: "POST",
      }),
    ).rejects.toThrow(/paid/);
    expect(inner).not.toHaveBeenCalled();
  });

  it.each([
    ["/task_post", "POST"],
    ["/tasks_ready", "GET"],
    ["/task_get/advanced/example", "POST"],
  ])("refuses %s with %s while a global guard is installed", async (path, method) => {
    const outbound = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", outbound);
    await withGuardedFetch(outbound, async () => {
      await expect(fetch(`https://api.example.com${path}`, { method })).rejects.toThrow(/paid/);
    });
    expect(outbound).not.toHaveBeenCalled();
    expect(globalThis.fetch).toBe(outbound);
  });

  it("refuses to wrap an already guarded fetch", () => {
    const guarded = guardedGotoFetch(vi.fn());
    expect(() => guardedGotoFetch(guarded)).toThrow(/already guarded/);
  });

  it("refuses a guarded transport even when global fetch has not been patched", async () => {
    const outbound = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", outbound);
    const run = vi.fn(async () => undefined);
    await expect(withGuardedFetch(guardedGotoFetch(outbound), run)).rejects.toThrow(
      /already guarded/,
    );
    expect(run).not.toHaveBeenCalled();
    expect(globalThis.fetch).toBe(outbound);
  });

  it("refuses nested global guards and restores the original fetch after failure", async () => {
    const outbound = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", outbound);
    await withGuardedFetch(outbound, async () => {
      const outer = globalThis.fetch;
      await expect(withGuardedFetch(outbound, async () => undefined)).rejects.toThrow(
        /already guarded/,
      );
      expect(globalThis.fetch).toBe(outer);
      await expect(withGuardedFetch(outer, async () => undefined)).rejects.toThrow(
        /already guarded/,
      );
    });
    expect(globalThis.fetch).toBe(outbound);
    await expect(
      withGuardedFetch(outbound, async () => {
        throw new Error("Synthetic row failure");
      }),
    ).rejects.toThrow("Synthetic row failure");
    expect(globalThis.fetch).toBe(outbound);
  });

  it("converts the captured page with the free converter and decides the tracked domain", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      urls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("task_post") || url.includes("tasks_ready")) throw new Error("paid");
      if (url.includes("goto_url_converter")) return json(converter.response);
      throw new Error("unexpected request");
    };
    const decided = await withGuardedFetch(fetchImpl, () =>
      decideGotoHistoryBody({
        body: heavy,
        depth: 20,
        domain: "site1.example.com",
        expectedTaskId: taskId,
        transport: dataForSeoRedirectTransport({ login: "fixture", password: "synthetic" }, 1000),
      }),
    );
    expect(decided.complete).toBe(true);
    expect(decided.decision?.position).toBe(2);
    expect(decided.decision?.rankingUrl).toContain("site1.example.com");
    expect(urls.every((url) => url.startsWith("POST ") && url.includes("goto_url_converter"))).toBe(
      true,
    );
  });
});

const nativeTask = { id: taskId, status_code: 20000, result: [{ items: [] }] };
const retainedTask = {
  id: taskId,
  status: { code: 20000 },
  classification: "success",
  results: [{ items: [] }],
  organicItems: [],
};

const unsafeSources: Array<[string, unknown, string]> = [
  [
    "missing native result",
    { tasks: [{ ...nativeTask, result: undefined }], status_code: 20000 },
    "source_incomplete",
  ],
  [
    "empty native result",
    { tasks: [{ ...nativeTask, result: [] }], status_code: 20000 },
    "source_incomplete",
  ],
  [
    "missing items",
    { tasks: [{ ...nativeTask, result: [{}] }], status_code: 20000 },
    "source_incomplete",
  ],
  [
    "null items",
    { tasks: [{ ...nativeTask, result: [{ items: null }] }], status_code: 20000 },
    "source_incomplete",
  ],
  [
    "mixed complete and incomplete results",
    { tasks: [{ ...nativeTask, result: [{ items: [] }, {}] }], status_code: 20000 },
    "source_incomplete",
  ],
  [
    "truncated result array",
    { tasks: [{ ...nativeTask, result_count: 2 }], status_code: 20000 },
    "source_incomplete",
  ],
  [
    "truncated items array",
    { tasks: [{ ...nativeTask, result: [{ items: [], items_count: 1 }] }], status_code: 20000 },
    "source_incomplete",
  ],
  [
    "unresolved retained empty task",
    { task: { ...retainedTask, results: [] }, raw: { recovery: { completeness: "unresolved" } } },
    "source_incomplete",
  ],
  ["retained missing status", { task: { ...retainedTask, status: undefined } }, "source_status"],
  ["retained missing id", { task: { ...retainedTask, id: undefined } }, "source_identity"],
  ["retained mismatched id", { task: { ...retainedTask, id: "other" } }, "source_identity"],
  [
    "retained partial nonempty task",
    {
      task: {
        ...retainedTask,
        classification: "partial",
        results: [{ items: [{ type: "organic", rank_group: 1, url: "https://example.com/" }] }],
      },
    },
    "source_incomplete",
  ],
  [
    "retained missing classification",
    { task: { ...retainedTask, classification: undefined } },
    "source_incomplete",
  ],
  [
    "failed native task",
    { status_code: 20000, tasks: [{ ...nativeTask, status_code: 50300 }] },
    "source_status",
  ],
  ["failed envelope", { status_code: 50300, tasks: [nativeTask] }, "source_status"],
  ["missing envelope status", { tasks: [nativeTask] }, "source_status"],
  [
    "missing native id",
    { status_code: 20000, tasks: [{ ...nativeTask, id: undefined }] },
    "source_identity",
  ],
  [
    "retained partial recovery metadata",
    { task: retainedTask, raw: { recovery: { completeness: "partial" } } },
    "source_incomplete",
  ],
  [
    "contradictory terminal empty",
    {
      status_code: 20000,
      tasks: [
        {
          ...nativeTask,
          status_code: 40102,
          result: [{ items: [{ type: "organic", rank_group: 1, url: "https://example.org/" }] }],
        },
      ],
    },
    "source_incomplete",
  ],
  [
    "terminal empty with missing claimed results",
    { status_code: 20000, tasks: [{ id: taskId, status_code: 40102, result_count: 1 }] },
    "source_incomplete",
  ],
  [
    "multiple native tasks",
    { status_code: 20000, tasks: [nativeTask, nativeTask] },
    "source_identity",
  ],
  ["non-object envelope", [], "source_identity"],
  ["non-object task", { status_code: 20000, tasks: [null] }, "source_identity"],
  [
    "non-array result",
    { status_code: 20000, tasks: [{ ...nativeTask, result: {} }] },
    "source_incomplete",
  ],
  [
    "non-object result",
    { status_code: 20000, tasks: [{ ...nativeTask, result: [null] }] },
    "source_incomplete",
  ],
];

describe("historical source completeness", () => {
  it.each(unsafeSources)("rejects %s without conversion", async (_name, body, reason) => {
    const transport = vi.fn(async () => []);
    const result = await decideGotoHistoryBody({
      body,
      depth: 20,
      domain: "example.com",
      expectedTaskId: taskId,
      transport,
    });
    expect(result).toMatchObject({ complete: false, decision: null, reason, resolution: null });
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    { status_code: 20000, tasks: [{ id: taskId, status_code: 40102, result: null }] },
    {
      task: {
        ...retainedTask,
        status: { code: 40102 },
        classification: "terminal_empty_success",
        results: [],
      },
    },
    { status_code: 20000, tasks: [nativeTask] },
    { task: retainedTask },
  ])("accepts explicit native empty success", async (body) => {
    const result = await decideGotoHistoryBody({
      body,
      depth: 20,
      domain: "example.com",
      expectedTaskId: taskId,
      transport: async () => [],
    });
    expect(result).toMatchObject({
      complete: true,
      reason: null,
      decision: { outcome: "no_match", position: null },
    });
  });

  it("requires the expected native identity even if the source has an id", async () => {
    expect(
      await decideGotoHistoryBody({
        body: { status_code: 20000, tasks: [nativeTask] },
        depth: 20,
        domain: "example.com",
        expectedTaskId: null,
        transport: async () => [],
      }),
    ).toMatchObject({ complete: false, reason: "source_identity" });
  });

  it("uses complete retained native results instead of the derived organic cache", async () => {
    const body = {
      task: { ...retainedTask, results: heavy.tasks[0]?.result },
      raw: { recovery: { completeness: "unresolved" } },
    };
    const result = await decideGotoHistoryBody({
      body,
      depth: 20,
      domain: "site1.example.com",
      expectedTaskId: taskId,
      transport: async () => converter.response.tasks[0]?.result ?? [],
    });
    expect(result).toMatchObject({ complete: true, reason: null, decision: { position: 2 } });
  });

  it("accepts bounded data wrappers and rejects excessive nesting", async () => {
    const body = { data: { status_code: 20000, tasks: [nativeTask] } };
    const decide = (body: unknown) =>
      decideGotoHistoryBody({
        body,
        depth: 20,
        domain: "example.com",
        expectedTaskId: taskId,
        transport: async () => [],
      });
    expect(await decide(body)).toMatchObject({ complete: true, reason: null });
    expect(await decide({ data: { data: { data: body } } })).toMatchObject({
      complete: false,
      reason: "source_identity",
    });
  });
});
