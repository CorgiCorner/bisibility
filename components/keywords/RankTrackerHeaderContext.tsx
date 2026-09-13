import { HeaderContextSlot } from "@/components/shell/HeaderContextSlot";
import type { SavedViewConfig } from "@/lib/keywords/saved-view-model";
import type { HeaderContextMarket } from "@/lib/markets/header-context";
import type { ProjectRef } from "@/lib/routing/app-path";
import { RankTrackerDeviceHeaderControl } from "./RankTrackerDeviceHeaderControl";

export function RankTrackerHeaderContext({
  contexts,
  projectRef,
  savedView,
}: Readonly<{
  contexts: readonly HeaderContextMarket[];
  projectRef: ProjectRef;
  savedView?: SavedViewConfig;
}>) {
  return (
    <HeaderContextSlot
      contexts={contexts}
      projectRef={projectRef}
      trailingControl={<RankTrackerDeviceHeaderControl savedView={savedView} />}
    />
  );
}
