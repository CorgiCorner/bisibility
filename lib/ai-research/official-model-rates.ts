import "server-only";
import { readBodyWithLimit } from "@/lib/http/bounded-body";
import type { AiModelRate } from "./catalog-pricing";
import { aiDeadlineSignal } from "./deadline";
import { parseOfficialModelRates, validOfficialModelSelection } from "./official-model-rate-data";

const ORIGIN = "https://developers.openai.com";
export const OFFICIAL_MODEL_PAGE = `${ORIGIN}/api/docs/models/gpt-4.1-mini`;
const MAX_BYTES = 2 * 1024 * 1024;

function moduleUrl(
  reference: string,
  base: string,
  prefix: "LocalizedModels.react" | "localization.react" | "pricing",
): string {
  const url = new URL(reference.replaceAll("&amp;", "&"), base);
  const assetPrefix = `/_astro/${prefix}.`;
  const assetName = url.pathname.startsWith(assetPrefix)
    ? url.pathname.slice(assetPrefix.length)
    : "";
  if (
    url.origin !== ORIGIN ||
    url.username ||
    url.password ||
    url.hash ||
    !/^[A-Za-z0-9_-]+\.js$/.test(assetName) ||
    [...url.searchParams.keys()].some((key) => key !== "dpl") ||
    url.searchParams.getAll("dpl").length > 1 ||
    (url.search && !/^[A-Za-z0-9_-]+$/.test(url.searchParams.get("dpl") ?? ""))
  )
    throw new Error("Unknown official model data reference.");
  return url.href;
}
function uniqueReference(source: string, pattern: RegExp): string {
  const matches = [...source.matchAll(pattern)].map((match) => match[1]);
  if (matches.length !== 1) throw new Error("Ambiguous official model data reference.");
  return matches[0];
}
async function text(url: string, deadline: number): Promise<string> {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    signal: aiDeadlineSignal(deadline, 10_000),
  });
  if (!response.ok || (response.url && response.url !== url)) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Official model data is unavailable.");
  }
  const body = await readBodyWithLimit(response, MAX_BYTES);
  if (!body.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Official model data exceeds its size limit or is unreadable.");
  }
  if (Date.now() >= deadline) throw new Error("Official model data deadline expired.");
  return body.bytes.toString("utf8");
}

// This is public page-referenced data, not a documented pricing API. Format drift
// leaves affected models unavailable rather than substituting remembered rates.
export async function fetchOfficialModelRates(
  deadlineAt: number,
  modelNames?: readonly string[],
): Promise<ReadonlyMap<string, AiModelRate>> {
  if (
    !Number.isFinite(deadlineAt) ||
    (modelNames && (!modelNames.length || !validOfficialModelSelection(modelNames)))
  )
    return new Map();
  const deadline = Math.min(deadlineAt, Date.now() + 10_000);
  try {
    const page = await text(OFFICIAL_MODEL_PAGE, deadline);
    const componentUrl = moduleUrl(
      uniqueReference(page, /component-url="([^"\s]*LocalizedModels\.react[^"\s]*)"/g),
      OFFICIAL_MODEL_PAGE,
      "LocalizedModels.react",
    );
    const component = await text(componentUrl, deadline);
    const limitsSourceUrl = moduleUrl(
      uniqueReference(component, /\bfrom\s*["']([^"']*localization\.react[^"']*)["']/g),
      componentUrl,
      "localization.react",
    );
    const descriptor = await text(limitsSourceUrl, deadline);
    const sourceUrl = moduleUrl(
      uniqueReference(descriptor, /\bfrom\s*["']([^"']*pricing\.[^"']*)["']/g),
      limitsSourceUrl,
      "pricing",
    );
    const pricing = await text(sourceUrl, deadline);
    return parseOfficialModelRates(
      descriptor,
      pricing,
      {
        checkedAt: new Date().toISOString(),
        sourceUrl,
        limitsSourceUrl,
        currencySourceUrl: componentUrl,
      },
      component,
      modelNames,
    );
  } catch {
    return new Map();
  }
}
