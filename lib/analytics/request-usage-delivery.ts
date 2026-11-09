import "server-only";

import { pendingConsent } from "@/lib/analytics/consent";
import { trackServerEvent } from "@/lib/analytics/server";
import { after } from "next/server";
import { v5 as uuidv5 } from "uuid";

type Properties =
  | {
      provider: "ahrefs";
      feature: "domain_rating";
      trigger: "manual" | "scheduled" | "api" | "unknown";
    }
  | {
      provider: "dataforseo" | "serpapi";
      feature:
        | "ai_visibility"
        | "ai_tracking"
        | "prompt_explorer"
        | "prompt_research"
        | "backlinks"
        | "domain_overview"
        | "keyword_metrics"
        | "keyword_research"
        | "local_scan"
        | "rank_check"
        | "ranked_keywords";
      trigger: "manual" | "scheduled" | "api" | "unknown";
      payment: "byok" | "credits";
    };

/** Schedule best-effort delivery without making the provider operation wait for analytics. */
export function queueRequestUsageEvent(input: {
  operationKey: string;
  userId: string;
  timestamp?: Date;
  properties: Properties;
}) {
  const deliver = async () => {
    try {
      await trackServerEvent(
        "payment" in input.properties ? "paid_request_used" : "free_request_used",
        {
          consent: pendingConsent(),
          userId: input.userId,
          ...(input.timestamp ? { timestamp: input.timestamp } : {}),
          uuid: uuidv5(`bisibility/request-usage/${input.operationKey}`, uuidv5.URL),
          properties: input.properties,
        },
      );
    } catch {
      // Analytics is never part of the operation's result.
    }
  };
  queueRequestUsageTask(deliver);
}

export function queueRequestUsageTask(task: () => Promise<unknown>) {
  const safely = async () => {
    try {
      await task();
    } catch {
      /* Optional analytics cannot change an operation. */
    }
  };
  try {
    after(safely);
  } catch {
    void safely();
  }
}
