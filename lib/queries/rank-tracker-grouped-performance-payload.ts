import {
  aggregateMarketGridRows,
  groupRow,
  type MarketGridGroupRow,
  type MarketGridTarget,
} from "@/lib/keywords/market-grid-model";
import { mapKeyword } from "@/lib/queries/keyword-row";
import {
  DATA_TABLE_PERF_PROJECT,
  type DataTablePerfFixture,
} from "./rank-tracker-grouped-performance-fixtures";

type SelectedMember = {
  id: string;
  marketStatus: "active" | "paused" | "removed";
  publicId: string;
};
export type GroupedPerformanceSelection = {
  groups: Array<{ members: SelectedMember[]; term: string }>;
};

function payloadTarget(
  fixture: DataTablePerfFixture,
  member: SelectedMember,
  targetIndex: number,
): MarketGridTarget {
  const target = fixture.targets.find((candidate) => candidate.id === member.id);
  if (!target)
    throw new Error(`Returned member is absent from the performance fixture: ${member.id}.`);
  if (target.publicId !== member.publicId)
    throw new Error(`Returned member public ID does not match the fixture: ${member.id}.`);
  const location = fixture.locations.find((candidate) => candidate.id === target.locationId);
  if (!location) throw new Error(`Fixture location is absent for returned member: ${member.id}.`);
  const schedule = fixture.schedules.find((candidate) => candidate.id === target.checkScheduleId);
  if (!schedule) throw new Error(`Fixture schedule is absent for returned member: ${member.id}.`);
  return {
    ...mapKeyword(
      {
        checkSchedule: { name: schedule.name, publicId: schedule.publicId },
        createdAt: new Date("2026-08-20T12:00:00.000Z"),
        device: target.device,
        id: target.id,
        intent: target.intent,
        location: location.displayName,
        locationRef: { ...location, languageLabel: location.hl.toUpperCase() },
        publicId: target.publicId,
        rankChecks: [...target.rankHistory].reverse().map((check, checkIndex) => ({
          checkedAt: new Date(check.checkedAt),
          errorCode: null,
          id: `${target.id}_payload_${checkIndex}`,
          normalizationVersion: "v1",
          position: check.position,
          previousPosition: check.previousPosition,
          provider: "fixture",
          rankingUrl: check.rankingUrl,
          requestedDepth: 100,
          status: "completed" as const,
        })),
        schedule: {
          cronExpression: null,
          frequency: target.schedule.frequency,
          jitterMinutes: 0,
          lastCheckedAt: new Date(target.schedule.lastCheckedAt),
          nextCheckAt: null,
          serpDepth: 100,
          timezone: target.schedule.timezone,
        },
        tags: target.tags.map((name) => ({ tag: { name } })),
        targetUrl: target.targetUrl,
        text: target.keyword,
        topic: target.topic,
      },
      { defaults: null, domain: DATA_TABLE_PERF_PROJECT.domain },
      { cpc: null, difficulty: 40, serpFeatures: ["image"], volume: 1_000 },
    ),
    marketStatus: member.marketStatus,
    registryOrder: targetIndex,
  } satisfies MarketGridTarget;
}

export function groupedPerformancePayload(
  fixture: DataTablePerfFixture,
  selection: GroupedPerformanceSelection,
): MarketGridGroupRow[] {
  let targetIndex = 0;
  return selection.groups.map((group) => {
    const members = group.members.map((member) => payloadTarget(fixture, member, targetIndex++));
    const aggregate = aggregateMarketGridRows(members, new Date("2026-09-05T12:00:00.000Z"))[0];
    if (!aggregate) throw new Error(`Returned group has no fixture members: ${group.term}.`);
    return groupRow(aggregate, aggregate.children);
  });
}
