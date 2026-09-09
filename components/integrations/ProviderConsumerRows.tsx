import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { Button } from "@/components/ui/Button";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { ProviderConsumerStatuses, ProviderTestResult } from "@/lib/integrations/types";
import { type ProjectRef, searchConsolePath } from "@/lib/routing/app-path";
import { ProviderSyncFailureAlert } from "./ProviderSyncFailureAlert";

type Props = {
  canSync: boolean;
  layout?: "stacked" | "columns";
  onSync: () => void;
  projectRef?: ProjectRef;
  readOnly: boolean;
  statuses: ProviderConsumerStatuses;
  syncFailure?: { consecutiveFailures: number; errorClass: string; since: string };
  syncPending: boolean;
  syncResult: ProviderTestResult | null;
  timeZone: string;
};

const rowClass = "m-0 flex min-w-0 flex-col items-start border-0 p-0";

export const consumerActionStyle = {
  "--control-color": "var(--fg-muted)",
  "--control-hover-border-color": "var(--accent)",
  "--control-hover-color": "var(--accent-text)",
  "--control-focus-border-color": "var(--accent)",
  "--control-focus-color": "var(--accent-text)",
} as const;

function ConsumerCopy({
  label,
  status,
  summary = status.summary,
  help,
}: {
  label: string;
  status: ProviderConsumerStatuses["searchModule"];
  summary?: string;
  help?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <h4 className="m-0 text-[12px] font-semibold text-fg">{label}</h4>
        {help ? <InfoTooltip text={help} /> : null}
      </div>
      {summary === "Not configured" ? null : (
        <p className="m-0 mt-1 text-[11.5px] leading-[1.5] text-fg-muted">{summary}</p>
      )}
      {status.detail ? (
        <p className="m-0 mt-0.5 truncate text-[10.5px] text-fg-muted" title={status.detail}>
          {status.detail}
        </p>
      ) : null}
    </div>
  );
}

const trafficBenefitCopy =
  "Adds clicks, impressions, and CTR to matching keywords in Rank Tracker.";

export function ProviderConsumerRows(props: Readonly<Props>) {
  const trafficNeverSynced = props.statuses.trafficEnrichment.state === "never_synced";

  return (
    <div
      className={
        props.layout === "columns"
          ? "grid gap-5 md:grid-cols-2 md:gap-6"
          : "mt-3 grid gap-3 border-border border-t pt-3"
      }
    >
      <fieldset aria-label="Search Console" className={rowClass}>
        <ConsumerCopy label="Search Console" status={props.statuses.searchModule} />
        {props.projectRef ? (
          <div className="mt-auto pt-3">
            <Button
              href={searchConsolePath(props.projectRef)}
              size="xs"
              style={consumerActionStyle}
              variant="secondary"
            >
              Open Search Console
            </Button>
          </div>
        ) : null}
      </fieldset>
      <fieldset aria-label="Traffic enrichment" className={rowClass}>
        <ConsumerCopy
          label="Traffic enrichment"
          status={props.statuses.trafficEnrichment}
          summary={trafficNeverSynced ? "Not synced yet" : undefined}
          help={trafficBenefitCopy}
        />
        {props.canSync ? (
          <ProjectReadOnlyTooltip className="mt-auto inline-flex pt-3">
            <Button
              disabled={props.readOnly || props.syncPending}
              onClick={props.onSync}
              size="xs"
              style={consumerActionStyle}
              type="button"
              variant="secondary"
            >
              {props.syncPending ? "Syncing keyword traffic..." : "Sync keyword traffic"}
            </Button>
          </ProjectReadOnlyTooltip>
        ) : null}
        {props.syncFailure ? (
          <div>
            <ProviderSyncFailureAlert
              failure={props.syncFailure}
              managementActionLabel="Connection settings"
              timeZone={props.timeZone}
            />
          </div>
        ) : null}
        {props.syncResult ? (
          <p
            className={`m-0 text-[12px] ${props.syncResult.ok ? "text-green-text" : "text-red-text"}`}
            role={props.syncResult.ok ? "status" : "alert"}
          >
            <strong>
              {props.syncResult.ok
                ? "Keyword traffic sync finished."
                : "Keyword traffic sync failed."}
            </strong>{" "}
            {props.syncResult.message}
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}
