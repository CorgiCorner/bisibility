import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui";
import type { ProviderConsumerStatuses, ProviderTestResult } from "@/lib/integrations/types";
import { type ProjectRef, searchConsolePath } from "@/lib/routing/app-path";
import { ProviderSyncFailureAlert } from "./ProviderSyncFailureAlert";

type Props = {
  canSync: boolean;
  onSync: () => void;
  projectRef?: ProjectRef;
  readOnly: boolean;
  statuses: ProviderConsumerStatuses;
  syncFailure?: { consecutiveFailures: number; errorClass: string; since: string };
  syncPending: boolean;
  syncResult: ProviderTestResult | null;
  timeZone: string;
};

const rowClass =
  "rounded-control border border-border-soft bg-bg-sunken/30 px-3.5 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4";

export const consumerActionSx = {
  color: "var(--fg-muted)",
  "&:hover, &.Mui-focusVisible": {
    borderColor: "var(--accent)",
    color: "var(--accent-text)",
  },
} as const;

function ConsumerCopy({
  label,
  status,
  summary = status.summary,
  supportingCopy,
}: {
  label: string;
  status: ProviderConsumerStatuses["searchModule"];
  summary?: string;
  supportingCopy?: string;
}) {
  return (
    <div className="min-w-0">
      <h4 className="m-0 text-[12.5px] font-semibold text-fg">{label}</h4>
      {summary === "Not configured" ? null : (
        <p className="m-0 mt-1 text-[11.5px] leading-[1.5] text-fg-muted">{summary}</p>
      )}
      {supportingCopy ? (
        <p className="m-0 mt-0.5 text-[11.5px] leading-[1.45] text-fg-muted">{supportingCopy}</p>
      ) : null}
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
const trafficFirstSyncCopy =
  "Not synced yet. Sync to add Search Console clicks, impressions, and CTR to matching Rank Tracker keywords.";

export function ProviderConsumerRows(props: Readonly<Props>) {
  const trafficNeverSynced = props.statuses.trafficEnrichment.state === "never_synced";

  return (
    <div className="mt-3.5 grid gap-2 border-border-soft border-t pt-3.5 sm:col-span-2 sm:row-start-2">
      <fieldset aria-label="Search Console" className={`${rowClass} m-0 min-w-0`}>
        <ConsumerCopy label="Search Console" status={props.statuses.searchModule} />
        {props.projectRef ? (
          <Button
            className="mt-2 sm:mt-0"
            href={searchConsolePath(props.projectRef)}
            size="xs"
            sx={consumerActionSx}
            variant="secondary"
          >
            Open Search Console
          </Button>
        ) : null}
      </fieldset>
      <fieldset aria-label="Traffic enrichment" className={`${rowClass} m-0 min-w-0`}>
        <ConsumerCopy
          label="Traffic enrichment"
          status={props.statuses.trafficEnrichment}
          summary={trafficNeverSynced ? trafficFirstSyncCopy : undefined}
          supportingCopy={trafficNeverSynced ? undefined : trafficBenefitCopy}
        />
        {props.canSync ? (
          <ProjectReadOnlyTooltip className="mt-2 inline-flex sm:mt-0">
            <Button
              disabled={props.readOnly || props.syncPending}
              onClick={props.onSync}
              size="xs"
              sx={consumerActionSx}
              type="button"
              variant="secondary"
            >
              {props.syncPending ? "Syncing keyword traffic..." : "Sync keyword traffic"}
            </Button>
          </ProjectReadOnlyTooltip>
        ) : null}
        {props.syncFailure ? (
          <div className="sm:col-span-2">
            <ProviderSyncFailureAlert
              failure={props.syncFailure}
              managementActionLabel="Connection settings"
              timeZone={props.timeZone}
            />
          </div>
        ) : null}
        {props.syncResult ? (
          <p
            className={`m-0 text-[12px] sm:col-span-2 ${props.syncResult.ok ? "text-green-text" : "text-red-text"}`}
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
