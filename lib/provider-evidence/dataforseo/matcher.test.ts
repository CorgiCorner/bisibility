import { describe, expect, it } from "vitest";
import { ORGANIC_LIVE_PATH } from "./capabilities";
import { candidate, payload, scope } from "./fixtures.test-support";
import { matchHistoryTask } from "./matcher";

const retained = { nativeTag: payload.tag, endpointPath: scope.submittedEndpointPath, payload };

describe("unique tag and canonical submitted payload (AD-3)", () => {
  it("matches queued Task GET metadata for the retained submission", () => {
    const submitted = {
      depth: 50,
      device: "mobile",
      find_targets_in: ["organic"],
      keyword: "learn to surf at an older age",
      language_code: "en",
      location_name: "United States",
      priority: 2,
      search_param: "&nfpr=1",
      stop_crawl_on_match: [{ match_type: "with_subdomains", match_value: "swellsurfcamp.com" }],
      tag: "app=bisibility;stage=prod;src=app;trg=scheduled;f=rank_check;p=fixture;c=qtask_fixture",
    };
    const submission = {
      nativeTag: submitted.tag,
      endpointPath: scope.submittedEndpointPath,
      payload: submitted,
    };
    const metadata = {
      api: "serp",
      function: "task_get",
      se: "google",
      se_type: "organic",
      ...submitted,
      os: "android",
    };
    const task = candidate({ tag: submitted.tag, metadata });
    expect(matchHistoryTask(submitted.tag, submission, [task])).toEqual({ kind: "match", task });
    for (const change of [
      { depth: 10 },
      { keyword: "different" },
      { function: "live" },
      { function: "task_ready" },
      { se: "bing" },
    ]) {
      expect(
        matchHistoryTask(submitted.tag, submission, [
          { ...task, metadata: { ...metadata, ...change } },
        ]),
      ).toEqual({ kind: "no_match" });
    }
    expect(
      matchHistoryTask(submitted.tag, submission, [
        { ...task, metadata: { ...metadata, function: "task_post" } },
      ]),
    ).toMatchObject({ kind: "match" });
  });

  it("matches the exact submission, tolerating only object key order", () => {
    const task = candidate({ metadata: Object.fromEntries(Object.entries(payload).reverse()) });
    expect(matchHistoryTask(payload.tag, retained, [task])).toEqual({ kind: "match", task });
  });

  it.each([
    { depth: 10 },
    { language_code: "pl" },
    { priority: 1 },
    { device: "mobile" },
    { search_param: "" },
    { location_code: 2616 },
    { keyword: "RETAINED KEYWORD" },
    { stop_crawl_on_match: [{ match_type: "exact", match_value: "example.org" }] },
    { stop_crawl_on_match: [{ match_type: "with_subdomains", match_value: "other.org" }] },
    { find_targets_in: ["paid"] },
    { language_code: undefined },
  ])("rejects the same tag with different payload %s", (change) => {
    expect(
      matchHistoryTask(payload.tag, retained, [candidate({ metadata: { ...payload, ...change } })]),
    ).toEqual({ kind: "no_match" });
  });

  it("rejects a different endpoint, missing stop options and name/code substitution", () => {
    expect(
      matchHistoryTask(payload.tag, retained, [
        candidate({ endpointPath: "/v3/serp/google/organic/live/advanced" }),
      ]),
    ).toEqual({ kind: "no_match" });
    const { stop_crawl_on_match: _stop, find_targets_in: _targets, ...withoutStop } = payload;
    expect(matchHistoryTask(payload.tag, retained, [candidate({ metadata: withoutStop })])).toEqual(
      { kind: "no_match" },
    );
    expect(
      matchHistoryTask(payload.tag, { ...retained, payload: withoutStop }, [candidate()]),
    ).toEqual({ kind: "no_match" });
    const { location_code: _location, ...withoutCode } = payload;
    expect(
      matchHistoryTask(payload.tag, retained, [
        candidate({ metadata: { ...withoutCode, location_name: "United States" } }),
      ]),
    ).toEqual({ kind: "no_match" });
  });

  it("rejects extra submitted options and contradictory routing metadata", () => {
    for (const extra of [{ os: "linux" }, { function: "live" }, { se: "bing" }]) {
      expect(
        matchHistoryTask(payload.tag, retained, [
          candidate({ metadata: { ...payload, ...extra } }),
        ]),
      ).toEqual({ kind: "no_match" });
    }
    const metadata = {
      ...payload,
      api: "serp",
      se: "google",
      se_type: "organic",
      function: "task_post",
    };
    expect(matchHistoryTask(payload.tag, retained, [candidate({ metadata })])).toMatchObject({
      kind: "match",
    });
  });

  it.each([
    ["desktop", "windows"],
    ["mobile", "android"],
  ])("allows only the documented omitted OS default for %s", (device, os) => {
    const submission = { ...retained, payload: { ...payload, device } };
    const task = candidate({ metadata: { ...submission.payload, os } });
    expect(matchHistoryTask(payload.tag, submission, [task])).toEqual({ kind: "match", task });
  });

  it("never substitutes an OS default for an explicitly submitted OS", () => {
    const submission = { ...retained, payload: { ...payload, os: "macos" } };
    expect(
      matchHistoryTask(payload.tag, submission, [
        candidate({ metadata: { ...payload, os: "windows" } }),
      ]),
    ).toEqual({ kind: "no_match" });
    expect(
      matchHistoryTask(payload.tag, retained, [
        candidate({ metadata: { ...payload, os: "macos" } }),
      ]),
    ).toEqual({ kind: "no_match" });
  });

  it("fails closed on missing retained payload or required canonical fields", () => {
    expect(matchHistoryTask(payload.tag, null, [candidate()])).toEqual({
      kind: "missing_retained_payload",
    });
    for (const key of [
      "keyword",
      "depth",
      "language_code",
      "location_code",
      "device",
      "priority",
      "search_param",
    ]) {
      const incomplete: Record<string, unknown> = { ...payload };
      delete incomplete[key];
      expect(
        matchHistoryTask(payload.tag, { ...retained, payload: incomplete }, [candidate()]),
      ).toEqual({ kind: "missing_retained_payload" });
    }
  });

  it("rejects two same-tag candidates even when only one has the right payload", () => {
    expect(
      matchHistoryTask(payload.tag, retained, [
        candidate(),
        candidate({ id: "task-2", metadata: { ...payload, depth: 10 } }),
      ]),
    ).toEqual({ kind: "ambiguous" });
  });

  it("never binds a keyword or timestamp match without the exact tag", () => {
    expect(
      matchHistoryTask(payload.tag, retained, [
        candidate({ tag: null }),
        candidate({ tag: "other" }),
      ]),
    ).toEqual({ kind: "no_match" });
    expect(matchHistoryTask(payload.tag, retained, [candidate({ metadata: null })])).toEqual({
      kind: "no_match",
    });
  });
});

