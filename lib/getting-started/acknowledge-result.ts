export type AcknowledgeGettingStartedResult =
  | { ok: true }
  | { ok: false; reason: "incomplete" | "write_failed" };
