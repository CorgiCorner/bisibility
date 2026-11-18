import type {
  MarketDefinitionLocationSource,
  MarketDefinitionRegistryEntry,
} from "@/components/markets/blocks/MarketDefinition";
import type { NewMarketCreateInput, NewMarketCreateResult } from "@/lib/markets/create-input";
import type { MarketScheduleContext } from "@/lib/markets/schedule-context";
import type { ScheduleReviewSubmission } from "@/lib/schedules/review-commit";
import type { SerpDevice } from "@/lib/serp/constants";
import type { ReactNode } from "react";
import type { ExistingMarketDeviceTracking } from "./NewMarketExisting";
import type { NewMarketSource } from "./NewMarketKeywordMethod";
import type { NewMarketScheduleOption } from "./NewMarketSchedule";
import type { NewMarketCreatorMessages } from "./new-market-creator-copy";

export type NewMarketCreatorFrame = {
  backLabel: string;
  content: ReactNode;
  creatingSchedule: boolean;
  footer: ReactNode;
  onBack: () => void;
  onClose: () => void;
  title: string;
};

export type NewMarketCreatorProps = {
  /** Create an empty market when the host owns keywords and their tracking defaults. */
  definitionOnly?: { devices: readonly SerpDevice[] };
  deviceTracking?: ExistingMarketDeviceTracking;
  messages?: NewMarketCreatorMessages;
  children: (frame: NewMarketCreatorFrame) => ReactNode;
  onClose: () => void;
  onCreate: (
    input: NewMarketCreateInput & { review?: ScheduleReviewSubmission },
  ) => Promise<NewMarketCreateResult>;
  /** Receives the created market so a host can select it without waiting for a refresh. */
  onCreated?: (result: NewMarketCreateResult) => void;
  onScheduleCreated?: (schedule: NewMarketScheduleOption) => void;
  projectId: string;
  registry?: readonly MarketDefinitionRegistryEntry[];
  schedules: readonly NewMarketScheduleOption[];
  scheduleContext?: MarketScheduleContext;
  /** Where the definition block gets countries, languages and places; the catalog by default. */
  source?: MarketDefinitionLocationSource;
  sources: readonly NewMarketSource[];
};
