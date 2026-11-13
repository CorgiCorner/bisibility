import { z } from "zod";
import type { PageVitalsSource, PageVitalsStrategy } from "./view";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const TIMEOUT_MS = 20_000;

const metricSchema = z.object({
  category: z.enum(["AVERAGE", "FAST", "NONE", "SLOW"]).optional(),
  percentile: z.number().finite(),
});

const experienceSchema = z.object({
  metrics: z
    .object({
      CUMULATIVE_LAYOUT_SHIFT_SCORE: metricSchema.optional(),
      INTERACTION_TO_NEXT_PAINT: metricSchema.optional(),
      LARGEST_CONTENTFUL_PAINT_MS: metricSchema.optional(),
    })
    .optional(),
  overall_category: z.string().optional(),
});

const auditSchema = z.object({ numericValue: z.number().finite().optional() });

export const pageSpeedResponseSchema = z.object({
  lighthouseResult: z
    .object({
      audits: z
        .object({
          "cumulative-layout-shift": auditSchema.optional(),
          "largest-contentful-paint": auditSchema.optional(),
          "total-blocking-time": auditSchema.optional(),
        })
        .optional(),
    })
    .optional(),
  loadingExperience: experienceSchema.optional(),
  originLoadingExperience: experienceSchema.optional(),
});

export type PageSpeedErrorCode = "invalid_key" | "invalid_response" | "quota" | "unreachable";

export class PageSpeedError extends Error {
  readonly code: PageSpeedErrorCode;

  constructor(code: PageSpeedErrorCode) {
    super(code);
    this.name = "PageSpeedError";
    this.code = code;
  }
}

export type PageSpeedReading = {
  cls: number | null;
  inpMs: number | null;
  lcpMs: number | null;
  source: PageVitalsSource;
  totalBlockingTimeMs: number | null;
};

type Experience = z.infer<typeof experienceSchema>;

function fieldMetrics(experience: Experience | undefined) {
  const metrics = experience?.metrics;
  if (!metrics) return null;
  const lcpMs = metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null;
  const inpMs = metrics.INTERACTION_TO_NEXT_PAINT?.percentile ?? null;
  const clsScore = metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile;
  if (lcpMs == null && inpMs == null && clsScore == null) return null;
  return { cls: clsScore == null ? null : clsScore / 100, inpMs, lcpMs };
}

function readingFrom(
  source: PageVitalsSource,
  metrics: { cls: number | null; inpMs: number | null; lcpMs: number | null },
  totalBlockingTimeMs: number | null,
): PageSpeedReading {
  return { ...metrics, source, totalBlockingTimeMs };
}

export function parsePageSpeedResponse(payload: unknown): PageSpeedReading {
  const parsed = pageSpeedResponseSchema.safeParse(payload);
  if (!parsed.success) throw new PageSpeedError("invalid_response");
  const blocking = parsed.data.lighthouseResult?.audits?.["total-blocking-time"]?.numericValue;
  const totalBlockingTimeMs = blocking ?? null;
  const field = fieldMetrics(parsed.data.loadingExperience);
  if (field) return readingFrom("field", field, totalBlockingTimeMs);
  const origin = fieldMetrics(parsed.data.originLoadingExperience);
  if (origin) return readingFrom("origin", origin, totalBlockingTimeMs);
  const audits = parsed.data.lighthouseResult?.audits;
  const lcpMs = audits?.["largest-contentful-paint"]?.numericValue ?? null;
  const cls = audits?.["cumulative-layout-shift"]?.numericValue ?? null;
  if (lcpMs == null && cls == null && totalBlockingTimeMs == null) {
    throw new PageSpeedError("invalid_response");
  }
  return readingFrom("lab", { cls, inpMs: null, lcpMs }, totalBlockingTimeMs);
}

function requestSignal(signal: AbortSignal | undefined) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function statusError(status: number) {
  if (status === 429) return new PageSpeedError("quota");
  if (status === 400 || status === 403) return new PageSpeedError("invalid_key");
  return new PageSpeedError("unreachable");
}

export async function fetchPageSpeed(
  url: string,
  strategy: PageVitalsStrategy,
  options: { apiKey: string; fetch?: typeof fetch; signal?: AbortSignal },
): Promise<PageSpeedReading> {
  const endpoint = new URL(ENDPOINT);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.set("category", "performance");
  endpoint.searchParams.set("key", options.apiKey);
  const request = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await request(endpoint, {
      cache: "no-store",
      redirect: "error",
      signal: requestSignal(options.signal),
    });
  } catch {
    throw new PageSpeedError("unreachable");
  }
  if (!response.ok) throw statusError(response.status);
  try {
    return parsePageSpeedResponse(await response.json());
  } catch (error) {
    if (error instanceof PageSpeedError) throw error;
    throw new PageSpeedError("invalid_response");
  }
}
