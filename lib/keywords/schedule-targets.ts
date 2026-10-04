import type { KeywordRow } from "@/lib/queries/keywords";

export function keywordScheduleTarget(row: KeywordRow) {
  return {
    device: row.device,
    id: row.id,
    location: `${row.location.displayName} / ${row.location.languageLabel ?? row.location.hl}`,
    schedule: row.checkSchedule ?? null,
  };
}
