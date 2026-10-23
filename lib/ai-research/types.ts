import type { AiEngine } from "./engines";

export type AiCitation = { title: string; url: string; targetDomain: boolean };
export type AiResearchRow = {
  prompt: string;
  model: string;
  /** Engine-mode rows name the engine that answered (ADR-023). */
  engine?: AiEngine;
  requestedModel?: string;
  actualModel?: string | null;
  answer: string;
  observedAt: string | null;
  brandMentioned: boolean;
  domainCited: boolean;
  citations: AiCitation[];
  contentTruncated?: boolean;
};
export type AiResearchResult = {
  evidence: "observed_dataset" | "synthetic_prompt_test";
  rows: AiResearchRow[];
  totalAvailable: number | null;
  truncated: boolean;
  fetchedAt: string;
  costCents: number;
  costStatus: "confirmed" | "unknown";
  failure: string | null;
};
