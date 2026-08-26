import { ActionNotice } from "@/components/integrations/ConnectDrawerControls";
import type { ProviderTestResult } from "@/lib/integrations/types";
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
      className={`m-0 mt-3 text-[12.5px] leading-[1.45] sm:col-span-2 ${result.ok ? "text-green-text" : "text-red-text"}`}
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
  return (
    <>
      {disconnectNotice ? (
        <div className="mt-3 sm:col-span-2">
          <ActionNotice notice={disconnectNotice} />
        </div>
      ) : null}
      {testResult ? (
        <ResultMessage
          label={testResult.ok ? "Connection verified." : "Connection failed."}
          result={testResult}
        />
      ) : null}
      {neverSynced ? (
        <p className="m-0 mt-3 text-[12.5px] leading-[1.45] text-fg-muted sm:col-span-2">
          <strong className="font-semibold text-fg">Never synced.</strong> Traffic data appears
          after the first sync. Use Sync now to load it immediately.
        </p>
      ) : null}
      {syncResult ? (
        <ResultMessage
          label={syncResult.ok ? "Traffic sync finished." : "Traffic sync failed."}
          result={syncResult}
        />
      ) : null}
    </>
  );
}
