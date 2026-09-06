import { KEYWORD_ARCHIVED_REASON, MARKET_INACTIVE_REASON } from "@/lib/rank-check/runnable-reasons";

export type RankCheckRunBudget = { capCents: number; spentCents: number };

type BlockedRunAction = "connection_settings" | "edit_budget" | "worker_status";

export type BlockedRunPresentation = {
  action: BlockedRunAction | null;
  compact: string;
  description: string;
  title: string;
};

export type ClientDeploymentMode = "self-host" | "cloud";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}

export function blockedRunPresentation(input: {
  budget?: RankCheckRunBudget | null;
  deploymentMode: ClientDeploymentMode;
  reason: string | null;
}): BlockedRunPresentation {
  if (input.reason === "temporal_unavailable") {
    return input.deploymentMode === "self-host"
      ? {
          action: "worker_status",
          compact: "Waiting for the background worker",
          description:
            "The background worker isn't running. Restart it and the run starts on its own.",
          title: "Waiting for the background worker",
        }
      : {
          action: null,
          compact: "Waiting for the background worker",
          description:
            "The background worker isn't reachable right now. The run starts on its own once it reconnects.",
          title: "Waiting for the background worker",
        };
  }

  if (input.reason === "budget_exhausted") {
    const amount = input.budget
      ? `Spent ${money(input.budget.spentCents)} of ${money(input.budget.capCents)} this month; `
      : "";
    return {
      action: "edit_budget",
      compact: "Budget reached",
      description: `${amount}checks resume when the budget resets.`,
      title: "Budget reached",
    };
  }

  if (input.reason === "no_provider" || input.reason === "credentials_unavailable") {
    return {
      action: "connection_settings",
      compact: "No working provider",
      description: "Connect or reconnect a provider to start this run.",
      title: "No working provider",
    };
  }

  if (input.reason === MARKET_INACTIVE_REASON) {
    return {
      action: null,
      compact: "Market not active",
      description:
        "This keyword's market is paused, so the check was stopped before it cost anything.",
      title: "Market not active",
    };
  }

  if (input.reason === KEYWORD_ARCHIVED_REASON) {
    return {
      action: null,
      compact: "Keyword archived",
      description:
        "This keyword was archived before the check started, so it was stopped before it cost anything.",
      title: "Keyword archived",
    };
  }

  if (input.reason === "provider_unavailable") {
    return {
      action: null,
      compact: "Provider unavailable",
      description:
        "The provider isn't reachable right now. The run starts on its own once it reconnects.",
      title: "Provider unavailable",
    };
  }

  return {
    action: null,
    compact: "Waiting to start",
    description: "This run is waiting to start. It will continue automatically when it can.",
    title: "Waiting to start",
  };
}
