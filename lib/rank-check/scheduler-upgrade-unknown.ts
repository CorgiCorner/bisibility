import type { RankCheckScheduleInventory } from "./temporal-schedule-retirement";

export type UnknownUpgradeSchedule = {
  id: string;
  reason: "keyword_missing" | "project_mismatch" | "ambiguous_ownership";
  paused: boolean;
  commands: { describe: string; pause: string; delete: string };
};
export type SchedulerUpgradeInventory = RankCheckScheduleInventory & {
  unknownSchedules?: UnknownUpgradeSchedule[];
};

export function unknownUpgradeSchedule(
  id: string,
  reason: UnknownUpgradeSchedule["reason"],
  paused: boolean,
  namespace?: string,
): UnknownUpgradeSchedule {
  const quoted = `'${id.replaceAll("'", "'\\''")}'`;
  const target = namespace ? `'${namespace.replaceAll("'", "'\\''")}'` : '"$TEMPORAL_NAMESPACE"';
  const prefix = `temporal --address "$TEMPORAL_ADDRESS" --namespace ${target} schedule`;
  return {
    id,
    reason,
    paused,
    commands: {
      describe: `${prefix} describe --schedule-id ${quoted}`,
      pause: `${prefix} toggle --schedule-id ${quoted} --pause --reason 'Reviewed offline scheduler upgrade'`,
      delete: `${prefix} delete --schedule-id ${quoted}`,
    },
  };
}

export function requireExactUpgradeInventory(
  inventory: SchedulerUpgradeInventory,
  acceptPausedUnknown: boolean,
) {
  const acknowledged = new Set(
    acceptPausedUnknown
      ? inventory.unknownSchedules
          ?.filter((row) => row.reason === "keyword_missing" && row.paused)
          .map((row) => row.id)
      : [],
  );
  if (inventory.failed || inventory.ambiguousIds.some((id) => !acknowledged.has(id))) {
    throw new Error(
      "Cannot upgrade an incomplete or ambiguous Schedule inventory. Run --list-unknown; inspect ownership and pause or delete only reviewed schedules. Paused deleted-keyword schedules require --accept-paused-unknown.",
    );
  }
}
