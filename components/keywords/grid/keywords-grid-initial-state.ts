import type { AddKeywordDraft } from "./KeywordsGridDialogs";

export function initialAddKeywordDraft(
  canCreate: boolean,
  requestedOpen: boolean,
): AddKeywordDraft {
  return { keyword: "", open: canCreate && requestedOpen, tab: "manual" };
}
