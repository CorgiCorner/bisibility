"use client";

import { ProviderUiFeedback } from "@/components/provider-management/ProviderUiFeedback";
import {
  ProviderUiProvider,
  useProviderUiStatus,
} from "@/components/provider-management/ProviderUiProvider";
import type { ProviderFeedbackLabels } from "@/components/usagekit/provider-feedback";
import {
  type ProviderRateLabels,
  ProviderRatePanel,
} from "@/components/usagekit/provider-rate-editor";
import { useProviderAction, useProviderConnection, useProviderConnections } from "@usagekit/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

type ConnectionRatePanelProps = {
  connected: boolean;
  projectId: string;
  providerId: string;
  /** Hosted credentials use Bisibility's rates, which the project cannot override. */
  readOnlyRates?: boolean;
};

function useRateLabels(): Partial<ProviderRateLabels> {
  const t = useTranslations("projectIntegrations.rates");
  return {
    title: t("title"),
    platformTitle: t("platformTitle"),
    platformNote: t("platformNote"),
    description: t("help"),
    save: t("save"),
    reset: t("clearRate"),
    useMeasured: t("useMeasured"),
    useList: t("useList"),
    price: t("price"),
    currency: t("currency"),
    version: t("version"),
    checked: t("checked"),
    samples: t("samples"),
    operation: t("operation"),
    funding: t("funding"),
    fallback: t("withoutYourRate"),
    unknown: t("unknown"),
    notSet: t("notSet"),
    empty: t("empty"),
    manual: t("statusManual"),
    measured: t("statusMeasured"),
    list: t("statusList"),
    noRate: t("statusNone"),
    invalid: t("invalidPrice"),
    per: t("per"),
    reload: t("reload"),
  };
}

/** The shared provider copy: the same status and recovery wording as the other provider settings. */
function useFeedbackLabels(): Partial<ProviderFeedbackLabels> {
  const t = useTranslations("projectIntegrations.providerManagement");
  const rates = useTranslations("projectIntegrations.rates");
  return {
    readOnly: t("readOnly"),
    pending: rates("applying"),
    success: rates("applied"),
    forbidden: t("forbidden"),
    invalid: rates("invalidPrice"),
    conflict: t("conflict"),
    unknown: t("ambiguous"),
    reconcile: t("reconcile"),
    notApplied: rates("notApplied"),
    unavailable: t("unavailable"),
    loading: t("loading"),
    empty: rates("noEvidence"),
    reload: t("reload"),
    own: rates("fundingOwn"),
    platform: rates("fundingCredits"),
  };
}

function BoundRatePanel({
  connectionId,
  readOnlyRates,
}: {
  connectionId: string;
  readOnlyRates: boolean;
}) {
  const labels = useRateLabels();
  const feedbackLabels = useFeedbackLabels();
  const status = useProviderUiStatus();
  const action = useProviderAction();
  const details = useProviderConnection({ connectionId });
  const fundingSource = details.data?.connection?.fundingSource;
  const [editorSource, setEditorSource] = useState(fundingSource);
  // A failed read withdraws evidence, but does not discard the editor's draft.
  // Only a confirmed funding change replaces that editor.
  if (fundingSource !== undefined && fundingSource !== editorSource) setEditorSource(fundingSource);
  // A drawer source change can arrive before the shared connection read catches up.
  if (readOnlyRates && details.data?.connection?.fundingSource !== "platform")
    return (
      <ProviderUiFeedback
        action={action}
        onReload={details.refresh}
        readState={details.state === "ok" ? "unavailable" : details.state}
        refreshing={details.refreshing}
      />
    );
  return (
    <ProviderRatePanel
      key={`${connectionId}:${editorSource ?? "loading"}`}
      connectionId={connectionId}
      labels={labels}
      feedbackLabels={feedbackLabels}
      canEdit={!readOnlyRates}
      onReload={() => {
        if (action.state !== "forbidden") return;
        action.reset();
        status.refresh();
      }}
    />
  );
}

function Rates({
  providerId,
  readOnlyRates = false,
}: Readonly<Omit<ConnectionRatePanelProps, "connected" | "projectId">>) {
  const status = useProviderUiStatus();
  const action = useProviderAction();
  const snapshot = useProviderConnections({ provider: providerId });
  // An ambiguous match is never edited.
  const matches = snapshot.data?.connections.filter((item) => item.provider === providerId) ?? [];
  if (status.state === "ready" && matches.length === 1)
    return <BoundRatePanel connectionId={matches[0].id} readOnlyRates={readOnlyRates} />;
  if (status.state === "ready" && snapshot.state === "ok") return null;
  // Until access is verified and the connection read, the shared access feedback explains why.
  return (
    <ProviderUiFeedback
      action={action}
      onReload={snapshot.refresh}
      readState={snapshot.state}
      refreshing={snapshot.refreshing}
    />
  );
}

export function ConnectionRatePanel({
  connected,
  projectId,
  ...props
}: Readonly<ConnectionRatePanelProps>) {
  // A connect flow has no connection yet, so there is no access to verify or rate to read.
  if (!connected) return null;
  return (
    <ProviderUiProvider projectId={projectId}>
      <Rates {...props} />
    </ProviderUiProvider>
  );
}
