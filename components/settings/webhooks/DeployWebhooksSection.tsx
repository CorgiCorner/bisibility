"use client";

import { SettingsSection } from "@/components/settings/SettingsSection";
import { Button, MonoText } from "@/components/ui";
import { mutateIngestHookSchema } from "@/lib/schemas/ingestHook";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  PaperPlaneTiltIcon as PaperPlaneTilt,
  PlugsIcon as Plugs,
  PlusIcon as Plus,
  PowerIcon as Power,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DeployHookCreateModal } from "./DeployHookCreateModal";
import { DeployHookRotationModal } from "./DeployHookRotationModal";
import type {
  CreateDeployHookAction,
  DeployHookData,
  IssuedDeployHook,
  MutateDeployHookAction,
  RotateDeployHookAction,
  SendDeployHookTestAction,
} from "./deploy-hook-model";

export type DeployWebhooksSectionProps = {
  createHook?: CreateDeployHookAction;
  deleteHook?: MutateDeployHookAction;
  disableHook?: MutateDeployHookAction;
  endpointUrl: string;
  hooks: readonly DeployHookData[];
  projectId?: string;
  rotateHook?: RotateDeployHookAction;
  sendTestHook?: SendDeployHookTestAction;
};

const iconButtonClass =
  "grid h-[30px] w-[30px] place-items-center rounded-lg border border-border-strong bg-bg-elev text-fg-muted hover:border-accent hover:text-accent-text disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted";
const feedbackClass = "text-[11.5px] font-medium text-fg-muted";

