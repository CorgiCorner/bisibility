type RequestUsage = {
  provider: string;
  used: boolean;
  cached?: boolean;
  costCents?: number | null;
  quantity?: number | null;
  failed?: boolean;
};

/** Only classify retained, measured usage; unknown billing is not evidence of spend. */
export function classifyRequestUsage(input: RequestUsage) {
  if (!input.used || input.cached || input.failed) return null;
  if (input.provider === "ahrefs") return "free_request_used" as const;
  if (input.provider === "dataforseo" && (input.costCents ?? 0) > 0)
    return "paid_request_used" as const;
  if (input.provider === "serpapi" && (input.costCents ?? 0) > 0 && (input.quantity ?? 0) > 0)
    return "paid_request_used" as const;
  return null;
}
