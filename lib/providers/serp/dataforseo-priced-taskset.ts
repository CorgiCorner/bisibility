import { PricedRequest } from "@usagekit/providers";

const TASK_POST_URL = "https://api.dataforseo.com/v3/serp/google/organic/task_post";

/** Recompose one provider batch exclusively from its individually admitted snapshots. */
export function pricedTasksetBody(
  requests: readonly PricedRequest[],
  expected: readonly unknown[],
): unknown[] {
  if (requests.length !== expected.length || !requests.length)
    throw new Error("Incomplete priced taskset");
  const operations = new Set<string>();
  return requests.map((request, index) => {
    if (
      !(request instanceof PricedRequest) ||
      request.admission.outcome !== "reserved" ||
      request.url !== TASK_POST_URL ||
      request.method !== "POST" ||
      request.auth.kind !== "basic" ||
      request.headers["content-type"] !== "application/json" ||
      !request.body ||
      operations.has(request.input.operationId)
    )
      throw new Error("Invalid admitted taskset request");
    operations.add(request.input.operationId);
    const body: unknown = JSON.parse(new TextDecoder().decode(request.body));
    if (
      !Array.isArray(body) ||
      body.length !== 1 ||
      JSON.stringify(body[0]) !== JSON.stringify(expected[index])
    )
      throw new Error("Priced taskset order or payload changed");
    return body[0];
  });
}
