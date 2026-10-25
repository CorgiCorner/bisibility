import { expect, vi } from "vitest";
import { ORGANIC_POST_PATH } from "./capabilities";
import type { HistoryTask } from "./history";
import { createHistoryTransport } from "./transport";

export const now = new Date("2026-10-24T12:00:00Z");
export const scope = {
  provider: "dataforseo",
  feature: "rank_check",
  submittedEndpointPath: ORGANIC_POST_PATH,
} as const;
export const window = { ...scope, from: "2026-10-23T10:00:00Z", to: "2026-10-23T11:00:00Z" };
export const account = {
  accountId: "original",
  credentialVersion: "v1",
  login: "fixture",
  password: "synthetic",
};
export const payload = {
  tag: "unique-tag",
  keyword: "retained keyword",
  location_code: 2840,
  language_code: "en",
  device: "desktop",
  depth: 100,
  priority: 2,
  search_param: "&nfpr=1",
  find_targets_in: ["organic"],
  stop_crawl_on_match: [{ match_type: "with_subdomains", match_value: "example.org" }],
};
export function candidate(overrides: Partial<HistoryTask> = {}): HistoryTask {
  return {
    id: "task-1",
    tag: payload.tag,
    endpointPath: ORGANIC_POST_PATH,
    metadata: structuredClone(payload),
    costCents: null,
    function: "task_post",
    datetimePosted: window.from,
    datetimeDone: null,
    ...overrides,
  };
}
export function envelope(code = 20000, cost?: number) {
  return {
    status_code: 20000,
    tasks: [
      {
        id: "task-1",
        status_code: code,
        ...(cost === undefined ? {} : { cost }),
        result: [
          {
            items: [
              { type: "organic", rank_group: 1, url: "https://example.org" },
              { type: "organic", rank_group: 2 },
              { type: "paid", rank_group: 9 },
            ],
          },
        ],
      },
    ],
  };
}
export function page(rows: unknown[]) {
  return { status_code: 20000, tasks: [{ status_code: 20000, result: rows }] };
}
export function httpDouble(responses: Array<unknown | Response | Error>) {
  const violations: string[] = [];
  const send = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (
      (init?.method === "POST" && path !== "/v3/serp/id_list") ||
      path.includes("task_post") ||
      path.includes("/live/")
    ) {
      violations.push(`${init?.method} ${path}`);
      throw new Error("Paid recovery request planted");
    }
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (response instanceof Response) return response;
    return new Response(JSON.stringify(response), {
      headers: { "content-type": "application/json" },
    });
  });
  const limit = vi.fn(async () => null);
  const transport = createHistoryTransport(account, { fetch: send, limit });
  return { transport, send, limit, assertNoPaidRequests: () => expect(violations).toEqual([]) };
}
export async function collect<T>(generator: AsyncGenerator<T>) {
  const results: T[] = [];
  for await (const result of generator) results.push(result);
  return results;
}
