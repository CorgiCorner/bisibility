import { AiResearchWorkspace } from "@/components/ai-research/AiResearchWorkspace";
import {
  aiResearchCatalogFixture,
  fixtureResearchAction,
} from "@/components/ai-research/ai-research-fixtures";
import { AiTrackingWorkspace } from "@/components/ai-tracking/AiTrackingWorkspace";
import {
  trackingFixtureActions,
  trackingWorkspaceFixture,
} from "@/components/ai-tracking/fixtures";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import trackingMessages from "@/messages/core/en/project-ai-tracking.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";

const messages = mergeMessageCatalogs(sharedMessages, aiMessages, trackingMessages);
function SettledPreview({
  view,
  theme,
}: Readonly<{ view: "ai-tracking" | "ai-visibility"; theme: "light" | "dark" }>) {
  return (
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      <div
        data-theme={theme}
        className="min-h-screen bg-bg p-4 text-fg sm:p-5 lg:p-7"
        data-loading-preview
      >
        <PageContent variant="section">
          {view === "ai-tracking" ? (
            <AiTrackingWorkspace
              shellOwnsHeading
              initialData={trackingWorkspaceFixture}
              actions={trackingFixtureActions}
            />
          ) : (
            <AiResearchWorkspace
              projectId="prj_fixture"
              mode="visibility"
              domain="acme.dev"
              history={[]}
              catalog={aiResearchCatalogFixture}
              analyzeAction={fixtureResearchAction}
            />
          )}
        </PageContent>
      </div>
    </FeatureMessagesProvider>
  );
}
const meta = {
  title: "Tracking/Settled audit",
  component: SettledPreview,
  parameters: { layout: "fullscreen", themeControls: false },
  args: { view: "ai-tracking", theme: "dark" },
} satisfies Meta<typeof SettledPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AiTracking: Story = {};
export const AiVisibility: Story = { args: { view: "ai-visibility" } };
