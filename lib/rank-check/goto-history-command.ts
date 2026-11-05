import type { GotoHistoryRepairCounts } from "./goto-history-repair";

export type GotoHistoryCommand =
  | { apply: boolean; checkIds?: string[]; error?: undefined; limit: number }
  | { error: string };

export function parseGotoHistoryCommand(argv: readonly string[]): GotoHistoryCommand {
  let apply = false;
  let limit = 25;
  let checkIds: string[] | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--limit") {
      limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--check-ids") {
      checkIds = (argv[index + 1] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      index += 1;
      continue;
    }
    return { error: "Unknown argument." };
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    return { error: "Limit must be an integer from 1 to 100." };
  return { apply, checkIds, limit };
}
export function gotoHistoryCommandExitCode(
  result: Pick<GotoHistoryRepairCounts, "eligible" | "failed" | "mode">,
) {
  return result.mode === "apply" && result.eligible > 0 && result.failed === result.eligible
    ? 1
    : 0;
}
