import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import type {
  KeywordResearchMode,
  KeywordResearchRow,
  KeywordResearchSourceDiagnostic,
} from "./types";

/** A stored Keyword Research snapshot, already paid for, safe to reopen in the workspace. */
export type OpenedKeywordResearch = {
  countryCode: string;
  fetchedAt: string;
  freshUntil: string;
  includeClickstream: boolean;
  languageCode: string;
  mode: KeywordResearchMode;
  payment?: ActionPaymentReceipt;
  provider: string;
  requestKey: string;
  resultLimit: 100 | 300 | 500;
  rows: KeywordResearchRow[];
  seed: string;
  sources: KeywordResearchSourceDiagnostic[];
};
