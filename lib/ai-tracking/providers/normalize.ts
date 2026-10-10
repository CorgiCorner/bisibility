import type {
  CitationInput,
  Evidence,
  MeasurementState,
  SamplePlan,
} from "@/lib/ai-tracking/contract";
import { boundedRaw, boundedText } from "./bounds";
import { array, object, type TrackingEnvelope, taskOutcome, text } from "./envelope";

function citations(values: unknown): CitationInput[] {
  return array(values)
    .flatMap((value) => {
      const source = object(value);
      const url = text(source?.url);
      if (!url || !/^https?:\/\//i.test(url)) return [];
      return [
        {
          url: url.slice(0, 8192),
          title: text(source?.title)?.slice(0, 2048) ?? null,
          position: 0,
        },
      ];
    })
    .slice(0, 500)
    .map((citation, position) => ({ ...citation, position }));
}
function content(nodes: unknown): { answer: string[]; citations: CitationInput[] } {
  const answer: string[] = [];
  const cited: CitationInput[] = [];
  for (const value of array(nodes)) {
    const node = object(value);
    if (!node || node.type === "reasoning") continue;
    const body = text(node.text) ?? text(node.original_text) ?? text(node.markdown);
    if (body) answer.push(body);
    cited.push(
      ...citations(node.sources),
      ...citations(node.annotations),
      ...citations(node.references),
    );
    const nested = content(node.sections ?? node.items);
    answer.push(...nested.answer);
    cited.push(...nested.citations);
  }
  return { answer, citations: cited };
}
export function normalizeTrackingResponse(
  plan: SamplePlan,
  envelope: TrackingEnvelope,
  fetchedAt: string,
) {
  const outcome = taskOutcome(envelope);
  const task = envelope.tasks?.[0];
  const result = task?.result?.[0];
  const items = array(result?.items);
  const overview = items.filter((item) => object(item)?.type === "ai_overview");
  const nodes = plan.source === "google_aio" ? overview : items;
  const parsed = content(nodes);
  if (plan.source !== "google_aio" && !parsed.answer.length) {
    const body = text(result?.answer) ?? text(result?.text);
    if (body) parsed.answer.push(body);
  }
  const answer = boundedText(parsed.answer.join("\n\n"));
  const projection = boundedRaw({ status_code: task?.status_code ?? null, result: nodes });
  let measurement: MeasurementState = "unknown";
  if (outcome === "failed") measurement = "failed";
  else if (outcome === "ready" && result && Array.isArray(result.items)) {
    measurement = answer.value
      ? "answer_present"
      : plan.source === "google_aio" && !overview.length
        ? "aio_not_present"
        : "unavailable";
    if (
      answer.truncated ||
      (!answer.value && parsed.citations.length > 0) ||
      result.partial === true ||
      overview.some((item) => object(item)?.is_loaded === false)
    )
      measurement = "partial";
  }
  const observed = text(result?.datetime);
  const observedAt =
    observed && Number.isFinite(Date.parse(observed))
      ? new Date(observed).toISOString()
      : fetchedAt;
  const language = text(result?.language_code);
  const location = result?.location_code;
  const requestedLocale = text(plan.requestedParameters.language_code);
  const evidence: Evidence = {
    answerText: answer.value || null,
    answerTruncated: answer.truncated,
    raw: projection.value,
    rawTruncated: projection.truncated,
    searchResults:
      plan.source === "google_aio" ? [] : citations(result?.search_results ?? result?.se_results),
    requestedLocale,
    effectiveLocale: language,
    localeMechanism:
      plan.source === "model_api"
        ? "prompt_or_web_search_bias"
        : location != null
          ? "provider_location"
          : null,
    requestedModel: plan.requestedModel,
    actualModel: text(result?.model_name),
    providerStatus: task?.status_code?.toString() ?? null,
    observedAt,
    fetchedAt,
    recordedSource: "fresh",
  };
  const unique = new Map(parsed.citations.map((citation) => [citation.url, citation]));
  return {
    evidence,
    measurement,
    citations: [...unique.values()].map((citation, position) => ({ ...citation, position })),
  };
}
