import { recordAppAction } from "@/lib/activity/app-mutation";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { assertKeywordIdentityUnchanged } from "@/lib/keywords/identity";
import { updateKeywordSchema } from "@/lib/schemas/keyword";
import { denormalizedLocationLabel } from "@/lib/serp/location-label";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import { getActionActor, parseActionInput, requireKeywordScope } from "./_shared";
import { addTags, publicKeywordView, revalidateKeywords } from "./keyword-helpers";
import { keywordLocationResolverInput } from "./keyword-location";
export async function updateKeywordDetails(input: unknown) {
  const data = parseActionInput(updateKeywordSchema, input);
  const actor = await getActionActor();
  const keyword = await requireKeywordScope(actor, "update", data.keywordId);
  const before = await prisma.keyword.findUnique({
    select: {
      device: true,
      intent: true,
      location: true,
      locationId: true,
      targetUrl: true,
      text: true,
      topic: true,
    },
    where: { id: keyword.id },
  });
  if (!before) throw new Error("Keyword not found.");
  // City-only edits resolve against the existing country string.
  const resolved =
    data.locationKey || data.location || data.city
      ? await resolveKeywordLocation(
          keywordLocationResolverInput({
            city: data.city,
            location: data.location ?? before.location,
            locationKey: data.locationKey,
            projectId: keyword.projectId,
          }),
        )
      : null;
  assertKeywordIdentityUnchanged(before, {
    device: data.device,
    locationId: resolved?.location.id,
    text: data.keyword,
  });
  const updated = await prisma.keyword.update({
    data: {
      device: data.device,
      location: resolved ? denormalizedLocationLabel(resolved.location) : data.location,
      locationId: resolved?.location.id,
      text: data.keyword,
      ...(data.targetUrl !== undefined ? { targetUrl: data.targetUrl } : {}),
      intent: data.intent,
      topic: data.topic,
    },
    select: { id: true, intent: true, publicId: true, targetUrl: true, text: true, topic: true },
    where: { id: keyword.id },
  });

  recordAppAction(actor);
  if (data.tags) {
    await prisma.keywordTag.deleteMany({ where: { keywordId: keyword.id } });
    await addTags(prisma, keyword.projectId, [keyword.id], data.tags);
  }

  await writeAudit({
    action: "keyword.update",
    actorId: actor.id,
    after: { ...updated, tags: data.tags },
    before,
    projectId: keyword.projectId,
    targetId: updated.publicId,
    targetType: "keyword",
  });
  revalidateKeywords(updated.publicId);

  return { ...publicKeywordView(updated), warning: resolved?.warning ?? null };
}
