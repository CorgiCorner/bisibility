type RequestDiagnosticSink = (name: string, value: string) => void;

const sinkKey = Symbol.for("bisibility.observability.request-diagnostic-sink");
const carrier = globalThis as typeof globalThis & { [sinkKey]?: RequestDiagnosticSink };

export function registerRequestDiagnosticSink(next: RequestDiagnosticSink | undefined) {
  if (next) carrier[sinkKey] = next;
  else delete carrier[sinkKey];
}

/** No buffering: an attribute belongs only to the currently active request. */
export function setRequestDiagnosticAttribute(name: string, value: string) {
  carrier[sinkKey]?.(name, value);
}
