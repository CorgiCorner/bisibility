import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { CheckStatusChip } from "@/components/ui";
import { relativePast } from "@/lib/format/relative-time";
import type { LastCheckStatus } from "@/lib/queries/keywords";

type LastCheckedCellProps = {
  lastCheckAt: string | null;
  now?: Date;
  status: LastCheckStatus;
};

const staleAfterMs = 7 * 24 * 60 * 60 * 1000;

function parsedDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function LastCheckedCell({
  lastCheckAt,
  now = new Date(),
  status,
}: Readonly<LastCheckedCellProps>) {
  const { readOnly } = useProjectWriteMode();
  if (readOnly) return <CheckStatusChip kind="pending" label="Paused - migration hold" />;
  if (status === "running") return <CheckStatusChip kind="running" label="Running" />;
  if (status === "failed") return <CheckStatusChip kind="failed" label="Failed" />;

  const date = parsedDate(lastCheckAt);
  if (!date) return <CheckStatusChip kind="pending" label="Awaiting first check" />;

  const label = relativePast(date, now);
  if (now.getTime() - date.getTime() > staleAfterMs) {
    return <CheckStatusChip kind="pending" label={label} />;
  }

  return <span className="font-mono text-[12px] font-semibold text-fg-muted">{label}</span>;
}
