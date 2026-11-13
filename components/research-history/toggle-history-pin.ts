"use client";

import {
  pinResearchHistoryAction,
  unpinResearchHistoryAction,
} from "@/lib/actions/research-history-pins";
import type { ResearchHistorySurface } from "@/lib/research-history/contract";

export async function toggleHistoryPin(
  projectRef: string,
  surface: ResearchHistorySurface,
  itemKey: string,
  pinned: boolean,
) {
  const action = pinned ? pinResearchHistoryAction : unpinResearchHistoryAction;
  const result = await action({ itemKey, projectRef, surface });
  return result.ok;
}
