import { readDemoConfig } from "@/lib/demo/config";

/** Grouped summaries ship with the UI; demo retains its notification fence. */
export function checkNotificationSummariesEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return readDemoConfig(env).kind === "disabled";
}
