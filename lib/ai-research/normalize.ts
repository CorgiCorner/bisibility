import { z } from "zod";
import { boundAiRow } from "./row-budget";
import type { AiResearchRow } from "./types";

const citation = z.object({ url: z.string(), title: z.string().nullish() }).passthrough();
const observed = z
  .object({
    question: z.string(),
    answer: z.string(),
    model_name: z.string(),
    datetime: z.string().nullish(),
    date: z.string().nullish(),
    sources: z.array(citation).nullish(),
  })
  .passthrough();
const section = z
  .object({ text: z.string().optional(), annotations: z.array(citation).optional() })
  .passthrough();
const response = z
  .object({
    model_name: z.string(),
    datetime: z.string().nullish(),
    items: z.array(z.object({ sections: z.array(section).optional() }).passthrough()),
  })
  .passthrough();

export function safeCitationUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function citedDomain(value: string, domain: string) {
  const safe = safeCitationUrl(value);
  if (!safe) return false;
  const host = new URL(safe).hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}
function row(
  input: {
    prompt: string;
    answer: string;
    model: string;
    datetime?: string | null;
    citations: z.infer<typeof citation>[];
  },
  target: { brand: string; domain: string },
): AiResearchRow {
  const domainCited = input.citations.some((item) => citedDomain(item.url, target.domain));
  const prioritized = [...input.citations].sort(
    (left, right) =>
      Number(citedDomain(right.url, target.domain)) - Number(citedDomain(left.url, target.domain)),
  );
  const seen = new Set<string>();
  const citations = prioritized.slice(0, 5).flatMap((item) => {
    const url = safeCitationUrl(item.url);
    if (!url || url.length > 500 || seen.has(url)) return [];
    seen.add(url);
    return [
      {
        title: (item.title ?? new URL(url).hostname).slice(0, 200),
        url,
        targetDomain: citedDomain(url, target.domain),
      },
    ];
  });
  return boundAiRow({
    prompt: input.prompt.slice(0, 500),
    answer: input.answer.slice(0, 4000),
    model: input.model.slice(0, 120),
    observedAt: input.datetime?.slice(0, 64) ?? null,
    brandMentioned: input.answer.toLocaleLowerCase().includes(target.brand.toLocaleLowerCase()),
    domainCited,
    citations,
    contentTruncated:
      input.answer.length > 4000 ||
      input.prompt.length > 500 ||
      input.citations.length > citations.length,
  });
}
export function observedRow(value: unknown, target: { brand: string; domain: string }) {
  const item = observed.parse(value);
  return row(
    {
      prompt: item.question,
      answer: item.answer,
      model: item.model_name,
      datetime: item.datetime ?? item.date,
      citations: item.sources ?? [],
    },
    target,
  );
}
export function promptRow(
  value: unknown,
  target: { brand: string; domain: string; prompt: string },
) {
  const item = response.parse(value);
  const sections = item.items.flatMap((entry) => entry.sections ?? []);
  return row(
    {
      prompt: target.prompt,
      answer: sections.map((entry) => entry.text ?? "").join("\n"),
      model: item.model_name,
      datetime: item.datetime,
      citations: sections.flatMap((entry) => entry.annotations ?? []),
    },
    target,
  );
}
