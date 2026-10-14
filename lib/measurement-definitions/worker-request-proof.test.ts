import { describe, expect, it, vi } from "vitest";
import type { DefinitionTransaction } from "./model";
import { nativeBindingFixture, nativeRequestFixture } from "./worker-native.fixtures";
import {
  nativeDefinitionRequestProof,
  retainNativeDefinitionRequest,
} from "./worker-request-proof";

vi.mock("server-only", () => ({}));
describe("original native child request before pricing/admission", () => {
  it("retains the actual SerpApi page policy without claiming whole-prefix completeness", () => {
    const binding = nativeBindingFixture("serpapi");
    for (const start of [0, 10])
      expect(
        nativeDefinitionRequestProof(binding, nativeRequestFixture(binding, start)),
      ).toMatchObject({ requestedDepth: 20, pageStart: start, pageSize: 10, nativeDepth: null });
    expect(
      nativeDefinitionRequestProof(binding, nativeRequestFixture(binding, 10)),
    ).not.toHaveProperty("completeThrough");
    for (const start of [1, 20, 100])
      expect(() =>
        nativeDefinitionRequestProof(binding, nativeRequestFixture(binding, start)),
      ).toThrow();
  });
  it("rejects another keyword, duplicate params, userinfo and caller credentials with a sanitized error", () => {
    const binding = nativeBindingFixture("serpapi");
    const valid = nativeRequestFixture(binding);
    const secret = "synthetic-never-display";
    const userinfoUrl = new URL(valid.url);
    userinfoUrl.username = "synthetic-user";
    userinfoUrl.password = "synthetic-password";
    for (const request of [
      { ...valid, url: `${valid.url}&q=other` },
      { ...valid, url: `${valid.url}&api_key=${secret}` },
      { ...valid, headers: { Authorization: `Bearer ${secret}` } },
      { ...valid, url: userinfoUrl.toString() },
    ]) {
      try {
        nativeDefinitionRequestProof(binding, request);
        throw new Error("Expected refusal");
      } catch (error) {
        expect(error).toMatchObject({ code: "measurement_definition_unavailable" });
        expect(String(error)).not.toContain(secret);
      }
    }
  });
  it("checks actual DFS child depth and stop/geo policy; only a queued child may carry native priority", () => {
    const binding = nativeBindingFixture("dataforseo");
    const request = nativeRequestFixture(binding);
    const child = (request.body as Record<string, unknown>[])[0];
    expect(nativeDefinitionRequestProof(binding, request)).toMatchObject({
      route: "live",
      nativeDepth: 20,
      priority: null,
    });
    for (const changed of [
      { ...child, depth: 100 },
      { ...child, keyword: "changed" },
      { ...child, find_targets_in: [] },
      { ...child, priority: 2 },
    ])
      expect(() =>
        nativeDefinitionRequestProof(binding, { ...request, body: [changed] }),
      ).toThrow();
    const queued = {
      ...request,
      url: request.url.replace("live/advanced", "task_post"),
      body: [{ ...child, priority: 1, tag: "synthetic-task" }],
    };
    expect(nativeDefinitionRequestProof(binding, queued)).toMatchObject({
      route: "queued",
      nativeDepth: 20,
      priority: 1,
    });
    expect(() =>
      nativeDefinitionRequestProof(binding, { ...queued, body: [child, child] }),
    ).toThrow();
  });
  it("a queued child must retain the actual original batch priority before insert/reserve", async () => {
    const base = nativeBindingFixture("dataforseo");
    const binding = { ...base, owner: { ...base.owner, queuedTaskId: "original-task" } };
    const request = nativeRequestFixture(binding);
    const child = (request.body as Record<string, unknown>[])[0];
    const queued = {
      ...request,
      url: request.url.replace("live/advanced", "task_post"),
      body: [{ ...child, priority: 2 }],
    };
    const execute = vi.fn();
    const tx = {
      $queryRaw: vi.fn(async () => [{ priority: "normal" }]),
      $executeRaw: execute,
    } as unknown as DefinitionTransaction;
    await expect(
      retainNativeDefinitionRequest(tx, binding, "native-operation", queued),
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
  it("an accounting replay keeps only the identical original proof and refuses a different page", async () => {
    const binding = nativeBindingFixture("serpapi");
    const request = nativeRequestFixture(binding);
    const proof = nativeDefinitionRequestProof(binding, request);
    const execute = vi.fn(async () => 0);
    const query = vi.fn(async () => [{ proof }]);
    const tx = { $executeRaw: execute, $queryRaw: query } as unknown as DefinitionTransaction;
    await retainNativeDefinitionRequest(tx, binding, "native-operation", request);
    await expect(
      retainNativeDefinitionRequest(
        tx,
        binding,
        "native-operation",
        nativeRequestFixture(binding, 10),
      ),
    ).rejects.toThrow();
    expect(execute.mock.calls).toHaveLength(2); // unchanged insert/do-nothing, never another native reservation or send
  });
});
