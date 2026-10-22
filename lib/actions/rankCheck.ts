"use server";

import { manualRunCheckNow } from "@/lib/rank-check/manual-run";
import type { RunCheckNowResult } from "@/lib/rank-check/manual-run-result";

export type { RunCheckNowResult };

export async function runCheckNow(input: unknown): Promise<RunCheckNowResult> {
  return manualRunCheckNow(input);
}