export function DeployWebhooksSection({
  createHook,
  deleteHook,
  disableHook,
  endpointUrl,
  hooks,
  projectId,
  rotateHook,
  sendTestHook,
}: Readonly<DeployWebhooksSectionProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rotatedHook, setRotatedHook] = useState<IssuedDeployHook | null>(null);
  const [testResult, setTestResult] = useState<{
    hookId: string;
    href?: string;
    message: string;
  } | null>(null);
  const canCreate = Boolean(projectId && createHook);
  const hasHooks = hooks.length > 0;

  function mutateHook(
    hookId: string,
    action: MutateDeployHookAction | undefined,
    successMessage: string,
    fallbackMessage: string,
  ) {
    if (!projectId || !action) return;

    setMessage(null);
    startTransition(() => {
      const input = mutateIngestHookSchema.parse({ hookId, projectId });
      void action(input)
        .then(() => {
          setMessage(successMessage);
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : fallbackMessage),
        );
    });
  }

  function rotate(hookId: string) {
    if (!projectId || !rotateHook) return;

    setMessage(null);
    startTransition(() => {
      const input = mutateIngestHookSchema.parse({ hookId, projectId });
      void rotateHook(input)
        .then((issued) => {
          setRotatedHook(issued);
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(
            error instanceof Error ? error.message : "Deploy webhook could not be rotated.",
          ),
        );
    });
  }

  function sendTest(hookId: string) {
    if (!projectId || !sendTestHook) return;

    setTestResult({ hookId, message: "Sending test event..." });
    startTransition(() => {
      const input = mutateIngestHookSchema.parse({ hookId, projectId });
      void sendTestHook(input)
        .then((result) => {
          setTestResult({
            hookId,
            href: result.signalHref,
            message: "Test event created.",
          });
          router.refresh();
        })
        .catch((error: unknown) =>
          setTestResult({
            hookId,
            message: error instanceof Error ? error.message : "Deploy webhook test event failed.",
          }),
        );
    });
  }

  return (
    <SettingsSection
      action={
        canCreate ? (
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            startIcon={<Plus aria-hidden size={14} weight="bold" />}
            type="button"
            variant="secondary"
          >
            Create webhook
          </Button>
        ) : null
      }
      description="Receive deploy-completed signals from generic JSON, Vercel, Netlify, or AWS Amplify via EventBridge."
      contentClassName="space-y-3"
      title="Deploy webhooks"
    >
      {hasHooks ? (
        <div className="divide-y divide-border-soft rounded-[10px] border border-border bg-bg-elev">
          {hooks.map((hook) => (
            <div
              className="flex flex-col items-stretch gap-3 p-3 sm:flex-row sm:items-center"
              key={hook.id}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                  {hook.label}
                  {hook.disabled ? (
                    <span className="rounded-full border border-border-strong px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
                      Disabled
                    </span>
                  ) : null}
                </span>
                <MonoText className="mt-0.5 truncate" size="lg">
                  {hook.id}
                </MonoText>
                <MonoText className="mt-1" muted>
                  {hook.createdLabel} · {hook.lastUsedLabel}
                </MonoText>
                {testResult?.hookId === hook.id ? (
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] font-medium text-fg-muted">
                    {testResult.message}
                    {testResult.href ? (
                      <Link className="text-accent-text hover:underline" href={testResult.href}>
                        View signal
                      </Link>
                    ) : null}
                  </span>
                ) : null}
              </span>
              {sendTestHook || rotateHook || disableHook || deleteHook ? (
                <span className="flex flex-none flex-wrap justify-end gap-1.5">
                  {sendTestHook ? (
                    <Button
                      aria-label={`Send ${hook.label} test event`}
                      disabled={isPending || hook.disabled || !projectId}
                      onClick={() => sendTest(hook.id)}
                      size="sm"
                      startIcon={<PaperPlaneTilt aria-hidden size={14} />}
                      type="button"
                      variant="ghost"
                    >
                      Send test
                    </Button>
                  ) : null}
                  {rotateHook ? (
                    <button
                      aria-label={`Rotate ${hook.label} webhook`}
                      className={iconButtonClass}
                      disabled={isPending || hook.disabled || !projectId}
                      onClick={() => rotate(hook.id)}
                      type="button"
                    >
                      <ArrowsClockwise size={14} />
                    </button>
                  ) : null}
                  {disableHook ? (
                    <button
                      aria-label={`Disable ${hook.label} webhook`}
                      className={iconButtonClass}
                      disabled={isPending || hook.disabled || !projectId}
                      onClick={() =>
                        mutateHook(
                          hook.id,
                          disableHook,
                          "Deploy webhook disabled.",
                          "Deploy webhook could not be disabled.",
                        )
                      }
                      type="button"
                    >
                      <Power size={14} />
                    </button>
                  ) : null}
                  {deleteHook ? (
                    <button
                      aria-label={`Delete ${hook.label} webhook`}
                      className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-border-strong bg-bg-elev text-red-text hover:border-red disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
                      disabled={isPending || !projectId}
                      onClick={() => {
                        const warning = `Delete ${hook.label}? Sources using this token will start failing immediately. This cannot be undone.`;
                        if (window.confirm(warning)) {
                          mutateHook(
                            hook.id,
                            deleteHook,
                            "Deploy webhook deleted.",
                            "Deploy webhook could not be deleted.",
                          );
                        }
                      }}
                      type="button"
                    >
                      <Trash size={14} />
                    </button>
                  ) : null}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-[14px] border border-border bg-bg-elev px-6 py-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-[13px] bg-bg-sunken text-fg-muted">
            <Plugs aria-hidden size={23} />
          </span>
          <div className="mt-3 text-[14.5px] font-semibold">No deploy webhooks yet</div>
          <p className="m-0 mt-1.5 max-w-[380px] text-[12.5px] leading-[1.55] text-fg-muted">
            Create an inbound hook to turn successful deploy events into timeline signals. Use an
            Authorization header when your provider supports it.
          </p>
          {canCreate ? (
            <Button
              onClick={() => setCreateOpen(true)}
              size="sm"
              startIcon={<Plus aria-hidden size={14} weight="bold" />}
              sx={{ marginTop: "16px" }}
              type="button"
            >
              Create your first webhook
            </Button>
          ) : null}
        </div>
      )}
      {message ? <span className={feedbackClass}>{message}</span> : null}
      {canCreate ? (
        <DeployHookCreateModal
          createHook={createHook}
          endpointUrl={endpointUrl}
          onClose={() => setCreateOpen(false)}
          onCreated={() => router.refresh()}
          open={createOpen}
          projectId={projectId}
        />
      ) : null}
      <DeployHookRotationModal
        endpointUrl={endpointUrl}
        issuedHook={rotatedHook}
        onClose={() => setRotatedHook(null)}
      />
    </SettingsSection>
  );
}
