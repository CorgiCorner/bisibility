"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { ApiKeyCreateModal } from "@/components/settings/api-keys/ApiKeyCreateModal";
import { ApiKeyRollModal } from "@/components/settings/api-keys/ApiKeyRollModal";
import type { ApiKeyData, IssuedApiKey } from "@/components/settings/api-keys/api-key-model";
import { DeveloperActionsMenu } from "@/components/settings/developers/DeveloperActionsMenu";
import { DeveloperCardFrame } from "@/components/settings/developers/DeveloperCardFrame";
import {
  developerCardGeometryClassNames,
  developerListClassName,
  developerRowClassName,
} from "@/components/settings/developers/developer-settings-layout";
import { useDeveloperActionError } from "@/components/settings/developers/useDeveloperActionError";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatDisplayDateTime } from "@/lib/dates/format";
import {
  type IssueApiKeyInput,
  type RegenerateApiKeyInput,
  revokeApiKeySchema,
} from "@/lib/schemas/apiKey";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { z } from "zod";

type RevokeForm = z.infer<typeof revokeApiKeySchema>;

type ApiKeysCardProps = {
  apiKeys: readonly ApiKeyData[];
  docsHref: string;
  issueKey?: (input: IssueApiKeyInput) => Promise<IssuedApiKey>;
  projectId: string;
  regenerateKey?: (input: RegenerateApiKeyInput) => Promise<IssuedApiKey>;
  revokeKey?: (input: RevokeForm) => Promise<unknown>;
};

export function ApiKeysCard({
  apiKeys,
  docsHref,
  issueKey,
  projectId,
  regenerateKey,
  revokeKey,
}: Readonly<ApiKeysCardProps>) {
  const dateDisplay = useDateDisplay();
  const router = useRouter();
  const presentActionError = useDeveloperActionError();
  const t = useTranslations("projectSettingsDevelopers.apiKeys");
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyData | null>(null);
  const [rollTarget, setRollTarget] = useState<ApiKeyData | null>(null);

  function createdLabel(apiKey: ApiKeyData) {
    return t("created", { date: formatDisplayDateTime(new Date(apiKey.createdAt), dateDisplay) });
  }

  function lastUsedLabel(apiKey: ApiKeyData) {
    return apiKey.lastUsedAt
      ? t("lastUsed", { date: formatDisplayDateTime(new Date(apiKey.lastUsedAt), dateDisplay) })
      : t("lastUsedNever");
  }

  function expiryLabel(apiKey: ApiKeyData) {
    if (!apiKey.expiresAt) return t("neverExpires");
    const date = formatDisplayDateTime(new Date(apiKey.expiresAt), dateDisplay);
    return apiKey.isExpired ? t("expired", { date }) : t("expires", { date });
  }

  function revoke() {
    if (!revokeTarget || !revokeKey) return;
    const input = revokeApiKeySchema.parse({ apiKeyId: revokeTarget.id, projectId });
    startTransition(() => {
      void revokeKey(input)
        .then(() => {
          setMessage(t("revoked"));
          setRevokeTarget(null);
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(presentActionError.apiKey(error, t("errors.revoke"))),
        );
    });
  }

  return (
    <DeveloperCardFrame
      className={developerCardGeometryClassNames.apiKeys}
      description={t("description")}
      footer={
        <>
          <ExternalLink
            className="rounded-control border border-border-control bg-bg-elev px-3 py-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
            href={docsHref}
          >
            {t("docsQuickstart")}
          </ExternalLink>
          {issueKey ? (
            <Button
              onClick={() => setCreateOpen(true)}
              size="sm"
              startIcon={<Plus aria-hidden size={14} weight="regular" />}
              type="button"
            >
              {t("create")}
            </Button>
          ) : null}
        </>
      }
      id="api-keys"
      title={t("title")}
    >
      <div className={developerListClassName}>
        {apiKeys.length ? (
          apiKeys.map((apiKey) => (
            <div className={developerRowClassName} data-api-key-row="" key={apiKey.id}>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold">{apiKey.name}</span>
                <span className="mt-0.5 truncate">{apiKey.maskedValue}</span>
                <span className="mt-0.5 block text-[11.5px] text-fg-muted">
                  {createdLabel(apiKey)} · {lastUsedLabel(apiKey)}
                </span>
              </span>
              <span className="flex flex-wrap items-center justify-end gap-2">
                <StatusPill
                  label={expiryLabel(apiKey)}
                  showDot={false}
                  status={apiKey.isExpired ? "needs_reauth" : "optional"}
                />
                {regenerateKey || revokeKey ? (
                  <DeveloperActionsMenu
                    ariaLabel={t("actionsFor", { name: apiKey.name })}
                    items={[
                      {
                        disabled: !regenerateKey || isPending,
                        label: t("roll"),
                        onSelect: () => setRollTarget(apiKey),
                      },
                      {
                        danger: true,
                        disabled: !revokeKey || isPending,
                        label: t("revoke"),
                        onSelect: () => setRevokeTarget(apiKey),
                      },
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
      <ApiKeyCreateModal
        issueKey={issueKey}
        onClose={() => setCreateOpen(false)}
        onIssued={() => router.refresh()}
        open={createOpen}
        projectId={projectId}
      />
      {rollTarget && regenerateKey ? (
        <ApiKeyRollModal
          apiKey={rollTarget}
          onClose={() => setRollTarget(null)}
          onRolled={() => router.refresh()}
          projectId={projectId}
          regenerateKey={regenerateKey}
        />
      ) : null}
      {revokeTarget ? (
        <ConfirmModal
          busy={isPending}
          kind="revokeKey"
          onClose={() => setRevokeTarget(null)}
          onConfirm={revoke}
          open
          showConfirmationToast={false}
        />
      ) : null}
    </DeveloperCardFrame>
  );
}
