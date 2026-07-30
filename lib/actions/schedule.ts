"use server";

import { updateDefaultRankCheckSettings } from "./settings";

// Backwards-compatible alias. A direct re-export is illegal in a "use server" file
// (only async functions may be exported), so wrap it in an async function.
export async function updateProjectSchedule(
  ...args: Parameters<typeof updateDefaultRankCheckSettings>
): ReturnType<typeof updateDefaultRankCheckSettings> {
  return updateDefaultRankCheckSettings(...args);
}
