"use client";

import {
  AllocationEvidence,
  NativeAllocationObservation,
} from "@/components/provider-management/AllocationEvidence";
import { useAllocationLabels } from "@/components/provider-management/allocation-labels";
import { useProviderUiStatus } from "@/components/provider-management/ProviderUiProvider";
import {
  allocationPolicy,
  useAllocationForm,
} from "@/components/provider-management/use-allocation-form";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ProviderAllocationPanel } from "@/components/usagekit/provider-allocation-editor";
import {
  ProviderActionFeedback,
  ProviderReadFeedback,
} from "@/components/usagekit/provider-feedback";
import { refreshProviderConnectionBudgetAction } from "@/lib/actions/provider-allocation";
import type { UsageConnection } from "@/lib/metering/user-views";
import { parseNativeAllocation } from "@/lib/provider-ui/form-schema";
import {
  type NativeAllocationRow,
  nativeAllocationAvailability,
} from "@/lib/provider-ui/native-allocation-evidence";
import { appPath } from "@/lib/routing/app-path";
import {
  useProviderAction,
  useProviderAllocations,
  useProviderConnections,
  useProviderManagementBinding,
} from "@usagekit/react";
import { allocationLimitFromAvailable, type ProviderAllocationRow } from "@usagekit/views";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type ProviderAllocationDialogProps = Readonly<{
  connections: readonly UsageConnection[];
  surface?: ProviderAllocationRow["surface"];
  onClose: () => void;
  onSaved: () => void;
  onExited?: () => void;
  projectRef: string;
}>;

