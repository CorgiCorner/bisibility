import { Button } from "@/components/ui/Button";
import {
  beginDashboardDraft,
  cancelDashboardDraft,
  dashboardDraftIsDirty,
  finishDashboardSave,
} from "@/lib/dashboard-layout/draft";
import { presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import { organicAccess } from "@/lib/dashboard-layout/test-fixtures";
import type { Meta, StoryObj } from "@storybook/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { DashboardCustomizationDialog } from "./DashboardCustomizationDialog";
import { dashboardTranslator } from "./dashboard-translator";

function DialogStory() {
  const t = useTranslations("shared.dashboardLayout");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(() => beginDashboardDraft(presetDashboardLayout(), 7));
  const [isDefault, setDefault] = useState(false);
  const [message, setMessage] = useState("");
  const opener = useRef<HTMLButtonElement>(null);
  function close() {
    setState(cancelDashboardDraft(state));
    setOpen(false);
    opener.current?.focus();
  }
  return (
    <div className="min-h-screen bg-bg p-6 text-fg">
      <Button
        ref={opener}
        variant="outline"
        onClick={() => {
          opener.current?.focus();
          setOpen(true);
        }}
      >
        {t("title")}
      </Button>
      {open ? (
        <DashboardCustomizationDialog
          locked={false}
          onClose={close}
          recovery={null}
          conflict={null}
          dirtyNotice={null}
          message={message}
          editor={{
            state,
            access: organicAccess,
            translate: dashboardTranslator(t),
            onChange: setState,
            layoutForPreset: presetDashboardLayout,
            templateForPreset: presetDashboardLayout,
            canSavePersonalLayout: true,
            defaultDisabled: isDefault || dashboardDraftIsDirty(state),
            onSetDefault: () => {
              setDefault(true);
              setMessage(t("defaultSaved"));
            },
            onCancel: close,
            onClosedFocusReturn: () => opener.current?.focus(),
            onSave: (request) =>
              setState((saving) =>
                finishDashboardSave(saving, {
                  kind: "saved",
                  attempt: request.attempt,
                  revision: 8,
                  layout: request.layout,
                }),
              ),
          }}
        />
      ) : null}
    </div>
  );
}
const meta = {
  title: "Dashboard/Customization dialog",
  component: DialogStory,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DialogStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
