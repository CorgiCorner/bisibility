import { Button } from "@/components/ui/Button";
import { generalPreference } from "@/lib/project-surface-preferences/model";
import {
  canonicalViewFixture,
  keywordViewFixture,
  viewProjectId,
} from "@/lib/saved-views/view-test-fixture";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { PersonalSavedViewsControl } from "./PersonalSavedViewsControl";
import type { PersonalSavedViewsControlProps } from "./personal-control-types";

function ToolbarFixture({
  canEdit = true,
  initialModified = true,
}: Readonly<{ canEdit?: boolean; initialModified?: boolean }>) {
  const [modified, setModified] = useState(initialModified);
  const view = {
    ...canonicalViewFixture(),
    config: keywordViewFixture(),
    canEdit,
    canDelete: canEdit,
  };
  const desktopView = {
    ...view,
    id: "viw_bcdefghijklmnopqrstuvwxy",
    name: "Service desktop",
    config: { ...view.config, lens: { ...view.config.lens, device: "desktop" as const } },
  };
  const views = [view, desktopView];
  const [activeViewId, setActiveViewId] = useState<string | null>(view.id);
  const activeView = views.find((item) => item.id === activeViewId) ?? null;
  const preference = generalPreference(viewProjectId, "keywords");
  const props: PersonalSavedViewsControlProps = {
    activeViewId,
    canCreateShared: canEdit,
    canCreatePrivate: true,
    config: activeView?.config ?? keywordViewFixture(),
    createAction: async () => ({ ok: true, value: view }),
    deleteAction: async () => ({ ok: true, value: { deleted: true } }),
    updateAction: async () => ({ ok: true, value: { ...(activeView ?? view), revision: 2 } }),
    setDefaultAction: async () => ({ ok: true, value: { ...preference, revision: 1 } }),
    labels: sharedMessages.shared.personalViews,
    modified,
    onDiscard: () => setModified(false),
    onRefresh: () => {},
    onSelect: (selected) => {
      setActiveViewId(selected?.id ?? null);
      setModified(false);
    },
    preference,
    projectId: viewProjectId,
    scopeKey: "storybook:saved-views:keywords",
    scopeSummary: activeView ? `Krakow, ${activeView.config.lens.device}, Service` : "General",
    views,
  };
  return (
    <div className="p-4">
      <div
        data-saved-view-toolbar
        className="flex min-w-0 flex-wrap items-center gap-2 rounded-card border border-border p-3"
      >
        <PersonalSavedViewsControl {...props} />
        <Button variant="outline" size="sm" className="font-normal">
          Columns
        </Button>
        <Button variant="outline" size="sm" className="font-normal">
          Export
        </Button>
      </div>
    </div>
  );
}

const meta = {
  title: "Saved views/Toolbar",
  render: () => <ToolbarFixture />,
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Editable: Story = {};
export const Viewer: Story = { render: () => <ToolbarFixture canEdit={false} /> };
export const Saved: Story = { render: () => <ToolbarFixture initialModified={false} /> };
