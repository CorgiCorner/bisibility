"use client";

import { presentAdminActionError } from "@/components/admin/admin-action-error";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast-context";
import { runOpsSweepNow, sendTestSlackNotification } from "@/lib/actions/instance-admin";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { WrenchIcon as Wrench } from "@phosphor-icons/react/dist/csr/Wrench";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

type PendingAction = "send-test" | "sweep" | null;
type OpsResult =
  | Awaited<ReturnType<typeof runOpsSweepNow>>
  | Awaited<ReturnType<typeof sendTestSlackNotification>>;

function opsMessage(
  action: Exclude<PendingAction, null>,
  result: OpsResult,
  t: ReturnType<typeof useTranslations<"instanceAdmin.opsActions">>,
) {
  if (result.status === "delivered") return t("delivered");
  if (result.status === "not_configured") return t("notConfigured");
  if (result.status === "delivery_failed") return t("deliveryFailed");
  if (result.status === "forbidden") return t("forbidden");
  if (result.status === "rate_limited") return t("rateLimited");
  if (result.status === "completed") {
    return t("sweepCompleted", { attempted: result.attempted, delivered: result.delivered });
  }
  return action === "sweep" ? t("sweepFailed") : t("temporarilyUnavailable");
}

function opsSeverity(result: OpsResult) {
  if (result.status === "delivered" || result.status === "completed") return "success" as const;
  if (
    result.status === "failed" ||
    result.status === "forbidden" ||
    result.status === "delivery_failed"
  ) {
    return "error" as const;
  }
  return "warning" as const;
}

export function AdminOpsActions({ slackConfigured }: Readonly<{ slackConfigured: boolean }>) {
  const router = useRouter();
  const { showToast } = useToast();
  const sharedErrors = useSharedErrorMessages();
  const t = useTranslations("instanceAdmin.opsActions");
  const controls = useTranslations("instanceAdmin.controls");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pending, startTransition] = useTransition();

  function run(action: Exclude<PendingAction, null>) {
    setPendingAction(action);
    startTransition(async () => {
      try {
        const result =
          action === "send-test" ? await sendTestSlackNotification() : await runOpsSweepNow();
        showToast(opsMessage(action, result, t), { severity: opsSeverity(result) });
        router.refresh();
      } catch (error) {
        const message = presentAdminActionError(error, sharedErrors, t("failed"));
        showToast(message, { severity: "error" });
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        disabled={!slackConfigured || pending}
        loading={pendingAction === "send-test"}
        loadingLabel={controls("sending")}
        onClick={() => run("send-test")}
        size="sm"
        startIcon={<PaperPlaneTilt aria-hidden size={14} weight="regular" />}
        type="button"
        variant="secondary"
      >
        {controls("sendTestNotification")}
      </Button>
      <Button
        disabled={!slackConfigured || pending}
        loading={pendingAction === "sweep"}
        loadingLabel={controls("running")}
        onClick={() => run("sweep")}
        size="sm"
        startIcon={<Wrench aria-hidden size={14} weight="regular" />}
        type="button"
        variant="secondary"
      >
        {controls("runOutboxSweep")}
      </Button>
    </div>
  );
}
