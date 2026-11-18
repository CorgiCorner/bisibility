"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { writeAudit } from "@/lib/auth/audit";
import { withCapacityFailure } from "@/lib/capacity/action";
import { setKeywordCadence } from "@/lib/rank-check/schedules/keyword-cadence";
import { withScheduleReviewActionResult } from "@/lib/schedules/action-result";
import { keywordCreateChange } from "@/lib/schedules/keyword-create-change";
import { commitKeywordCreate } from "@/lib/schedules/keyword-create-write";
import { addKeywordsSchema } from "@/lib/schemas/keyword";
import { splitScheduleReview } from "@/lib/schemas/schedule-review";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import { normalizeSchedule } from "./_schedule";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import { addKeywordsMatrixWithAnalytics } from "./keyword-analytics";
import {
  consumeSavedKeywords,
  createKeywordBatchSet,
  promotedSavedKeywordPairs,
  publicKeywordView,
  revalidateKeywords,
} from "./keyword-helpers";
import {
  keywordLocationResolverInput,
  resolveKeywordRows,
  uniqueLocationWarnings,
} from "./keyword-location";
import { linkCheckSchedule, resolveCheckSchedule } from "./keyword-schedule-assignment";
import { updateKeywordDetails } from "./keyword-update";

export async function addKeywordsMatrix(input: unknown) {
  return withScheduleReviewActionResult(() =>
    withCapacityFailure(async () => {
      return addKeywordsMatrixWithAnalytics(input);
    }),
  );
}

export async function addKeywords(input: unknown) {
  return withScheduleReviewActionResult(() =>
    withCapacityFailure(async () => {
      const { body, review } = splitScheduleReview(input);
      const data = parseActionInput(addKeywordsSchema, body);
      const actor = await getActionActor();
      const project = await requireProjectScope(actor, "create", data.projectId, {
        type: "keyword",
      });
      const schedule = data.schedule ? normalizeSchedule(data.schedule) : null;
      const rows = data.rows;
      if (rows?.length) {
        const resolvedRows = await resolveKeywordRows(rows, project.id);
        const keywords = await commitKeywordCreate(
          project.id,
          actor,
          keywordCreateChange(data),
          review,
          async (tx, admission) => {
            const assigned = await resolveCheckSchedule(tx, project.id, data.checkScheduleId);
            const persisted = await createKeywordBatchSet(
              tx,
              project.id,
              resolvedRows.map(({ resolved, row }) => ({
                device: row.device,
                keyword: row.keyword,
                location: denormalizedLocationLabel(resolved.location),
                locationId: resolved.location.id,
                schedule,
                tags: row.tags,
                targetUrl: row.targetUrl,
                topic: row.topic,
                intent: row.intent,
              })),
            );
            const promotedPairs = persisted.accepted.flatMap(({ keyword }, index) => {
              const resolved = resolvedRows[index]?.resolved;
              return resolved
                ? promotedSavedKeywordPairs([keyword], resolved.location.canonicalKey)
                : [];
            });
            const created = persisted.created;
            const assignmentRows = [...created, ...persisted.restored];
            if (assigned)
              await linkCheckSchedule(tx, project.id, assigned, assignmentRows, admission);
            else if (schedule)
              await setKeywordCadence(
                tx,
                project.id,
                assignmentRows.map(({ id }) => id),
                schedule,
                actor.id,
                "schedule",
                admission,
              );
            const targetKeyword = created.length === 1 ? created[0] : null;
            await writeAudit(
              {
                action: "keyword.batch_add",
                actorId: actor.id,
                after: {
                  checkScheduleId: assigned?.publicId ?? null,
                  keywordIds: created.map((keyword) => keyword.publicId),
                  rows: rows.map((row) => ({
                    device: row.device,
                    keyword: row.keyword,
                    location: row.locationKey ?? row.location,
                    tags: row.tags,
                    targetUrl: row.targetUrl ?? null,
                    topic: row.topic ?? null,
                    intent: row.intent ?? null,
                  })),
                },
                projectId: project.id,
                targetId: targetKeyword?.publicId ?? project.publicId,
                targetType: targetKeyword ? "keyword" : "project",
              },
              tx,
            );
            const consumed = await consumeSavedKeywords(
              tx,
              project.id,
              data.consumeSavedIds,
              promotedPairs,
            );
            return {
              created,
              changed: persisted.created.length + persisted.restored.length + consumed > 0,
            };
          },
        );
        const warnings = uniqueLocationWarnings(resolvedRows);
        if (keywords.changed) recordAppAction(actor);
        revalidateKeywords();

        return {
          created: keywords.created.length,
          keywords: keywords.created.map(publicKeywordView),
          warning: warnings[0] ?? null,
          ...(warnings.length > 0 ? { warnings } : {}),
        };
      }
      // One location per batch (all keywords share the country/city); resolve once.
      const resolved = await resolveKeywordLocation(
        keywordLocationResolverInput({
          city: data.city,
          location: data.location,
          locationKey: data.locationKey,
          projectId: project.id,
        }),
      );
      const keywordText = data.keywords ?? [];
      const keywords = await commitKeywordCreate(
        project.id,
        actor,
        keywordCreateChange(data),
        review,
        async (tx, admission) => {
          const assigned = await resolveCheckSchedule(tx, project.id, data.checkScheduleId);
          const persisted = await createKeywordBatchSet(
            tx,
            project.id,
            keywordText.map((keyword) => ({
              device: data.device,
              keyword,
              location: denormalizedLocationLabel(resolved.location),
              locationId: resolved.location.id,
              schedule,
              tags: data.tags,
              targetUrl: data.targetUrl,
              topic: data.topic,
              intent: data.intent,
            })),
          );
          const created = persisted.created;
          const assignmentRows = [...created, ...persisted.restored];
          if (assigned)
            await linkCheckSchedule(tx, project.id, assigned, assignmentRows, admission);
          else if (schedule)
            await setKeywordCadence(
              tx,
              project.id,
              assignmentRows.map(({ id }) => id),
              schedule,
              actor.id,
              "schedule",
              admission,
            );
          const targetKeyword = created.length === 1 ? created[0] : null;
          await writeAudit(
            {
              action: "keyword.batch_add",
              actorId: actor.id,
              after: {
                checkScheduleId: assigned?.publicId ?? null,
                keywordIds: created.map((keyword) => keyword.publicId),
                intent: data.intent ?? null,
                tags: data.tags,
                targetUrl: data.targetUrl ?? null,
                topic: data.topic ?? null,
              },
              projectId: project.id,
              targetId: targetKeyword?.publicId ?? project.publicId,
              targetType: targetKeyword ? "keyword" : "project",
            },
            tx,
          );
          const consumed = await consumeSavedKeywords(
            tx,
            project.id,
            data.consumeSavedIds,
            promotedSavedKeywordPairs(
              persisted.accepted.map(({ keyword }) => keyword),
              resolved.location.canonicalKey,
            ),
          );

          return {
            created,
            changed: persisted.created.length + persisted.restored.length + consumed > 0,
          };
        },
      );

      if (keywords.changed) recordAppAction(actor);
      revalidateKeywords();

      return {
        created: keywords.created.length,
        keywords: keywords.created.map(publicKeywordView),
        warning: resolved.warning,
      };
    }),
  );
}

export async function updateKeyword(input: unknown) {
  return updateKeywordDetails(input);
}
