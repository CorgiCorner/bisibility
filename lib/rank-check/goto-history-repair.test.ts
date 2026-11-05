import type { Prisma } from "@/lib/generated/prisma/client";
import { encryptSecret } from "@/lib/providers/crypto";
import converter from "@/lib/providers/serp/fixtures/goto/converter_full_page.json";
import heavy from "@/lib/providers/serp/fixtures/goto/task_get_goto_heavy.json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gotoHistoryCommandExitCode, parseGotoHistoryCommand } from "./goto-history-command";
import { repairGotoHistory } from "./goto-history-repair";
import { preparedRankRecoveryContext } from "./recovery-context";
import type { RetainedRankResultEnvelope } from "./recovery-evidence-envelope";
import { recoveryResultWriteAllowed } from "./recovery-restore-gate";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  sources: vi.fn(),
  remembered: vi.fn(),
  partial: vi.fn(),
  preview: vi.fn(),
  retain: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    providerPartialEvidence: {
      findMany: mocks.sources,
      findUnique: mocks.remembered,
    },
  },
}));
vi.mock("./goto-history-preview", () => ({
  loadGotoHistoryCandidate: mocks.load,
  previewGotoHistory: mocks.preview,
}));
vi.mock("./goto-history-retain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./goto-history-retain")>()),
  historicalPartialId: (id: string) => `historical:${id}`,
  retainHistoricalGotoResult: mocks.retain,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("parseGotoHistoryCommand", () => {
  it("defaults to a dry run and a bounded limit", () => {
    expect(parseGotoHistoryCommand([])).toEqual({ apply: false, limit: 25 });
    expect(parseGotoHistoryCommand(["--apply", "--limit", "10", "--check-ids", " a , b "])).toEqual(
      {
        apply: true,
        checkIds: ["a", "b"],
        limit: 10,
      },
    );
    expect(parseGotoHistoryCommand(["--limit", "0"]).error).toBe(
      "Limit must be an integer from 1 to 100.",
    );
    expect(parseGotoHistoryCommand(["--apply-now"]).error).toBe("Unknown argument.");
  });
});

