import "server-only";
import { normalizeSchedule } from "@/lib/actions/_schedule";
import { keywordLocationResolverInput } from "@/lib/actions/keyword-location";
import {
  deferredKeywordLocations,
  resolveLocationForReview,
} from "@/lib/api/deferred-keyword-location";
import { createCadenceJoins } from "@/lib/api/keyword-cadence-review";
import type { Prisma } from "@/lib/generated/prisma/client";
import { effectiveKeywordDepth } from "@/lib/rank-check/schedules/effective-keyword-depth";
import type { KeywordCreateChange } from "@/lib/schemas/keyword-create-review";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { scheduleNotFound } from "./errors";
import { cadenceIsActive, providerForPolicy, rankUnitCents } from "./review-cost";
import { resolveCreateSource } from "./review-create-source";
import {
  asCadence,
  idle,
  pack,
  projectSerpProviderId,
  quote,
  rankSelect,
} from "./review-load-shared";

export type CreateReviewDb = Pick<
  Prisma.TransactionClient,
  | "keyword"
  | "projectMarket"
  | "checkSchedule"
  | "projectDefaults"
  | "providerConnection"
  | "location"
>;

/** Read-only resolution also gives future public preview callers the canonical signed shape. */
export async function loadCreateKeywords(
  client: CreateReviewDb,
  projectId: string,
  raw: KeywordCreateChange,
  now: Date,
) {
  const { input, snapshot } = await resolveCreateSource(client, projectId, raw);
  const deferred = deferredKeywordLocations(client);
  const tuples = new Map<
    string,
    {
      keyword: string;
      device: "desktop" | "mobile";
      locationKey: string;
      locationId: string;
      cadence?: KeywordCreateChange["cadence"];
    }
  >();
  for (const row of input.keywords) {
    const resolved = await resolveLocationForReview(
      keywordLocationResolverInput({
        ...row,
        location: row.location ?? "United States",
        projectId,
      }),
      deferred,
    );
    const next = {
      keyword: row.keyword,
      device: row.device,
      locationKey: resolved.location.canonicalKey,
      locationId: resolved.location.id,
      ...(row.cadence === undefined || input.scheduleId
        ? {}
        : {
            cadence: row.cadence
              ? (() => {
                  const { nextCheckAt: _, ...cadence } = normalizeSchedule(row.cadence, now);
                  return cadence;
                })()
              : null,
          }),
    };
    const key = JSON.stringify([next.keyword, next.locationKey, next.device]);
    if (!tuples.has(key)) tuples.set(key, next);
  }
  const rows = [...tuples.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, row]) => row);
  const change: KeywordCreateChange = {
    op: "keywords-create",
    ...(input.source ? { source: input.source } : {}),
    scheduleId: input.scheduleId,
    ...(input.allowPausedSchedule ? { allowPausedSchedule: true } : {}),
    cadence:
      input.scheduleId || !input.cadence
        ? null
        : (() => {
            const { nextCheckAt: _, ...cadence } = normalizeSchedule(input.cadence, now);
            return cadence;
          })(),
    keywords: rows.map(({ locationId: _, ...row }) => row),
  };
  const defaults = await client.projectDefaults.findUnique({
    where: { projectId },
    select: { serpDepth: true, timezone: true },
  });
  const projectDepth = resolveSerpDepth(defaults?.serpDepth);
  const timezone = defaults?.timezone ?? "UTC";
  const provider = await projectSerpProviderId(client, projectId);
  const target = input.scheduleId
    ? await client.checkSchedule.findFirst({
        where: {
          projectId,
          publicId: input.scheduleId,
          archivedAt: null,
          ...(input.allowPausedSchedule ? {} : { enabled: true }),
        },
        select: rankSelect,
      })
    : null;
  if (input.scheduleId && !target) throw scheduleNotFound();
  const existing = await client.keyword.findMany({
    where: {
      projectId,
      OR: rows.map((row) => ({
        text: row.keyword,
        device: row.device,
        locationId: row.locationId,
      })),
    },
    select: {
      id: true,
      text: true,
      device: true,
      locationId: true,
      archivedAt: true,
      measurementTargetEpoch: true,
      checkScheduleId: true,
      checkSchedule: { select: { serpDepth: true } },
      schedule: { select: { serpDepth: true } },
    },
  });
  const byTuple = new Map(
    existing.map((row) => [JSON.stringify([row.text, row.locationId, row.device]), row]),
  );
  const groups = rows.flatMap((row) => {
    const current = byTuple.get(JSON.stringify([row.keyword, row.locationId, row.device]));
    // Active duplicates are skipped by the batch creator. Restores join anew.
    if (!createCadenceJoins(current)) return [];
    const selected = row.cadence === undefined ? change.cadence : row.cadence;
    if (selected && !target) {
      const resolved = {
        ...selected,
        serpDepth: effectiveKeywordDepth(selected.serpDepth, current ?? {}),
      };
      const tuple = change.keywords.find(
        (item) =>
          item.keyword === row.keyword &&
          item.device === row.device &&
          item.locationKey === row.locationKey,
      );
      if (tuple) tuple.cadence = resolved;
    }
    const cadence = target
      ? asCadence(target, timezone)
      : selected
        ? {
            ...selected,
            publicId: "keywords-create",
            archived: false,
            enabled: selected.frequency !== "paused",
            timeOfDay:
              input.source?.kind === "market-create" &&
              input.source.input.schedule?.kind === "inline"
                ? (input.source.input.schedule.timeOfDay ?? "06:00")
                : null,
            serpDepth: effectiveKeywordDepth(selected.serpDepth, current ?? {}),
          }
        : null;
    const policy = target?.providerPolicy ?? null;
    return [
      {
        before: idle(),
        after: quote(
          cadence,
          1,
          rankUnitCents(
            resolveSerpDepth(cadence?.serpDepth ?? projectDepth),
            providerForPolicy(policy, provider),
          ),
        ),
        providerBefore: null,
        providerAfter: policy,
      },
    ];
  });
  const revisionParts = [
    ...(input.source ? [input.source, snapshot] : []),
    defaults,
    provider,
    target,
    ...rows.map((row) => {
      const current = byTuple.get(JSON.stringify([row.keyword, row.locationId, row.device]));
      return [row.keyword, row.locationKey, row.device, current ?? null];
    }),
  ];
  const loaded = pack(
    projectDepth,
    now,
    groups.some((group) => cadenceIsActive(group.after.cadence)) ? "assign" : "noop",
    idle(),
    groups[0]?.after ?? idle(),
    false,
    null,
    target?.providerPolicy ?? null,
    revisionParts,
    { kind: "keywords-create", change },
  );
  // Keep one group per keyword: its restored depth may differ from the other rows.
  const grouped = new Map<string, (typeof groups)[number]>();
  for (const group of groups) {
    const key = JSON.stringify(group.after);
    const prior = grouped.get(key);
    if (prior) prior.after.members += group.after.members;
    else grouped.set(key, { ...group, after: { ...group.after } });
  }
  loaded.spend.groups = [...grouped.values()];
  return { ...loaded, bindingChange: change };
}
