import { readBodyWithLimit } from "@/lib/http/bounded-body";
// Estimate-only POST bodies are inspected from a bounded clone, leaving the route's body untouched.
export async function isPracticeEstimate(request: Request, url: URL, operation: string) {
  if (
    url.searchParams.get("estimate_only") === "true" ||
    url.searchParams.get("estimate_only") === "1"
  )
    return true;
  if (
    request.method !== "POST" ||
    ![
      "analyzeDomainOverview",
      "getKeywordMetrics",
      "analyzeAiVisibility",
      "compareAiPrompts",
    ].includes(operation)
  )
    return false;
  try {
    const read = await readBodyWithLimit(request.clone(), 65536);
    if (!read.ok) return true;
    const value = JSON.parse(read.bytes.toString("utf8")) as { estimate_only?: unknown };
    return value.estimate_only === true;
  } catch {
    return true;
  }
}
