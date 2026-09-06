import "server-only";

/**
 * Per-phase timings for one render of the Search Console page.
 *
 * Why this exists: every latency number this module has was measured per statement on a container
 * shaped like the production instance class. That sums the database cost and nothing else. It
 * cannot see the function cold start, the Prisma round trips, RSC serialization, or burst CPU
 * credits, and those are the difference between an arithmetic budget and what a user waits for.
 * Reproduction was the wrong tool; the page has to report its own time.
 *
 * Why a log line rather than a `Server-Timing` header: a Next.js server component cannot set
 * response headers, and middleware runs before the render it would have to measure, so the header
 * form is not available from where the phases actually happen. One structured line per render
 * carries the same numbers to the same place an operator reads.
 *
 * Recorded on a fraction of renders, because this page also refreshes itself while an import is
 * running, and a line per phase per render per tab is its own cost. The fraction applies to the
 * LOG, never to the data: nothing this module reports to a user is an estimate.
 */

export type RenderPhase =
  | "scope"
  | "context"
  | "authorize"
  | "oauth"
  | "status"
  | "syncPlan"
  | "prefix"
  | "firstView"
  | "signals";

export type PhaseTiming = { durationMs: number; phase: RenderPhase };

const DEFAULT_RECORD_RATE = 0.05;

function recordRate() {
  const raw = process.env.SEARCH_INSIGHTS_TIMING_RECORD_RATE?.trim();
  if (!raw) return DEFAULT_RECORD_RATE;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("SEARCH_INSIGHTS_TIMING_RECORD_RATE must be a number between 0 and 1");
  }
  return parsed;
}

/**
 * Collects phase durations for one render and emits them once.
 *
 * The decision is made once, when the recorder is created, so a render either reports every phase
 * or none. A half-recorded render would produce a line whose phases do not add up, which is worse
 * than no line.
 */
export function createRenderPhaseRecorder(input: {
  period: string;
  projectId: string;
  random?: () => number;
  record?: boolean;
}) {
  const record = input.record ?? (input.random ?? Math.random)() < recordRate();
  const timings: PhaseTiming[] = [];

  return {
    /** Time one phase. Returns whatever the phase returned, including a rejection. */
    async measure<T>(phase: RenderPhase, work: () => Promise<T>): Promise<T> {
      if (!record) return work();
      const startedAt = performance.now();
      try {
        return await work();
      } finally {
        timings.push({ durationMs: Math.round(performance.now() - startedAt), phase });
      }
    },
    /**
     * Emit the line. Safe to call when nothing was recorded, and safe to call twice: a render that
     * threw halfway still reports the phases it finished, which is the case worth seeing.
     */
    report() {
      if (!record || timings.length === 0) return;
      console.info("[search-insights] render_phases", {
        period: input.period,
        phases: Object.fromEntries(timings.map(({ durationMs, phase }) => [phase, durationMs])),
        projectId: input.projectId,
        totalMs: timings.reduce((sum, { durationMs }) => sum + durationMs, 0),
      });
      timings.length = 0;
    },
    get record() {
      return record;
    },
  };
}

export type RenderPhaseRecorder = ReturnType<typeof createRenderPhaseRecorder>;
