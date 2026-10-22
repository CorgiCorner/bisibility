import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { setKeywordCadence } from "@/lib/rank-check/schedules/keyword-cadence";
import { addKeywordSchema } from "@/lib/schemas/keyword";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import { normalizeSchedule } from "./_schedule";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import {
  addTags,
  createKeywordBatchSet,
  publicKeywordView,
  revalidateKeywords,
} from "./keyword-helpers";
import { keywordLocationResolverInput } from "./keyword-location";

export async function addSingleKeyword(input: unknown) {
  const data = parseActionInput(addKeywordSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, { type: "keyword" });
  const schedule = data.schedule ? normalizeSchedule(data.schedule) : null;
  // Keep the legacy location string in sync so the composite unique still dedups.
  const resolved = await resolveKeywordLocation(
    keywordLocationResolverInput({
      city: data.city,
      location: data.location,
      locationKey: data.locationKey,
      projectId: project.id,
    }),
  );
  const locationName = denormalizedLocationLabel(resolved.location);
  const keyword = await prisma.$transaction(async (tx) => {
    const persisted = await createKeywordBatchSet(tx, project.id, [
      {
        device: data.device,
        keyword: data.keyword,
        location: locationName,
        locationId: resolved.location.id,
        schedule,
        tags: [],
        targetUrl: data.targetUrl,
        topic: data.topic,
        intent: data.intent,
      },
    ]);
    const created = persisted.created[0] ?? persisted.restored[0];
    const stored =
      created ??
      (await tx.keyword.findUnique({
        select: {
          id: true,
          intent: true,
          publicId: true,
          targetUrl: true,
          text: true,
          topic: true,
        },
        where: {
          projectId_text_locationId_device: {
            device: data.device,
            locationId: resolved.location.id,
            projectId: project.id,
            text: data.keyword,
          },
        },
      }));
    if (!stored) throw new Error("Keyword could not be created.");
    if (created && schedule)
      await setKeywordCadence(tx, project.id, [created.id], schedule, actor.id);

    await addTags(tx, project.id, [stored.id], data.tags);
    await writeAudit(
      {
        action: "keyword.add",
        actorId: actor.id,
        after: {
          intent: stored.intent,
          keywordId: stored.publicId,
          tags: data.tags,
          targetUrl: stored.targetUrl,
          text: stored.text,
          topic: stored.topic,
        },
        projectId: project.id,
        targetId: stored.publicId,
        targetType: "keyword",
      },
      tx,
    );
    return stored;
  });
  revalidateKeywords(keyword.publicId);

  return { ...publicKeywordView(keyword), warning: resolved.warning };
}
