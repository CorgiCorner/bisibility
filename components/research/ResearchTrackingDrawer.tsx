import { AddKeywordDrawer } from "@/components/keywords/add/AddKeywordDrawer";
import type { LocationFieldValue } from "@/components/keywords/LocationField";
import type { ResearchAddDraft, ResearchWorkspaceProps } from "./research-workspace-model";

type ResearchTrackingDrawerProps = Pick<
  ResearchWorkspaceProps,
  "addKeywordsAction" | "costContext" | "projectMarkets"
> & {
  draft: ResearchAddDraft | null;
  location: LocationFieldValue;
  onAdded: (
    keywords: Array<{ publicId: string; text: string }>,
    context: { locationKeys: readonly string[] },
  ) => void;
  onClose: () => void;
  project: ResearchWorkspaceProps["context"]["project"];
  projectDefaultDevice: ResearchWorkspaceProps["context"]["defaultMarket"]["device"];
};

export function ResearchTrackingDrawer({
  addKeywordsAction,
  costContext,
  draft,
  location,
  onAdded,
  onClose,
  project,
  projectDefaultDevice,
  projectMarkets,
}: Readonly<ResearchTrackingDrawerProps>) {
  return (
    <AddKeywordDrawer
      addKeywordsAction={addKeywordsAction}
      costContext={costContext}
      defaultDevice={draft?.device ?? projectDefaultDevice}
      defaultLocationSelection={draft?.location ?? location}
      domain={project.domain}
      initialKeyword={draft?.keywords.join("\n")}
      initialScheduleFrequency={draft?.scheduleFrequency}
      key={draft ? JSON.stringify(draft) : "closed"}
      onAdded={onAdded}
      onClose={onClose}
      open={Boolean(draft)}
      projectId={project.id}
      projectMarkets={projectMarkets}
      showSchedule
    />
  );
}
