"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { DeleteDeployHookModal } from "@/components/settings/developers/DeleteDeployHookModal";
import { DeveloperActionsMenu } from "@/components/settings/developers/DeveloperActionsMenu";
import { DeveloperCardFrame } from "@/components/settings/developers/DeveloperCardFrame";
import {
  developerCardGeometryClassNames,
  developerListClassName,
  developerRowClassName,
} from "@/components/settings/developers/developer-settings-layout";
import { useDeveloperActionError } from "@/components/settings/developers/useDeveloperActionError";
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
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatDisplayDateTime } from "@/lib/dates/format";
import { mutateIngestHookSchema } from "@/lib/schemas/ingestHook";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const dateDisplay = useDateDisplay();
  const router = useRouter();
  const presentActionError = useDeveloperActionError();
  const t = useTranslations("projectSettingsDevelopers.webhooks");
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
          setMessage(presentActionError.webhook(error, t("errors.update"))),
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
          setMessage(presentActionError.webhook(error, t("errors.rotate"))),
        );
    });
  }

  function sendTest(hook: DeployHookData) {
    if (!sendTestHook) return;
    const input = mutateIngestHookSchema.parse({ hookId: hook.id, projectId });
    setTestResult({ hookId: hook.id, message: t("sending") });
    startTransition(() => {
      void sendTestHook(input)
        .then((result) => {
          setTestResult({
            hookId: hook.id,
            href: result.signalHref,
            message: t("testCreated"),
          });
          router.refresh();
        })
        .catch((error: unknown) =>
          setTestResult({
            hookId: hook.id,
            message: presentActionError.webhook(error, t("errors.test")),
          }),
        );
    });
  }

  return (
    <DeveloperCardFrame
      className={developerCardGeometryClassNames.deployWebhooks}
      description={
        <>
          <p className="m-0">{t("inbound")}</p>
          <p className="m-0 mt-1">{t("outbound")}</p>
        </>
      }
      footer={
        createHook ? (
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            startIcon={<Plus aria-hidden size={14} weight="regular" />}
            type="button"
          >
            {t("add")}
          </Button>
        ) : null
      }
      id="deploy-webhooks"
      title={t("title")}
    >
      <div className={developerListClassName}>
        {hooks.length ? (
          hooks.map((hook) => (
            <div className={developerRowClassName} data-deploy-hook-row="" key={hook.id}>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold">{hook.label}</span>
                <span className="mt-0.5 block text-[11.5px] text-fg-muted">
                  {t("created", {
                    date: formatDisplayDateTime(new Date(hook.createdAt), dateDisplay),
                  })}{" "}
                  ·{" "}
                  {hook.lastUsedAt
                    ? t("lastUsed", {
                        date: formatDisplayDateTime(new Date(hook.lastUsedAt), dateDisplay),
                      })
                    : t("lastUsedNever")}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-fg-muted">
                  {hook.disabled ? t("disabledDescription") : t("sendTestDescription")}
                </span>
                {testResult?.hookId === hook.id ? (
                  <span className="mt-1 block text-[11.5px] text-fg-muted">
                    {testResult.message}{" "}
                    {testResult.href ? (
                      <Link
                        className="font-medium text-accent-text hover:underline"
                        href={testResult.href}
                      >
                        {t("viewSignal")}
                      </Link>
                    ) : null}
                  </span>
                ) : null}
              </span>
              <span className="flex flex-wrap items-center justify-end gap-2">
                {hook.disabled ? (
                  <StatusPill label={t("disabled")} showDot={false} status="optional" />
                ) : null}
                {sendTestHook && !hook.disabled ? (
                  <Button
                    aria-label={t("sendTestFor", { label: hook.label })}
                    disabled={isPending}
                    onClick={() => sendTest(hook)}
                    size="xs"
                    type="button"
                    variant="secondary"
                  >
                    {t("sendTest")}
                  </Button>
                ) : null}
                {rotateHook || disableHook || deleteHook ? (
                  <DeveloperActionsMenu
                    ariaLabel={t("actionsFor", { label: hook.label })}
                    items={[
                      ...(!hook.disabled && rotateHook
                        ? [
                            {
                              disabled: isPending,
                              label: t("rotate"),
                              onSelect: () => rotate(hook),
                            },
                          ]
                        : []),
                      ...(!hook.disabled && disableHook
                        ? [
                            {
                              disabled: isPending,
                              label: t("disable"),
                              onSelect: () => mutate(hook, disableHook, t("disabledSuccess")),
                            },
                          ]
                        : []),
                      ...(deleteHook
                        ? [
                            {
                              danger: true,
                              disabled: isPending,
                              label: t("delete"),
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
                {t("emptyTitle")}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-fg-muted">
                {t("emptyDescription")}
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
          onConfirm={() => mutate(deleteTarget, deleteHook, t("deletedSuccess"))}
          open
        />
      ) : null}
    </DeveloperCardFrame>
  );
}
