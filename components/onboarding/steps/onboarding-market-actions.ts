import type { NewMarketCreateInput, NewMarketCreateResult } from "@/lib/markets/create-input";

/** Reconciles the project's markets to the keys the step submits; removed keys are archived. */
export type SaveOnboardingMarketsAction = (input: {
  marketKeys: string[];
  projectId: string;
}) => Promise<{ marketKeys: string[] }>;

/** The shared market creation contract: the same action the Markets page and the drawer use. */
export type CreateOnboardingMarketAction = (
  input: NewMarketCreateInput,
) => Promise<NewMarketCreateResult>;
