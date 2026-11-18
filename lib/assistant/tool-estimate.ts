import type { NativeSessionPrincipal } from "@/lib/api/native-session";
import { dispatchAssistantReadTool } from "./tool-dispatch";

const estimateNames: Record<string, string> = {
  research_keywords: "estimate_keyword_research_cost",
  analyze_backlinks: "estimate_backlinks_cost",
  analyze_domain_overview: "estimate_domain_overview_cost",
  run_rank_check: "get_cost_estimate",
  create_prompt_tracker_run: "preview_prompt_tracker_run",
  retry_prompt_tracker_run: "preview_prompt_tracker_run",
};
function amount(value: unknown, depth = 0): number | null {
  if (depth > 4 || !value || typeof value !== "object" || Array.isArray(value)) return null;
  for (const [key, item] of Object.entries(value)) {
    if (
      ["estimated_cost_cents", "estimatedCostCents", "cost_cents", "costCents"].includes(key) &&
      typeof item === "number" &&
      Number.isSafeInteger(item) &&
      item >= 0
    )
      return item;
  }
  for (const item of Object.values(value)) {
    const found = amount(item, depth + 1);
    if (found !== null) return found;
  }
  return null;
}
export async function estimateAssistantTool(
  name: string,
  args: unknown,
  principal: NativeSessionPrincipal,
  projectPublicId: string,
  callId: string,
) {
  const estimate = estimateNames[name];
  if (!estimate) return null;
  try {
    const result = await dispatchAssistantReadTool(
      estimate,
      args,
      principal,
      projectPublicId,
      `${callId}:estimate`,
    );
    return result.ok ? amount(result.payload) : null;
  } catch {
    return null;
  }
}
