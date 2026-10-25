/** Recovery partials carry their depth independently from a full-depth no-match. */
export function recoveryResultMetadata(raw: unknown) {
  const object =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const metadata = object?.recovery;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const value = metadata as Record<string, unknown>;
  if (!["complete", "partial", "unresolved"].includes(String(value.completeness))) return {};
  return {
    result_completeness: value.completeness as "complete" | "partial" | "unresolved",
    returned_depth: typeof value.returnedDepth === "number" ? value.returnedDepth : null,
    comparison_allowed: false as const,
  };
}
