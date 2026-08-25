/**
 * Vendor-neutral seam for reporting caught client errors.
 *
 * Error boundaries call `reportAppError` and never import a reporting SDK, so a
 * deployment without a configured error sink pays nothing: no SDK in the client
 * entry chunks and no initialization cost. The client instrumentation hook is the
 * single place that loads a provider and registers it here.
 */

export type ErrorReportContext = {
  digest?: string;
  pathname?: string;
};

export type ErrorReportSink = (error: Error, context: ErrorReportContext) => void;

// A boundary can catch an error before the sink finishes loading. Buffer those and
// replay them once a sink registers. The cap keeps a page that never registers a
// sink - the normal case for a deployment without error reporting - bounded.
const MAX_BUFFERED_REPORTS = 10;

let sink: ErrorReportSink | undefined;
const buffered: Array<{ context: ErrorReportContext; error: Error }> = [];

export function registerErrorReportSink(next: ErrorReportSink) {
  sink = next;

  for (const report of buffered.splice(0)) {
    next(report.error, report.context);
  }
}

export function reportAppError(error: Error, context: ErrorReportContext = {}) {
  if (sink) {
    sink(error, context);
    return;
  }

  if (buffered.length < MAX_BUFFERED_REPORTS) {
    buffered.push({ context, error });
  }
}
