"use client";

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
import { Button, ConfirmModal, MonoText, StatusPill } from "@/components/ui";
import {
  type IssueApiKeyInput,
  type RegenerateApiKeyInput,
  revokeApiKeySchema,
} from "@/lib/schemas/apiKey";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { ArrowRightIcon as ArrowRight, PlusIcon as Plus } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyData | null>(null);
  const [rollTarget, setRollTarget] = useState<ApiKeyData | null>(null);

  function revoke() {
    if (!revokeTarget || !revokeKey) return;
    const input = revokeApiKeySchema.parse({ apiKeyId: revokeTarget.id, projectId });
    startTransition(() => {
      void revokeKey(input)
        .then(() => {
          setMessage("API key revoked.");
          setRevokeTarget(null);
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "API key could not be revoked.")),
        );
    });
  }

  return (
    <DeveloperCardFrame
      className={developerCardGeometryClassNames.apiKeys}
      description="Keys for the bisibility API, each with a scope and an expiry."
      footer={
        <>
          <Button
            endIcon={<ArrowRight aria-hidden size={13} />}
            href={docsHref}
            size="sm"
            variant="secondary"
          >
            Docs quickstart
          </Button>
          {issueKey ? (
            <Button
              onClick={() => setCreateOpen(true)}
              size="sm"
              startIcon={<Plus aria-hidden size={14} weight="bold" />}
              type="button"
            >
              Create key
            </Button>
          ) : null}
        </>
      }
      id="api-keys"
      title="API keys"
    >
      <div className={developerListClassName}>
        {apiKeys.length ? (
          apiKeys.map((apiKey) => (
            <div className={developerRowClassName} data-api-key-row="" key={apiKey.id}>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold">{apiKey.name}</span>
                <MonoText className="mt-0.5 truncate" size="lg">
                  {apiKey.maskedValue}
                </MonoText>
                <span className="mt-0.5 block text-[11.5px] text-fg-muted">
                  {apiKey.createdLabel} · {apiKey.lastUsedLabel}
                </span>
              </span>
              <span className="flex flex-wrap items-center justify-end gap-2">
                <StatusPill
                  label={apiKey.expiresLabel}
                  showDot={false}
                  status={apiKey.isExpired ? "needs_reauth" : "optional"}
                />
                {regenerateKey || revokeKey ? (
                  <DeveloperActionsMenu
                    ariaLabel={`${apiKey.name} key actions`}
                    items={[
                      {
                        disabled: !regenerateKey || isPending,
                        label: "Roll key",
                        onSelect: () => setRollTarget(apiKey),
                      },
                      {
                        danger: true,
                        disabled: !revokeKey || isPending,
                        label: "Revoke key",
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
              <span className="block text-[13.5px] font-semibold text-fg-muted">No keys yet</span>
              <span className="mt-0.5 block text-[11.5px] text-fg-muted">
                The first key is made with Create key.
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
