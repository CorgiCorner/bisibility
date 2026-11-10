import { repairSerpUrls } from "../serp-url-repair/activity";
import type { SerpUrlRepairInput } from "./serp-url-repair-client";
export async function resolveSerpUrlsActivity(input: SerpUrlRepairInput & { runId: string }) {
  return repairSerpUrls(input);
}
