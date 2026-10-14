export type ExportHistoryValues = {
  granularity: "daily" | "weekly";
  historyVersion: "1" | "2";
  range: "30" | "90" | "all";
  stream: "observations" | "attempts";
};

/** Hidden draft choices do not change a current/legacy export or start any work. */
export function historyActionFields(
  values: ExportHistoryValues & { scope: "current" | "history" },
) {
  const report = values.scope === "history" && values.historyVersion === "2";
  return {
    granularity: report ? ("daily" as const) : values.granularity,
    historyVersion: report ? (2 as const) : (1 as const),
    stream: report ? values.stream : ("observations" as const),
  };
}
