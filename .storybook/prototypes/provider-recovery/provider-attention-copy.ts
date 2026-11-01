export type AttentionState = "billing" | "checking" | "review" | "ready" | "internal";
export type AttentionTab = "integration" | "checks";

export const attentionCopy = {
  billing: {
    label: "Action required",
    heading: "Check billing in your DataForSEO account",
    description:
      "DataForSEO reported a payment issue. Rank checks using this connection are paused until it is resolved.",
    tone: "attention",
  },
  checking: {
    label: "Checking account",
    heading: "Checking your DataForSEO account",
    description: "Verifying account access and billing. This account check is free.",
    tone: "info",
  },
  review: {
    label: "Under review",
    heading: "Billing verified. Earlier requests are under review.",
    description:
      "We are verifying earlier requests before monitoring resumes. This review is handled by Bisibility; you do not need to retry them.",
    tone: "attention",
  },
  ready: {
    label: "Ready",
    heading: "Your monitoring is ready to resume",
    description:
      "Account billing and earlier requests have been verified. Your next rank check will run on the existing schedule.",
    tone: "positive",
  },
  internal: {
    label: "We are investigating",
    heading: "We could not start this check safely",
    description:
      "There is a problem on our side. Our team is reviewing it before monitoring resumes. Your provider account does not need to be reconnected.",
    tone: "info",
  },
} as const;

export const affectedKeywords = [
  "rank tracking software",
  "keyword rank tracker",
  "website ranking tool",
  "local rank tracker",
  "search visibility tool",
  "daily keyword monitoring",
  "seo reporting software",
  "competitor rank tracking",
  "google position checker",
  "serp monitoring tool",
  "keyword tracking dashboard",
];
