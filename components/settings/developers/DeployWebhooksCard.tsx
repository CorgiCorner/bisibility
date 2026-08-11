"use client";

import { DeleteDeployHookModal } from "@/components/settings/developers/DeleteDeployHookModal";
import { DeveloperActionsMenu } from "@/components/settings/developers/DeveloperActionsMenu";
import { DeveloperCardFrame } from "@/components/settings/developers/DeveloperCardFrame";
import {
  developerCardGeometryClassNames,
  developerListClassName,
  developerRowClassName,
} from "@/components/settings/developers/developer-settings-layout";
import { DeployHookCreateModal } from "@/components/settings/webhooks/DeployHookCreateModal";
import { DeployHookRotationModal } from "@/components/settings/webhooks/DeployHookRotationModal";
import type {
  CreateDeployHookAction,
  DeployHookData,
  IssuedDeployHook,
  MutateDeployHookAction,
  RotateDeployHookAction,
  SendDeployHookTestAction,
} from "@/components/settings/webhooks/deploy-hook-model";
import { Button, StatusPill } from "@/components/ui";
import { mutateIngestHookSchema } from "@/lib/schemas/ingestHook";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { PlusIcon as Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type DeployWebhooksCardProps = {
  createHook?: CreateDeployHookAction;
  deleteHook?: MutateDeployHookAction;
  disableHook?: MutateDeployHookAction;
  endpointUrl: string;
  hooks: readonly DeployHookData[];
  projectId: string;
  rotateHook?: RotateDeployHookAction;
  sendTestHook?: SendDeployHookTestAction;
};

type TestResult = {
  hookId: string;
  href?: string;
  message: string;
};

export function DeployWebhooksCard({
  createHook,
  deleteHook,
  disableHook,
  endpointUrl,
  hooks,
  projectId,
  rotateHook,
  sendTestHook,
}: Readonly<DeployWebhooksCardProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeployHookData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rotatedHook, setRotatedHook] = useState<IssuedDeployHook | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  function mutate(
    hook: DeployHookData,
    action: MutateDeployHookAction | undefined,
    successMessage: string,
  ) {
    if (!action) return;
    const input = mutateIngestHookSchema.parse({ hookId: hook.id, projectId });
    startTransition(() => {
      void action(input)
        .then(() => {
          setMessage(successMessage);
          setDeleteTarget(null);
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Deploy hook could not be updated.")),
        );
    });
  }

  function rotate(hook: DeployHookData) {
    if (!rotateHook) return;
    const input = mutateIngestHookSchema.parse({ hookId: hook.id, projectId });
    startTransition(() => {
      void rotateHook(input)
        .then((issued) => {
          setRotatedHook(issued);
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Deploy hook could not be rotated.")),
        );
    });
  }

  function sendTest(hook: DeployHookData) {
    if (!sendTestHook) return;
    const input = mutateIngestHookSchema.parse({ hookId: hook.id, projectId });
    setTestResult({ hookId: hook.id, message: "Sending test event..." });
    startTransition(() => {
      void sendTestHook(input)
        .then((result) => {
          setTestResult({
            hookId: hook.id,
            href: result.signalHref,
            message: "Test event created.",
          });
          router.refresh();
        })
        .catch((error: unknown) =>
          setTestResult({
            hookId: hook.id,
            message: actionErrorMessage(error, "Deploy hook test event failed."),
          }),
        );
    });
  }

  return (
    <DeveloperCardFrame
      className={developerCardGeometryClassNames.deployWebhooks}
      description={
        <>
          <p className="m-0">
            Inbound: your CI calls bisibility after a deploy and the call becomes a timeline signal.
          </p>
          <p className="m-0 mt-1">
            The outbound webhook is the alert channel on Notifications, not this.
          </p>
        </>
      }
      footer={
        createHook ? (
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            startIcon={<Plus aria-hidden size={14} weight="bold" />}
            type="button"
          >
            Add deploy hook
          </Button>
        ) : null
      }
      id="deploy-webhooks"
      title="Deploy webhooks"
    >
      <div className={developerListClassName}>
        {hooks.length ? (
          hooks.map((hook) => (
            <div className={developerRowClassName} data-deploy-hook-row="" key={hook.id}>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold">{hook.label}</span>
                <span className="mt-0.5 block text-[11.5px] text-fg-muted">
                  {hook.createdLabel} · {hook.lastUsedLabel}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-fg-muted">
                  {hook.disabled
                    ? "Disabled: the row and the token stay."
                    : "Send test posts a real signal and links to it."}
                </span>
                {testResult?.hookId === hook.id ? (
                  <span className="mt-1 block text-[11.5px] text-fg-muted">
                    {testResult.message}{" "}
                    {testResult.href ? (
                      <Link
                        className="font-medium text-accent-text hover:underline"
                        href={testResult.href}
                      >
                        View signal
                      </Link>
                    ) : null}
                  </span>
                ) : null}
              </span>
              <span className="flex flex-wrap items-center justify-end gap-2">
                {hook.disabled ? (
                  <StatusPill label="Disabled" showDot={false} status="optional" />
                ) : null}
                {sendTestHook && !hook.disabled ? (
                  <Button
                    aria-label={`Send ${hook.label} test event`}
                    disabled={isPending}
                    onClick={() => sendTest(hook)}
                    size="xs"
                    type="button"
                    variant="secondary"
                  >
                    Send test
                  </Button>
                ) : null}
                {rotateHook || disableHook || deleteHook ? (
                  <DeveloperActionsMenu
                    ariaLabel={`${hook.label} hook actions`}
                    items={[
                      ...(!hook.disabled && rotateHook
                        ? [
                            {
                              disabled: isPending,
                              label: "Rotate token",
                              onSelect: () => rotate(hook),
                            },
                          ]
                        : []),
                      ...(!hook.disabled && disableHook
                        ? [
                            {
                              disabled: isPending,
                              label: "Disable hook",
                              onSelect: () => mutate(hook, disableHook, "Deploy hook disabled."),
                            },
                          ]
                        : []),
                      ...(deleteHook
                        ? [
                            {
                              danger: true,
                              disabled: isPending,
                              label: "Delete hook",
                              onSelect: () => setDeleteTarget(hook),
                            },
                          ]
                        : []),
                    ]}
                  />
                ) : null}
              </span>
            </div>
          ))
        ) : (
          <div className={developerRowClassName}>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-fg-muted">
                No deploy hooks yet
              </span>
              <span className="mt-0.5 block text-[11.5px] text-fg-muted">
                Add a hook to turn deploy events into timeline signals.
              </span>
            </span>
          </div>
        )}
      </div>
      {message ? <p className="m-0 text-[11.5px] text-fg-muted">{message}</p> : null}
      <DeployHookCreateModal
        createHook={createHook}
        endpointUrl={endpointUrl}
        onClose={() => setCreateOpen(false)}
        onCreated={() => router.refresh()}
        open={createOpen}
        projectId={projectId}
      />
      <DeployHookRotationModal
        endpointUrl={endpointUrl}
        issuedHook={rotatedHook}
        onClose={() => setRotatedHook(null)}
      />
      {deleteTarget ? (
        <DeleteDeployHookModal
          busy={isPending}
          hookLabel={deleteTarget.label}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => mutate(deleteTarget, deleteHook, "Deploy hook deleted.")}
          open
        />
      ) : null}
    </DeveloperCardFrame>
  );
}
