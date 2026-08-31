import type {
  LoadSearchInsightsPropertiesAction,
  SelectSearchInsightsPropertyAction,
} from "@/lib/actions/search-insights";
import type { SearchInsightsConnection } from "@/lib/search-insights/queries/context";
import type { SearchSyncPace, SearchSyncRetentionMonths } from "@/lib/search-insights/sync/plan";

export type PropertyPickerProps = {
  connection: SearchInsightsConnection;
  loadPropertiesAction: LoadSearchInsightsPropertiesAction;
  projectDomain?: string;
  projectId: string;
  preserveGa4OauthSelection?: boolean;
  selectPropertyAction: SelectSearchInsightsPropertyAction;
  syncPlan?: {
    daysTotal: number;
    pace: SearchSyncPace;
    retentionMonths: SearchSyncRetentionMonths;
  };
  viewedProperty?: SearchInsightsConnection["property"];
};
