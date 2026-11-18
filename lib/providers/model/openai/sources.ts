import type { ModelConsultedSources } from "@/lib/model-playground/types";
import { MODEL_CONSULTED_SOURCE_LIMIT } from "@/lib/providers/model/transport-contract";
import { z } from "zod";
import { sourceReference } from "./citations";
import { type NativeEnvelope, nativeSearchCallSchema } from "./native-schema";

const urlSource = z.object({ type: z.literal("url"), url: z.string().max(2048) });

export function consultedSources(
  response: NativeEnvelope,
  searchEnabled: boolean,
): ModelConsultedSources | undefined {
  const calls = response.output.filter(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      "type" in item &&
      item.type === "web_search_call",
  );
  if (!searchEnabled && calls.length === 0) return undefined;
  const distinct = new Map<string, ModelConsultedSources["sources"][number]>();
  let complete = response.status === "completed" && calls.length > 0;
  let rejected = false;
  for (const item of calls) {
    const parsed = nativeSearchCallSchema.safeParse(item);
    if (!parsed.success) {
      complete = false;
      rejected = true;
      continue;
    }
    const call = parsed.data;
    if (call.status !== "completed" || call.action?.type !== "search") complete = false;
    if (call.action?.type !== "search") continue;
    if (call.action.sources === undefined) complete = false;
    for (const source of call.action.sources ?? []) {
      try {
        const reference = sourceReference(urlSource.parse(source).url);
        // The documented source entry has no title field.
        if (!distinct.has(reference.url))
          distinct.set(reference.url, { ...reference, title: null });
      } catch {
        complete = false;
        rejected = true;
      }
    }
  }
  const sources = [...distinct.values()].slice(0, MODEL_CONSULTED_SOURCE_LIMIT);
  return {
    sources,
    total: complete ? distinct.size : null,
    omitted: complete ? distinct.size - sources.length : null,
    truncated: rejected || distinct.size > sources.length,
  };
}