describe("historical GoTo repair guards", () => {
  it("stays inactive while the demo guard is on", async () => {
    vi.stubEnv("READ_ONLY_DEMO", "1");
    vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
    vi.stubEnv("DEMO_PROJECT_ID", "prj_abcdefghijklmnopqrstuvwx");
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    const fetchImpl = vi.fn();
    await expect(
      repairGotoHistory({ apply: true, fetch: fetchImpl, limit: 1 }),
    ).resolves.toMatchObject({
      mode: "inactive",
      providerCalls: 0,
      writes: 0,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a historical envelope for a check that is not a GoTo failure", async () => {
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    const value = {
      completeness: "complete",
      historicalRepair: true,
      version: 2,
    } as RetainedRankResultEnvelope;
    const tx = {
      providerPartialEvidence: { findFirst: async () => null },
      providerRecoveryCandidate: { findFirst: async () => null },
      providerRecoveryIntent: { findFirst: async () => null },
      rankCheck: {
        findUnique: async () => ({
          attempts: [],
          error: "provider billing",
          errorCode: "provider_billing",
          raw: null,
          run: { deletedAt: null, status: "failed" },
          status: "failed",
        }),
      },
    } as unknown as Prisma.TransactionClient;
    expect(await recoveryResultWriteAllowed(tx, "check", value, new Date())).toBe(false);
  });
});

describe("historical GoTo apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sources.mockResolvedValue([]);
    mocks.remembered.mockResolvedValue(null);
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
    vi.stubEnv("READ_ONLY_DEMO", "0");
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    mocks.preview.mockResolvedValue({
      examined: 2,
      rows: ["first", "second"].map((checkId) => ({
        checkId,
        classification: "eligible_task_get",
      })),
      truncated: 0,
    });
    const now = new Date();
    mocks.load.mockImplementation(async (_db, id: string) => ({
      candidate: { connectionId: "connection" },
      check: {
        checkedAt: now,
        finishedAt: now,
        keyword: {
          device: "desktop",
          locationRef: { id: "location", languageCode: "en" },
          project: { domain: "site1.example.com" },
          text: "example",
          updatedAt: now,
        },
        queuedTask: {
          id,
          providerTaskId: heavy.tasks[0]?.id,
          recoveryContextHash: preparedRankRecoveryContext(
            {
              text: "example",
              device: "desktop",
              locationRef: { id: "location", languageCode: "en" },
              updatedAt: now,
            },
            "site1.example.com",
            20,
          ),
        },
        requestedDepth: 20,
      },
      classification: "eligible_task_get",
    }));
    mocks.retain.mockResolvedValue(true);
    mocks.transaction.mockImplementation(async (run) =>
      run({ providerPartialEvidence: { upsert: mocks.partial } }),
    );
  });

  const options = {
    apply: true,
    limit: 2,
    resolveCredentials: async () => ({ login: "fixture", password: "synthetic" }),
  };

  it("captures global fetch once and counts one real task_get per row without an injected fetch", async () => {
    const outbound = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes("/task_get/")) return Response.json(heavy);
      if (String(input).includes("goto_url_converter")) return Response.json(converter.response);
      throw new Error("Unexpected outbound request");
    });
    vi.stubGlobal("fetch", outbound);
    const result = await repairGotoHistory(options);
    expect(result).toMatchObject({ failed: 0, providerCalls: 4, restored: 2, writes: 2 });
    expect(outbound).toHaveBeenCalledTimes(4);
    expect(outbound.mock.calls.filter(([url]) => String(url).includes("/task_get/"))).toHaveLength(
      2,
    );
    expect(globalThis.fetch).toBe(outbound);
    expect(gotoHistoryCommandExitCode(result)).toBe(0);
  });

  it("counts thrown row errors and returns a failing CLI exit code when all eligible rows fail", async () => {
    const outbound = vi.fn<typeof fetch>(async () => {
      throw new Error("Synthetic transport failure");
    });
    vi.stubGlobal("fetch", outbound);
    const result = await repairGotoHistory(options);
    expect(result).toMatchObject({
      eligible: 2,
      failed: 2,
      failureReasons: { source_lookup_failed: 2 },
      providerCalls: 2,
      restored: 0,
      skipped: 0,
      writes: 0,
    });
    expect(outbound).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).toBe(outbound);
    expect(gotoHistoryCommandExitCode(result)).toBe(1);
    expect(gotoHistoryCommandExitCode({ ...result, failed: 1 })).toBe(0);
    expect(gotoHistoryCommandExitCode({ ...result, eligible: 0, failed: 0 })).toBe(0);
    expect(gotoHistoryCommandExitCode({ ...result, mode: "dry-run" })).toBe(0);
    expect(gotoHistoryCommandExitCode({ ...result, mode: "inactive" })).toBe(0);
  });

  it("counts a pre-dispatch row error and continues with the remaining eligible row", async () => {
    const outbound = vi.fn<typeof fetch>(async (input) =>
      Response.json(String(input).includes("/task_get/") ? heavy : converter.response),
    );
    const resolveCredentials = vi
      .fn()
      .mockRejectedValueOnce(new Error("Synthetic credential read failure"))
      .mockResolvedValue({ login: "fixture", password: "synthetic" });
    vi.stubGlobal("fetch", outbound);
    const result = await repairGotoHistory({ ...options, resolveCredentials });
    expect(result).toMatchObject({
      failed: 1,
      failureReasons: { row_error: 1 },
      providerCalls: 2,
      restored: 1,
      writes: 1,
    });
    expect(outbound).toHaveBeenCalledTimes(2);
    expect(gotoHistoryCommandExitCode(result)).toBe(0);
  });

  it.each(["rejection", "http503"])(
    "counts converter %s failures and restores on a later retry",
    async (failure) => {
      let failed = true;
      const outbound = vi.fn<typeof fetch>(async (input) => {
        if (String(input).includes("/task_get/")) return Response.json(heavy);
        if (!failed) return Response.json(converter.response);
        if (failure === "http503") return new Response("unavailable", { status: 503 });
        throw new Error("Synthetic converter failure");
      });
      vi.stubGlobal("fetch", outbound);
      const first = await repairGotoHistory(options);
      expect(first).toMatchObject({
        eligible: 2,
        failed: 2,
        failureReasons: { conversion_failed: 2, row_error: 0 },
        providerCalls: 4,
        requalified: 0,
        restored: 0,
        writes: 0,
      });
      expect(gotoHistoryCommandExitCode(first)).toBe(1);
      expect(mocks.partial).not.toHaveBeenCalled();
      expect(mocks.retain).not.toHaveBeenCalled();
      failed = false;
      const retry = await repairGotoHistory(options);
      expect(retry).toMatchObject({
        failed: 0,
        providerCalls: 4,
        restored: 2,
        unchanged: 0,
        writes: 2,
      });
      expect(outbound).toHaveBeenCalledTimes(8);
    },
  );

  it("keeps a successful but unresolved conversion separate from failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) =>
        Response.json(
          String(input).includes("/task_get/")
            ? heavy
            : { status_code: 20000, tasks: [{ status_code: 20000, result: [] }] },
        ),
      ),
    );
    const result = await repairGotoHistory(options);
    expect(result).toMatchObject({ failed: 0, requalified: 2, restored: 0, writes: 2 });
    expect(mocks.partial).toHaveBeenCalledTimes(2);
    expect(gotoHistoryCommandExitCode(result)).toBe(0);
  });

  it.each(["text", "device", "location", "domain", "unchanged"])(
    "skips missing original scope proof after %s changes",
    async (change) => {
      const originalLoad = mocks.load.getMockImplementation();
      if (!originalLoad) throw new Error("Missing fixture loader");
      mocks.load.mockImplementation(async (...args) => {
        const loaded = await originalLoad(...args);
        loaded.check.queuedTask.recoveryContextHash = null;
        if (change === "text") loaded.check.keyword.text = "edited";
        if (change === "device") loaded.check.keyword.device = "mobile";
        if (change === "location") loaded.check.keyword.locationRef.id = "edited";
        if (change === "domain") loaded.check.keyword.project.domain = "example.org";
        return loaded;
      });
      const outbound = vi.fn<typeof fetch>(async () => Response.json(heavy));
      vi.stubGlobal("fetch", outbound);
      expect(await repairGotoHistory(options)).toMatchObject({
        skipped: 2,
        skipReasons: { scope_unproven: 2 },
        writes: 0,
      });
      expect(outbound).not.toHaveBeenCalled();
      expect(mocks.retain).not.toHaveBeenCalled();
    },
  );

  it("skips a present but changed original scope before fetching or retaining", async () => {
    const loaded = await mocks.load(null, "first");
    loaded.check.queuedTask.recoveryContextHash = "ab".repeat(32);
    mocks.load.mockResolvedValue(loaded);
    const outbound = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", outbound);
    expect(await repairGotoHistory(options)).toMatchObject({
      skipped: 2,
      skipReasons: { scope_changed: 2 },
      writes: 0,
    });
    expect(outbound).not.toHaveBeenCalled();
    expect(mocks.retain).not.toHaveBeenCalled();
  });

  it.each([
    ["source_identity", { id: "other", status_code: 20000, result: [{ items: [] }] }, false],
    ["source_incomplete", { id: heavy.tasks[0]?.id, status_code: 20000 }, false],
    ["source_status", { id: heavy.tasks[0]?.id, status_code: 50300 }, true],
  ])("counts %s without persistence or conversion", async (reason, task, failed) => {
    const outbound = vi.fn<typeof fetch>(async () =>
      Response.json({ status_code: 20000, tasks: [task] }),
    );
    vi.stubGlobal("fetch", outbound);
    const result = await repairGotoHistory(options);
    expect(result).toMatchObject({
      failed: failed ? 2 : 0,
      skipped: failed ? 0 : 2,
      providerCalls: 2,
      requalified: 0,
      writes: 0,
    });
    expect(failed ? result.failureReasons : result.skipReasons).toMatchObject({ [reason]: 2 });
    expect(gotoHistoryCommandExitCode(result)).toBe(failed ? 1 : 0);
    expect(mocks.partial).not.toHaveBeenCalled();
    expect(mocks.retain).not.toHaveBeenCalled();
    expect(outbound).toHaveBeenCalledTimes(2);
  });

  it("retries a legacy marker that could represent a transient conversion failure", async () => {
    mocks.remembered.mockResolvedValue({
      payloadEncrypted: encryptSecret(
        JSON.stringify({ version: 1, outcome: "indeterminate", taskId: heavy.tasks[0]?.id }),
      ),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) =>
        Response.json(String(input).includes("/task_get/") ? heavy : converter.response),
      ),
    );
    expect(await repairGotoHistory(options)).toMatchObject({
      restored: 2,
      unchanged: 0,
      providerCalls: 4,
    });
  });

  it.each([null, "ab".repeat(32)])(
    "refuses unsafe scope at the retention boundary (%s)",
    async (hash) => {
      const { retainHistoricalGotoResult } =
        await vi.importActual<typeof import("./goto-history-retain")>("./goto-history-retain");
      const loaded = await mocks.load(null, "first");
      loaded.check.queuedTask.recoveryContextHash = hash;
      const upsert = vi.fn();
      const tx = { rankCheckResultEvidence: { upsert } } as unknown as Prisma.TransactionClient;
      expect(
        await retainHistoricalGotoResult(
          tx,
          loaded.check,
          {
            decision: {
              anomalies: [],
              outcome: "no_match",
              position: null,
              rankingUrl: null,
              organicResults: [],
            },
            resolution: {
              candidates: [],
              failed: false,
              mappings: {},
              resolutions: [],
              retryable: false,
            },
          },
          new Date(),
        ),
      ).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    },
  );
});
