"use server";

import { parsePublicId } from "@/lib/db/public-id";
import {
  ComparisonPreviewRejectedError,
  launchProviderComparison,
  previewProviderComparison,
  readLatestProviderComparison,
  readProviderComparison,
} from "@/lib/provider-comparison/service";
import { loadComparisonContext } from "@/lib/provider-comparison/source";
import type { ComparisonRun } from "@/lib/provider-comparison/types";
import { z } from "zod";
import { getActionActor, requireKeywordScope, requireProjectScope } from "./_shared";

const scopeSchema = z.object({ projectRef: z.string().max(80), keywordRef: z.string().max(80) });
const launchSchema = scopeSchema
  .extend({
    previewId: z.uuid(),
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    requestKey: z.uuid(),
  })
  .strict();
const readSchema = scopeSchema.extend({ runId: z.uuid() }).strict();

async function scope(input: z.infer<typeof scopeSchema>, write: boolean) {
  if (
    parsePublicId(input.projectRef)?.prefix !== "prj" ||
    parsePublicId(input.keywordRef)?.prefix !== "kw"
  )
    throw new Error("Invalid comparison scope.");
  const actor = await getActionActor();
  const action = write ? "update" : "read";
  const project = await requireProjectScope(actor, action, input.projectRef, { type: "keyword" });
  const keyword = await requireKeywordScope(actor, action, input.keywordRef);
  if (keyword.projectId !== project.id) throw new Error("Invalid comparison scope.");
  return { actorId: actor.id, projectId: project.id, keywordId: keyword.id };
}

function publicRun(run: ComparisonRun | null, keywordId: string, keywordRef: string) {
  if (!run) return null;
  if (run.keyword.id !== keywordId) throw new Error("Invalid comparison scope.");
  return { ...run, keyword: { ...run.keyword, id: keywordRef } };
}

export async function loadProviderComparisonAction(input: unknown) {
  try {
    const parsed = scopeSchema.strict().parse(input);
    const authorized = await scope(parsed, false);
    const [context, run] = await Promise.all([
      loadComparisonContext(authorized.projectId, authorized.keywordId),
      readLatestProviderComparison(authorized),
    ]);
    return {
      ok: true as const,
      context: { ...context, keyword: { ...context.keyword, id: parsed.keywordRef } },
      run: publicRun(run, authorized.keywordId, parsed.keywordRef),
    };
  } catch {
    return { ok: false as const };
  }
}

export async function previewProviderComparisonAction(input: unknown) {
  try {
    const parsed = scopeSchema.strict().parse(input);
    const authorized = await scope(parsed, true);
    const preview = await previewProviderComparison(authorized);
    return {
      ok: true as const,
      preview: { ...preview, keyword: { ...preview.keyword, id: parsed.keywordRef } },
    };
  } catch {
    return { ok: false as const };
  }
}

export async function launchProviderComparisonAction(input: unknown) {
  try {
    const parsed = launchSchema.parse(input);
    const authorized = await scope(parsed, true);
    const run = await launchProviderComparison({
      ...authorized,
      previewId: parsed.previewId,
      previewHash: parsed.previewHash,
      requestKey: parsed.requestKey,
    });
    return { ok: true as const, run: publicRun(run, authorized.keywordId, parsed.keywordRef) };
  } catch (error) {
    return {
      ok: false as const,
      reason:
        error instanceof ComparisonPreviewRejectedError
          ? ("preview_changed" as const)
          : ("unconfirmed" as const),
    };
  }
}

export async function readProviderComparisonAction(input: unknown) {
  try {
    const parsed = readSchema.parse(input);
    const authorized = await scope(parsed, false);
    const run = await readProviderComparison({ ...authorized, runId: parsed.runId });
    return { ok: true as const, run: publicRun(run, authorized.keywordId, parsed.keywordRef) };
  } catch {
    return { ok: false as const };
  }
}
