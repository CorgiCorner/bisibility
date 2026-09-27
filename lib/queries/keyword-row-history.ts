import { positionDateLabel } from "@/lib/keywords/position-history";
import type { UrlPresenceView } from "@/lib/queries/keyword-row-types";

export function comparablePositionPoints(
  checks: readonly {
    checkedAt: Date;
    degradedToCountry?: boolean;
    position: number | null;
  }[],
) {
  return checks.flatMap((check) =>
    check.position === null
      ? []
      : [
          {
            checkedAt: check.checkedAt.toISOString(),
            ...(check.degradedToCountry ? { degradedToCountry: true } : {}),
            label: positionDateLabel(check.checkedAt),
            position: check.position,
          },
        ],
  );
}

export function urlPresenceView(
  presence:
    | {
        canonicalOk: boolean | null;
        checkedAt: Date;
        coverageState: string | null;
        lastCrawlAt: Date | null;
        url: string;
        verdict: string | null;
      }
    | null
    | undefined,
): UrlPresenceView | null {
  return presence
    ? {
        canonicalOk: presence.canonicalOk,
        checkedAt: presence.checkedAt.toISOString(),
        coverageState: presence.coverageState,
        indexed: presence.verdict === "PASS",
        lastCrawlAt: presence.lastCrawlAt?.toISOString() ?? null,
        url: presence.url,
        verdict: presence.verdict,
      }
    : null;
}
