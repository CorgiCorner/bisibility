import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import type {
  getPromptResearchPage,
  lookupPromptResearchAction,
} from "@/lib/actions/prompt-research";
import { projectResearchQuestions } from "@/lib/ai-research/prompt-research-projection";
import type { AiResearchRow } from "@/lib/ai-research/types";

export const researchPageFixture: Awaited<ReturnType<typeof getPromptResearchPage>> = {
  initial: undefined,
  canWrite: true,
  hasSource: true,
  cacheDuration: "12 hours",
  supportingProviders: ["DataForSEO"],
  topics: [{ id: "ait_topic", name: "Tools", description: null, status: "active" }],
  keywords: ["tools", "seo tools"],
};
const row: AiResearchRow = {
  prompt: "best tools?",
  answer: "Example",
  model: "chat_gpt",
  observedAt: null,
  brandMentioned: false,
  domainCited: false,
  citations: [{ title: "Example tools", url: "https://example.com/tools", targetDomain: false }],
};
const rows: AiResearchRow[] = [
  row,
  {
    ...row,
    prompt: "which tools help teams collaborate?",
    answer: "Example helps teams collaborate.",
  },
  {
    ...row,
    prompt: "which tools work offline?",
    answer: "Local tools work offline.",
    citations: [],
  },
  {
    ...row,
    prompt: "how can teams compare tools?",
    answer: "Compare features, security and support.",
    citations: [
      {
        title: "Team software comparison guide",
        url: "https://guides.example.org/compare",
        targetDomain: false,
      },
      {
        title: "Choosing software for your team",
        url: "https://research.example.net/teams",
        targetDomain: false,
      },
      { title: "Example tools", url: "https://example.com/tools", targetDomain: true },
    ],
  },
  {
    ...row,
    prompt: "what is an open source tool?",
    answer: "Example makes its source code available for inspection.",
    citations: [
      {
        title: "Open source definitions",
        url: "https://guides.example.org/open-source",
        targetDomain: false,
      },
    ],
  },
  { ...row, prompt: "can tools automate reporting?", contentTruncated: true },
  {
    ...row,
    prompt: "where can I learn about accessibility testing?",
    answer: "Start with these testing guides.",
    citations: [
      {
        title: "An accessible testing workflow for teams with distributed editors and reviewers",
        url: "https://guides.example.org/accessibility",
        targetDomain: false,
      },
    ],
  },
  {
    ...row,
    prompt:
      "which tools should a small distributed team choose to research keywords, compare competitors, monitor search rankings and share accessible reports with clients while keeping control of provider accounts and monthly costs?",
  },
  { ...row, prompt: "best tool in 2025?" },
  { ...row, prompt: "best tools for 2026?" },
];
export const researchResultFixture = {
  ok: true as const,
  estimate: false as const,
  cached: true,
  reportId: "agr_a00000000000000000000000",
  costCents: 0,
  result: {
    evidence: "observed_dataset" as const,
    rows,
    totalAvailable: rows.length,
    truncated: false,
    fetchedAt: "2026-10-24T00:00:00Z",
    costCents: 20,
    costStatus: "confirmed" as const,
    failure: null,
  },
  prompts: projectResearchQuestions(rows, {
    brand: "Example",
    domain: "example.com",
    tracked: [rows[1].prompt],
  }),
} satisfies Awaited<ReturnType<typeof lookupPromptResearchAction>>;
export const researchQuoteFixture = {
  ok: true as const,
  estimate: true as const,
  estimatedCostCents: 20,
  evidence: "observed_dataset" as const,
  payment: paymentQuote({
    charge: { value: "0.2", certainty: "estimate", unit: { kind: "currency", code: "USD" } },
  }),
};
