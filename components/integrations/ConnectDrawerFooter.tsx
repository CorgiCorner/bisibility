"use client";

import type { PendingAction } from "@/components/integrations/ConnectDrawerSchema";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { useTranslations } from "next-intl";

type ConnectDrawerFooterProps = {
  busy: boolean;
  formId: string;
  isManage: boolean;
  oauthOnly?: boolean;
  onTest: () => void;
  pendingAction: PendingAction | null;
  saveDisabled?: boolean;
  testDisabled?: boolean;
  testState: "idle" | "ok" | "testing";
};

function testButtonPresentation(
  state: ConnectDrawerFooterProps["testState"],
  t: ReturnType<typeof useTranslations<"projectIntegrations.drawer">>,
) {
  if (state === "ok") return { Icon: CheckCircle, label: t("verified") };
  return { Icon: null, label: t("testConnection") };
}

export function ConnectDrawerFooter({
  busy,
  formId,
  isManage,
  oauthOnly = false,
  onTest,
  pendingAction,
  saveDisabled = false,
  testDisabled = false,
  testState,
}: Readonly<ConnectDrawerFooterProps>) {
  const t = useTranslations("projectIntegrations.drawer");
  const { readOnly } = useProjectWriteMode();
  const { Icon: TestIcon, label: testButtonLabel } = testButtonPresentation(testState, t);

  if (oauthOnly) return null;

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
      <ProjectReadOnlyTooltip>
        <Button
          disabled={readOnly || busy || testDisabled}
          loading={testState === "testing"}
          loadingLabel={t("testing")}
          onClick={onTest}
          startIcon={TestIcon ? <TestIcon aria-hidden size={16} weight="regular" /> : undefined}
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
          loadingLabel={t("saving")}
          type="submit"
        >
          {isManage ? t("saveChanges") : t("connectProvider")}
        </Button>
      </ProjectReadOnlyTooltip>
    </div>
  );
}
