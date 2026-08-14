import type { LocationFieldValue } from "@/components/keywords/LocationField";
import type { AddKeywordDrawerForm, AddKeywordTab } from "@/lib/keywords/add-keyword-drawer-shared";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { SerpDevice } from "@/lib/serp/markets";
import type { Dispatch, SetStateAction } from "react";
import type { UseFormReset } from "react-hook-form";
import { drawerFormDefaults } from "./AddKeywordDrawerFormDefaults";
import type { TrackingScheduleSelection } from "./TrackingConfigurationFields";

type ResetDrawerArgs = {
  costContext?: ProjectCostContext;
  defaultDevice: SerpDevice;
  defaultMarketKeys: string[];
  initialScheduleFrequency?: TrackingScheduleSelection;
  location: LocationFieldValue;
  projectId: string;
  reset: UseFormReset<AddKeywordDrawerForm>;
  setActionError: Dispatch<SetStateAction<string | null>>;
  setActionWarning: Dispatch<SetStateAction<string | null>>;
  setActiveTab: Dispatch<SetStateAction<AddKeywordTab>>;
  setCsvReviewOpen: Dispatch<SetStateAction<boolean>>;
  setCsvText: Dispatch<SetStateAction<string>>;
  setMatrixSelection: Dispatch<SetStateAction<{ devices: SerpDevice[]; locationKeys: string[] }>>;
  setTagsText: Dispatch<SetStateAction<string>>;
};

export function resetAddKeywordDrawer({
  costContext,
  defaultDevice,
  defaultMarketKeys,
  initialScheduleFrequency,
  location,
  projectId,
  reset,
  setActionError,
  setActionWarning,
  setActiveTab,
  setCsvReviewOpen,
  setCsvText,
  setMatrixSelection,
  setTagsText,
}: ResetDrawerArgs) {
  setActionError(null);
  setActionWarning(null);
  setActiveTab("manual");
  setCsvReviewOpen(false);
  setCsvText("");
  setTagsText("");
  setMatrixSelection({ devices: [defaultDevice], locationKeys: defaultMarketKeys });
  reset(
    drawerFormDefaults({
      costContext,
      defaultDevice,
      initialScheduleFrequency,
      location,
      projectId,
    }),
  );
}
