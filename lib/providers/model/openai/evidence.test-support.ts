import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { transportEvidence } from "@/lib/providers/model/transport-evidence";
import { column, plainFixture } from "./adapter.test-support";
import { normalizeResponse } from "./normalize";

// All evidence cases are synthetic, using the documented Responses envelope.
export const source = (url = "https://example.org/source") => ({ type: "url", url });
export const searchCall = (sources?: unknown[], id = "ws_sources", status = "completed") => ({
  type: "web_search_call",
  id,
  status,
  action: { type: "search", ...(sources === undefined ? {} : { sources }) },
});
export function evidence(raw: unknown = plainFixture(), calls = 1) {
  const selected = column();
  if (calls) selected.settings.search = { mode: "openai_web_search", maxCalls: calls };
  return modelColumnResultSchema.parse({
    ...transportEvidence(selected, Date.now(), null),
    ...normalizeResponse(raw, selected, calls),
  });
}