export function ProviderAllocationDialog(props: ProviderAllocationDialogProps) {
  const t = useTranslations("projectSettingsUsage.provider.budgetDialog");
  const common = useTranslations("projectIntegrations.providerManagement");
  const router = useRouter();
  const status = useProviderUiStatus();
  const action = useProviderAction();
  const result = useProviderAllocations({
    connectionIds: props.connections.map((item) => item.connectionId),
  });
  const providerRead = useProviderConnections();
  const binding = useProviderManagementBinding();
  const entry = binding?.client.entry(binding.port, binding.binding, {
    kind: "allocations",
    connectionIds: props.connections.map((item) => item.connectionId),
  });
  const { adapter: formAdapter, onReload } = useAllocationForm(entry, status.state === "ready");
  const labels = useAllocationLabels(props.connections, result.data?.rows ?? []);
  const selectedRow = (row: ProviderAllocationRow) =>
    !props.surface ||
    (row.surface === props.surface &&
      props.connections.some(
        (connection) =>
          connection.connectionId === row.connectionId &&
          row.fundingSource === (connection.credentialSource === "hosted" ? "platform" : "byok"),
      ));
  const isEmpty =
    props.connections.length === 0 ||
    result.state === "empty" ||
    result.data?.rows.filter(selectedRow).length === 0;
  const [actionsContainer, setActionsContainer] = useState<HTMLElement | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [verified, setVerified] = useState(false);
  if (status.state === "ready" && !verified) setVerified(true);
  const busy = action.pending || refreshing;
  const close = () => {
    if (!busy) props.onClose();
  };
  const observed = result.data?.asOf != null && Number.isFinite(Date.parse(result.data.asOf));
  function suggestionEligible(row: ProviderAllocationRow) {
    const native = (row as NativeAllocationRow).nativeObservation;
    const current =
      row.fundingSource === "platform"
        ? observed &&
          row.unit === "customer_cents" &&
          row.availabilityBasis === "after_reservations"
        : native
          ? nativeAllocationAvailability(row, native).outcome === "ready" &&
            providerRead.state === "ok" &&
            !providerRead.refreshing &&
            providerRead.data?.connections.some(
              (connection) =>
                connection.id === row.connectionId &&
                connection.revision === row.revision &&
                connection.fundingSource === "byok" &&
                connection.hasStoredCredentials &&
                connection.status.state === "connected",
            )
          : providerRead.state === "ok" &&
            !providerRead.refreshing &&
            providerRead.data?.connections.some(
              (connection) => connection.id === row.connectionId && !connection.freshness.stale,
            );
    if (!current || !row.available || !row.availabilityBasis) return false;
    const suggestion = allocationLimitFromAvailable({
      used: row.used,
      reserved: row.reserved,
      available: row.available,
      availabilityBasis: row.availabilityBasis,
    });
    return (
      suggestion.outcome === "ready" &&
      suggestion.limit.unit === row.unit &&
      parseNativeAllocation(suggestion.limit.text, row.unit) !== null
    );
  }
  const empty = (
    <p>
      {t("empty")}{" "}
      <Link className="text-accent-text" href={appPath(props.projectRef, "integrations")}>
        {t("connect")}
      </Link>{" "}
      {t("emptyAfterLink")}
    </p>
  );
  return (
    <Modal
      open
      onClose={close}
      onExited={props.onExited}
      dismissDisabled={busy}
      title={t("title")}
      width={760}
      footer={
        <>
          <Button disabled={busy} onClick={close} type="button" variant="secondary">
            {t("cancel")}
          </Button>
          <div ref={setActionsContainer} className="contents" />
        </>
      }
    >
      {isEmpty ? (
        <>
          {empty}
          {(action.ambiguous || action.pending) && (
            <ProviderActionFeedback action={action} labels={labels.feedbackLabels} />
          )}
        </>
      ) : (
        <>
          {status.state !== "ready" && (
            <ProviderReadFeedback
              state={status.state}
              labels={labels.feedbackLabels}
              refresh={() => {
                onReload();
                status.refresh();
              }}
            />
          )}
          {status.state !== "ready" && !verified ? null : (
            <div hidden={status.state !== "ready"}>
              <ProviderAllocationPanel
                connectionIds={props.connections.map((item) => item.connectionId)}
                rowFilter={props.surface ? selectedRow : undefined}
                {...labels}
                labels={{
                  ...labels.labels,
                  reload:
                    action.state === "conflict" || action.state === "forbidden"
                      ? common("reload")
                      : labels.labels?.reload,
                }}
                variant="plain"
                formAdapter={formAdapter}
                actionsContainer={actionsContainer}
                inputPolicy={(row) => ({
                  ...allocationPolicy(row),
                  unitLabel: row.unit === "cents" ? "USD" : labels.formatUnit(row.unit),
                })}
                evidenceAvailable={status.state === "ready" && !result.refreshing}
                canEdit={status.state === "ready"}
                suggestionEligible={suggestionEligible}
                canRefreshBalance={(row) =>
                  row.fundingSource === "byok" &&
                  row.editable &&
                  (row as NativeAllocationRow).availabilityReason !== "owner_only"
                }
                onRefreshPendingChange={setRefreshing}
                onRefreshNative={async (row) => {
                  const identity = {
                    id: row.id,
                    connectionId: row.connectionId,
                    fundingSource: row.fundingSource,
                    surface: row.surface,
                    unit: row.unit,
                    revision: row.revision,
                  };
                  const answer = await refreshProviderConnectionBudgetAction(
                    props.projectRef,
                    row.connectionId,
                    identity,
                  );
                  return answer.nativeObservation ?? null;
                }}
                renderNativeObservation={(observation, row) => (
                  <NativeAllocationObservation
                    observation={observation}
                    providerName={
                      props.connections.find(
                        (connection) => connection.connectionId === row.connectionId,
                      )?.provider ?? row.label
                    }
                  />
                )}
                evidenceBefore={(rows) => (
                  <AllocationEvidence
                    rows={rows}
                    connections={props.connections}
                    asOf={result.data?.asOf ?? null}
                  />
                )}
                help={
                  <div className="space-y-1 text-xs text-fg-muted">
                    <p>{t("appColumnHelp")}</p>
                    <p>{t("programmaticColumnHelp")}</p>
                    <p>{t("consequence")}</p>
                  </div>
                }
                emptyState={empty}
                feedbackMessage={(subject) => ({
                  code:
                    subject.kind === "read"
                      ? subject.state
                      : subject.ambiguous
                        ? "ambiguous"
                        : (subject.result?.outcome ?? "unavailable"),
                })}
                formatFeedback={({ code }) =>
                  code === "invalid"
                    ? t("invalidBudget")
                    : code === "success"
                      ? t("saved")
                      : code === "empty"
                        ? t("empty")
                        : common(
                            code === "forbidden" ||
                              code === "conflict" ||
                              code === "ambiguous" ||
                              code === "loading"
                              ? code
                              : "unavailable",
                          )
                }
                onReload={() => {
                  onReload();
                  if (action.state === "forbidden" || status.state !== "ready") status.refresh();
                }}
                onSaved={() => {
                  router.refresh();
                  props.onSaved();
                }}
              />
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
