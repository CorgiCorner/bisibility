import { beginDashboardDraft, finishDashboardSave } from "@/lib/dashboard-layout/draft";
import { presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import { dashboardFixtureTranslate, organicAccess } from "@/lib/dashboard-layout/test-fixtures";
import type { Meta, StoryObj } from "@storybook/react";
import { useRef, useState } from "react";
import { DashboardLayoutEditor } from "./DashboardLayoutEditor";
import { DashboardLayoutControl, DashboardPresetControl } from "./DashboardViewControls";

function EditorStory({ conflict = false, local = false }: { conflict?: boolean; local?: boolean }) {
  const [state, setState] = useState(() =>
    beginDashboardDraft(presetDashboardLayout(local ? "local" : "general"), 7),
  );
  const [cancelled, setCancelled] = useState(false);
  return (
    <div className="max-w-3xl bg-bg p-4 text-fg">
      {cancelled ? (
        <p>Draft cancelled; previous layout retained.</p>
      ) : (
        <DashboardLayoutEditor
          layoutForPreset={presetDashboardLayout}
          templateForPreset={presetDashboardLayout}
          state={state}
          access={organicAccess}
          translate={dashboardFixtureTranslate}
          onChange={setState}
          canSavePersonalLayout
          onClosedFocusReturn={() => undefined}
          onCancel={(restored) => {
            setState(restored);
            setCancelled(true);
          }}
          onSave={(request) =>
            setState((saving) =>
              finishDashboardSave(
                saving,
                conflict
                  ? { kind: "conflict", attempt: request.attempt, currentRevision: 8 }
                  : {
                      kind: "saved",
                      attempt: request.attempt,
                      revision: 8,
                      layout: request.layout,
                    },
              ),
            )
          }
        />
      )}
    </div>
  );
}
const meta = {
  component: EditorStory,
  title: "Dashboard/Layout editor",
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof EditorStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const General: Story = {};
export const SaveConflict: Story = { args: { conflict: true } };
export const LocalNeedsExplicitSubject: Story = { args: { local: true } };
export const NarrowViewport: Story = { parameters: { viewport: { defaultViewport: "mobile1" } } };

function ControlsPreview() {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 bg-bg p-6 text-fg">
      <DashboardPresetControl value="general" disabled={false} onChange={() => undefined} />
      <DashboardLayoutControl
        menu
        trigger={trigger}
        pending={false}
        editing={false}
        defaultDisabled={false}
        onToggleEditing={() => undefined}
        onSetDefault={() => undefined}
      />
    </div>
  );
}
export const Toolbar: Story = { render: () => <ControlsPreview /> };
