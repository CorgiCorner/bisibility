import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { z } from "zod";

type Sample = "positive" | "missing_time" | "other_cid";
const taskBody = z.array(z.record(z.string(), z.unknown())).length(1);
/** Synthetic documented task shapes. Every GET must name its own actually accepted POST UUID. */
export function acceptanceTransport() {
  const originals = new Map<string, Record<string, unknown>>();
  const samples = new Map<string, Sample>();
  let posts = 0,
    gets = 0;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    if (url.origin !== "https://api.dataforseo.com")
      throw new Error("Unexpected synthetic acceptance transport destination.");
    if (request.method === "POST" && url.pathname === "/v3/serp/google/maps/task_post") {
      const [body] = taskBody.parse(await request.json());
      const id = randomUUID();
      originals.set(id, body);
      posts += 1;
      return Response.json({
        status_code: 20000,
        tasks_count: 1,
        cost: 0.0006,
        tasks: [{ id, status_code: 20100, cost: 0.0006, result: null }],
      });
    }
    const id = url.pathname.split("/").at(-1),
      body = id ? originals.get(id) : null;
    if (
      request.method !== "GET" ||
      !id ||
      !body ||
      url.pathname !== `/v3/serp/google/maps/task_get/advanced/${id}`
    )
      throw new Error("Only the original accepted task GET is allowed.");
    gets += 1;
    const keyword = decodeURIComponent(String(body.keyword).replace(/\+/g, " "));
    const sample = samples.get(keyword) ?? "positive";
    return Response.json({
      status_code: 20000,
      tasks_count: 1,
      cost: 0,
      tasks: [
        {
          id,
          status_code: 20000,
          cost: 0,
          path: ["v3", "serp", "google", "maps", "task_get", "advanced", id],
          data: { ...body, api: "serp", function: "task_get", se: "google", se_type: "maps" },
          result_count: 1,
          result: [
            {
              type: "maps",
              keyword: body.keyword,
              ...(sample === "missing_time" ? {} : { datetime: new Date().toISOString() }),
              language_code: "en",
              spell: null,
              items_count: 1,
              items: [
                {
                  type: "maps_search",
                  rank_group: 3,
                  rank_absolute: 3,
                  cid: sample === "other_cid" ? "18446744073709551614" : "18446744073709551615",
                  title: "Synthetic retained branch",
                },
              ],
            },
          ],
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return {
    fetcher,
    sample: (keyword: string, value: Sample) => samples.set(keyword, value),
    counts: () => ({ posts, gets }),
  };
}
