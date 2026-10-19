/** Paid capabilities a client explains when an account must use its own provider keys. */
export const OWN_KEY_CAPABILITIES = [
  "rank_check",
  "keyword_research",
  "backlinks",
  "domain_overview",
  "ai_tracking",
] as const;

export type OwnKeyCapability = (typeof OWN_KEY_CAPABILITIES)[number];
