"use client";

import type { PendingAction } from "@/components/integrations/ConnectDrawerSchema";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui";
import Tooltip from "@mui/material/Tooltip";
import {
  CheckCircleIcon as CheckCircle,
  CircleNotchIcon as CircleNotch,
  LightningIcon as Lightning,
  PlugsIcon as Plugs,
} from "@phosphor-icons/react";

type ConnectDrawerFooterProps = {
  busy: boolean;
  formId: string;
  isManage: boolean;
  oauthOnly?: boolean;
  onDisconnect: () => void;
  onTest: () => void;
  pendingAction: PendingAction | null;
  saveDisabled?: boolean;
  testDisabled?: boolean;
  testState: "idle" | "ok" | "testing";
};

function testButtonPresentation(state: ConnectDrawerFooterProps["testState"]) {
  if (state === "testing") return { Icon: CircleNotch, label: "Testing…" };
  if (state === "ok") return { Icon: CheckCircle, label: "Connected" };
  return { Icon: Lightning, label: "Test connection" };
}

export function ConnectDrawerFooter({
  busy,
  formId,
  isManage,
  oauthOnly = false,
  onDisconnect,
  onTest,
  pendingAction,
  saveDisabled = false,
  testDisabled = false,
  testState,
}: Readonly<ConnectDrawerFooterProps>) {
  const { readOnly } = useProjectWriteMode();
  const { Icon: TestIcon, label: testButtonLabel } = testButtonPresentation(testState);
  const testIconWeight = testState === "idle" ? "regular" : "fill";

  if (oauthOnly) {
    return isManage ? (
      <ProjectReadOnlyTooltip>
        <Button
          disabled={readOnly || busy}
          onClick={onDisconnect}
          startIcon={<Plugs aria-hidden size={17} />}
          type="button"
          variant="secondary"
        >
          Disconnect
        </Button>
      </ProjectReadOnlyTooltip>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
      {isManage ? (
        <Tooltip title={readOnly ? "Read-only during migration hold" : "Disconnect"}>
          <span className="shrink-0">
            <Button
              aria-label="Disconnect provider"
              disabled={readOnly || busy}
              onClick={onDisconnect}
              sx={{
                color: "var(--red)",
                minHeight: 42,
                minWidth: 42,
                padding: 0,
                "&:hover": { borderColor: "var(--red)", color: "var(--red)" },
              }}
              type="button"
              variant="secondary"
            >
              <Plugs aria-hidden size={17} />
            </Button>
          </span>
        </Tooltip>
      ) : null}
      <ProjectReadOnlyTooltip>
        <Button
          disabled={readOnly || busy || testDisabled}
          onClick={onTest}
          startIcon={
            <TestIcon
              aria-hidden
              className={testState === "testing" ? "animate-spin" : undefined}
              size={16}
              weight={testIconWeight}
            />
          }
          type="button"
          variant="secondary"
        >
          {testButtonLabel}
        </Button>
      </ProjectReadOnlyTooltip>
      <ProjectReadOnlyTooltip className="inline-flex flex-1">
        <Button
          className="flex-1"
          disabled={readOnly || busy || saveDisabled}
          form={formId}
          loading={pendingAction === "save"}
          loadingLabel="Saving…"
          type="submit"
        >
          {isManage ? "Save changes" : "Connect provider"}
        </Button>
      </ProjectReadOnlyTooltip>
    </div>
  );
}