describe("live priority is not applicable; queued priority stays exact", () => {
  const { priority: _priority, ...livePayload } = payload;
  const live = { nativeTag: payload.tag, endpointPath: ORGANIC_LIVE_PATH, payload: livePayload };
  const task = candidate({
    endpointPath: ORGANIC_LIVE_PATH,
    function: "live",
    metadata: { ...livePayload, function: "live" },
  });

  it("matches live metadata without priority and with documented OS defaults", () => {
    expect(matchHistoryTask(payload.tag, live, [task])).toEqual({ kind: "match", task });
    for (const [device, os] of [
      ["desktop", "windows"],
      ["mobile", "android"],
    ]) {
      const submission = { ...live, payload: { ...livePayload, device } };
      expect(
        matchHistoryTask(payload.tag, submission, [
          {
            ...task,
            metadata: { ...submission.payload, function: "live", os },
          },
        ]),
      ).toMatchObject({ kind: "match" });
    }
  });

  it.each([
    { keyword: "changed" },
    { location_code: 2616 },
    { device: "mobile" },
    { depth: 10 },
    { language_code: "pl" },
    { search_param: "" },
    { stop_crawl_on_match: [] },
    { find_targets_in: ["paid"] },
    { priority: 1 },
    { priority: 2 },
    { priority: null },
    { priority: undefined },
    { function: "task_post" },
    { function: "task_get" },
  ])("rejects live candidate difference %s", (change) => {
    expect(
      matchHistoryTask(payload.tag, live, [
        {
          ...task,
          metadata: { ...task.metadata, ...change },
        },
      ]),
    ).toEqual({ kind: "no_match" });
  });

  it("rejects priority even when both live payloads have it", () => {
    expect(
      matchHistoryTask(payload.tag, { ...live, payload }, [
        {
          ...task,
          metadata: { ...payload, function: "live" },
        },
      ]),
    ).toEqual({ kind: "missing_retained_payload" });
  });

  it("keeps duplicate live tags ambiguous and never falls back to keyword", () => {
    expect(matchHistoryTask(payload.tag, live, [task, { ...task, id: "other" }])).toEqual({
      kind: "ambiguous",
    });
    expect(matchHistoryTask(payload.tag, live, [{ ...task, tag: null }])).toEqual({
      kind: "no_match",
    });
  });

  it("rejects queued candidate priority absence and difference", () => {
    expect(matchHistoryTask(payload.tag, retained, [candidate({ metadata: livePayload })])).toEqual(
      { kind: "no_match" },
    );
    expect(
      matchHistoryTask(payload.tag, retained, [
        candidate({ metadata: { ...payload, priority: 1 } }),
      ]),
    ).toEqual({ kind: "no_match" });
    expect(
      matchHistoryTask(payload.tag, { ...retained, payload: livePayload }, [candidate()]),
    ).toEqual({ kind: "missing_retained_payload" });
  });
});
