import type { SerpProvider } from "@/lib/providers/types";

const DEFAULT_POSITION = 20;
const MAX_POSITION = 100;
const SEQUENCE_PATTERN = /\[seq:([^\]]+)\]/i;

export function parseLocalRankSequence(keyword: string): number[] | null {
  const value = keyword.match(SEQUENCE_PATTERN)?.[1];
  if (!value) return null;

  const tokens = value.split(",").map((token) => token.trim());
  if (tokens.length === 0 || tokens.some((token) => !/^\d+$/.test(token))) return null;

  const positions = tokens.map(Number);
  return positions.every((position) => position >= 1 && position <= MAX_POSITION)
    ? positions
    : null;
}

export function localRankPosition(keyword: string, completedCheckCount = 0) {
  const sequence = parseLocalRankSequence(keyword) ?? [DEFAULT_POSITION];
  const index = Math.min(Math.max(0, Math.floor(completedCheckCount)), sequence.length - 1);
  return sequence[index];
}

export const localSequenceProvider: SerpProvider = {
  id: "local-sequence",
  label: "Local sequence (dev-only)",

  async testConnection() {
    return {
      message: "Development provider ready. No credentials or outbound requests are used.",
      ok: true,
    };
  },

  async fetchRank(input) {
    const position = localRankPosition(input.keyword, input.completedCheckCount);
    const rankingUrl = `https://${input.domain}/local-rank-${position}`;
    return {
      billingUnits: 0,
      checkedAt: new Date(),
      costCents: 0,
      position,
      rankingUrl,
      raw: {
        organic_results: [
          {
            domain: input.domain,
            rank: position,
            title: "Deterministic local result",
            url: rankingUrl,
          },
        ],
      },
    };
  },
};
