import { withIntegrationMessages } from "@/.storybook/with-integration-messages";
import { IntegrationCategory } from "@/components/integrations/IntegrationCategory";
import { IntegrationsTabs } from "@/components/integrations/IntegrationsTabs";
import { integrationCategories } from "@/components/integrations/integrations-fixtures";
import { groupIntegrationCategories } from "@/lib/integrations/category-groups";
import type { Meta, StoryObj } from "@storybook/react";

function ConnectionsPage() {
  return (
    <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <h1 className="m-0 text-xl font-semibold">Integrations</h1>
        <IntegrationsTabs active="connections" projectRef="prj_storybook" />
        <div
          id="integrations-panel"
          role="tabpanel"
          aria-labelledby="integrations-panel-connections-tab"
          className="space-y-5"
        >
          {groupIntegrationCategories(integrationCategories).map((category) => (
            <IntegrationCategory
              key={category.id}
              category={category}
              canManageProviders
              canUpdateProject
              projectRef="prj_storybook"
              timeZone="Europe/Warsaw"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
const meta = {
  title: "Integrations/Connections page",
  component: ConnectionsPage,
  decorators: [withIntegrationMessages],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta<typeof ConnectionsPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
