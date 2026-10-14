import { bindingSchema } from "@/lib/measurement-definitions/storage";
import { assertObservationOriginalBinding } from "@/lib/observation/persist-definition";
import { organicDomainRanksFromRaw } from "@/lib/rank-check/organic-ranks";
import { z } from "zod";
import type { ReplaySource } from "./model";

const scope = z.object({ location: z.string(), language: z.string(), device: z.string() });
const evidence = z
  .object({
    version: z.literal(1),
    adapterVersion: z.string(),
    observedAt: z.iso.datetime().nullable(),
    requestedAt: z.iso.datetime().nullable(),
    targetRevision: z.string().nullable().optional(),
    policyRevision: z.string().nullable().optional(),
    completeThrough: z.partialRecord(
      z.enum(["organic_result", "local_pack", "ai_overview", "map_listing", "listing"]),
      z.number().nullable(),
    ),
  })
  .passthrough();
const retainedSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  rankCheckId: z.string(),
  provider: z.string(),
  surface: z.literal("web_serp"),
  engine: z.literal("google"),
  configuredScope: scope,
  createdAt: z.string(),
  requestPolicy: z
    .object({
      depth: z.number().int().positive(),
      stopOnMatch: z.boolean(),
      findTargetsIn: z.string().nullable().optional(),
      forcedAiOverview: z.literal(false),
      evidence,
    })
    .passthrough(),
  binding: z.object({ capturedAt: z.string() }).passthrough(),
  items: z.array(
    z.object({
      id: z.string(),
      ordinal: z.number().int().nonnegative(),
      resultKind: z.string(),
      rankGroup: z.number().int().nullable(),
      domain: z.string().nullable(),
      observedAt: z.string().nullable(),
    }),
  ),
});
/** Existing normalized facts can survive raw TTL. This never creates a new observation or invents its missing proof. */
export function retainedOrganicReplay(source: ReplaySource, projectId: string) {
  try {
    const run = retainedSchema.parse(source.observation);
    const binding = bindingSchema.parse({
      ...run.binding,
      capturedAt: new Date(run.binding.capturedAt),
    });
    if (
      run.rankCheckId !== source.checkId ||
      binding.keywordId !== source.keywordId ||
      run.provider !== source.provider ||
      binding.projectId !== projectId ||
      run.projectId !== projectId
    )
      return null;
    const proof = assertObservationOriginalBinding(binding, projectId, source.checkId, {
      provider: run.provider,
      surface: "web_serp",
      engine: "google",
      configuredScope: run.configuredScope,
      completeness: "unknown",
      requestPolicy: run.requestPolicy,
      items: [],
      executedAt: new Date(run.createdAt),
    });
    if (
      proof.targetRevision !== binding.targetRevision ||
      proof.policyRevision !== binding.policyRevision
    )
      return null;
    if (
      new Set(run.items.map((item) => item.id)).size !== run.items.length ||
      new Set(run.items.map((item) => item.ordinal)).size !== run.items.length
    )
      return null;
    const facts = organicDomainRanksFromRaw({
      organic_results: run.items
        .filter((item) => item.resultKind === "organic_result")
        .map((item) => ({ domain: item.domain, rank: item.rankGroup })),
    });
    return { facts: facts ?? [], observedAt: proof.observedAt };
  } catch {
    return null;
  }
}
