"use client";

import { Button, useToast } from "@/components/ui";
import { runOpsSweepNow, sendTestSlackNotification } from "@/lib/actions/instance-admin";
import { PaperPlaneTiltIcon as PaperPlaneTilt, WrenchIcon as Wrench } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type PendingAction = "send-test" | "sweep" | null;

export function AdminOpsActions({ slackConfigured }: Readonly<{ slackConfigured: boolean }>) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pending, startTransition] = useTransition();

  function run(action: Exclude<PendingAction, null>) {
    setPendingAction(action);
    startTransition(async () => {
      try {
        const result =
          action === "send-test" ? await sendTestSlackNotification() : await runOpsSweepNow();
        const succeeded = result.status === "delivered" || result.status === "completed";
        showToast(result.message, { tint: succeeded ? "green" : "yellow" });
        router.refresh();
      } catch {
        showToast("The operator action could not be completed.", { tint: "red" });
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
        loadingLabel="Sending..."
        onClick={() => run("send-test")}
        size="sm"
        startIcon={<PaperPlaneTilt aria-hidden size={14} />}
        type="button"
        variant="secondary"
      >
        Send test notification
      </Button>
      <Button
        disabled={!slackConfigured || pending}
        loading={pendingAction === "sweep"}
        loadingLabel="Running..."
        onClick={() => run("sweep")}
        size="sm"
        startIcon={<Wrench aria-hidden size={14} />}
        type="button"
        variant="secondary"
      >
        Run outbox sweep
      </Button>
    </div>
  );
}
