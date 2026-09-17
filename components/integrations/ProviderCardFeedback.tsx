import { ActionNotice } from "@/components/integrations/ConnectDrawerControls";
import type { ProviderTestResult } from "@/lib/integrations/types";
import { useTranslations } from "next-intl";
import type { Notice } from "./ConnectDrawerSchema";

type Props = {
  disconnectNotice: Notice | null;
  neverSynced: boolean;
  syncResult: ProviderTestResult | null;
  testResult: ProviderTestResult | null;
};

function ResultMessage({ label, result }: { label: string; result: ProviderTestResult }) {
  return (
    <p
      className={`m-0 mt-3 text-[12.5px] leading-[1.45] ${result.ok ? "text-green-text" : "text-red-text"}`}
      role={result.ok ? "status" : "alert"}
    >
      <strong className="font-semibold">{label}</strong> {result.message}
    </p>
  );
}

export function ProviderCardFeedback({
  disconnectNotice,
  neverSynced,
  syncResult,
  testResult,
}: Readonly<Props>) {
  const t = useTranslations("projectIntegrations.provider");
  return (
    <>
      {disconnectNotice ? (
        <div className="mt-3">
          <ActionNotice notice={disconnectNotice} />
        </div>
      ) : null}
      {testResult ? (
        <ResultMessage
          label={testResult.ok ? t("connectionVerified") : t("connectionFailed")}
          result={testResult}
        />
      ) : null}
      {neverSynced ? (
        <p className="m-0 mt-3 text-[12.5px] leading-[1.45] text-fg-muted">
          <strong className="font-semibold text-fg">{t("neverSynced")}</strong>{" "}
          {t("neverSyncedHelp")}
        </p>
      ) : null}
      {syncResult ? (
        <ResultMessage
          label={syncResult.ok ? t("trafficFinished") : t("trafficFailed")}
          result={syncResult}
        />
      ) : null}
    </>
  );
}
