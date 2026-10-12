"use client";

import { useProviderUiStatus } from "@/components/provider-management/ProviderUiProvider";
import { Button } from "@/components/ui/Button";
import type { ProviderAction } from "@usagekit/react";
import type { ViewState } from "@usagekit/views";
import { useTranslations } from "next-intl";

export function ProviderUiFeedback({
  action,
  onReload,
  readState,
  refreshing = false,
}: Readonly<{
  action: ProviderAction;
  onReload?: () => void;
  readState?: "loading" | ViewState;
  refreshing?: boolean;
}>) {
  const t = useTranslations("projectIntegrations.providerManagement");
  const status = useProviderUiStatus();
  const evidenceState = status.state === "ready" ? readState : undefined;
  const message = action.ambiguous
    ? "ambiguous"
    : action.state === "conflict"
      ? "conflict"
      : action.state === "forbidden" ||
          status.state === "forbidden" ||
          evidenceState === "forbidden"
        ? "forbidden"
        : action.state === "invalid" ||
            action.state === "unavailable" ||
            status.state === "unavailable" ||
            evidenceState === "unavailable"
          ? "unavailable"
          : status.state === "loading" || evidenceState === "loading"
            ? "loading"
            : !action.canWrite
              ? "readOnly"
              : null;
  if (!message) return null;
  return (
    <div className="border-t border-border px-3.5 py-3 text-xs text-fg-muted">
      <p className="m-0" role={message === "loading" ? "status" : "alert"}>
        {t(message)}
      </p>
      {action.ambiguous ? (
        <Button
          className="mt-2"
          disabled={!action.canReconcile || action.pending}
          onClick={() => void action.reconcile()}
          size="xs"
          variant="secondary"
        >
          {t("reconcile")}
        </Button>
      ) : action.state === "conflict" ||
        action.state === "forbidden" ||
        action.state === "unavailable" ||
        status.state === "unavailable" ||
        status.state === "forbidden" ||
        evidenceState === "unavailable" ||
        evidenceState === "forbidden" ? (
        <Button
          className="mt-2"
          disabled={action.pending || refreshing}
          onClick={() => {
            action.reset();
            status.refresh();
            onReload?.();
          }}
          size="xs"
          variant="secondary"
        >
          {t("reload")}
        </Button>
      ) : null}
    </div>
  );
}
