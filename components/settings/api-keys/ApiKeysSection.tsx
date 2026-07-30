"use client";

import { SettingsSection } from "@/components/settings/SettingsSection";
import { Button, ConfirmModal, MonoText } from "@/components/ui";
import {
  type IssueApiKeyInput,
  type RegenerateApiKeyInput,
  revokeApiKeySchema,
} from "@/lib/schemas/apiKey";
import { actionErrorMessage } from "@/lib/ui/action-error";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  KeyIcon as Key,
  PlusIcon as Plus,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { z } from "zod";
import { ApiKeyCreateModal } from "./ApiKeyCreateModal";
import { ApiKeyRollModal } from "./ApiKeyRollModal";
import type { ApiKeyData, IssuedApiKey } from "./api-key-model";

type RevokeForm = z.infer<typeof revokeApiKeySchema>;

export type ApiKeysSectionProps = {
  apiKeys: readonly ApiKeyData[];
  issueKey?: (input: IssueApiKeyInput) => Promise<IssuedApiKey>;
  projectId?: string;
  regenerateKey?: (input: RegenerateApiKeyInput) => Promise<IssuedApiKey>;
  revokeKey?: (input: RevokeForm) => Promise<unknown>;
};

const iconButtonClass =
  "grid h-[30px] w-[30px] place-items-center rounded-lg border border-border-strong bg-bg-elev text-fg-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-55";
const feedbackClass = "text-[11.5px] font-medium text-fg-muted";

export function ApiKeysSection({
  apiKeys,
  issueKey,
  projectId,
  regenerateKey,
  revokeKey,
}: Readonly<ApiKeysSectionProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rollTarget, setRollTarget] = useState<ApiKeyData | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyData | null>(null);
  const hasKeys = apiKeys.length > 0;
  const canCreate = Boolean(projectId && issueKey);

  function onRevoke(apiKeyId: string) {
    if (!projectId || !revokeKey) return;

    setMessage(null);
    startTransition(() => {
      const input = revokeApiKeySchema.parse({ apiKeyId, projectId });
      void revokeKey(input)
        .then(() => {
          setRevokeTarget(null);
          setMessage("API key revoked.");
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "API key could not be revoked.")),
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
            Create key
          </Button>
        ) : null
      }
      description="Authenticate the REST API and SDKs. Keys are project-scoped and the full secret is shown only once."
      contentClassName="space-y-3"
      id="api-keys"
      title="API keys"
    >
      {hasKeys ? (
        <div className="divide-y divide-border-soft rounded-[10px] border border-border bg-bg-elev">
          {apiKeys.map((apiKey) => (
            <div className="flex items-center gap-3 p-3" key={apiKey.id}>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{apiKey.name}</span>
                {apiKey.isExpired ? (
                  <span className="mt-1 inline-flex rounded-full border border-red px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.5px] text-red">
                    Expired
                  </span>
                ) : null}
                <MonoText className="mt-0.5 truncate" size="lg">
                  {apiKey.maskedValue}
                </MonoText>
                <MonoText className="mt-1" muted>
                  {apiKey.createdLabel} · {apiKey.lastUsedLabel} · {apiKey.expiresLabel}
                </MonoText>
              </span>
              {regenerateKey || revokeKey ? (
                <span className="flex flex-none gap-1.5">
                  {regenerateKey ? (
                    <button
                      aria-label={`Roll ${apiKey.name} key`}
                      className={iconButtonClass}
                      disabled={isPending || !projectId}
                      onClick={() => {
                        setMessage(null);
                        setRollTarget(apiKey);
                      }}
                      type="button"
                    >
                      <ArrowsClockwise size={14} />
                    </button>
                  ) : null}
                  {revokeKey ? (
                    <button
                      aria-label={`Revoke ${apiKey.name} key`}
                      className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-border-strong bg-bg-elev text-red hover:border-red disabled:cursor-not-allowed disabled:opacity-55"
                      disabled={isPending || !projectId}
                      onClick={() => setRevokeTarget(apiKey)}
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
          <span className="grid h-12 w-12 place-items-center rounded-[13px] bg-bg-sunken text-fg-faint">
            <Key aria-hidden size={23} />
          </span>
          <div className="mt-3 text-[14.5px] font-semibold">No API keys yet</div>
          <p className="m-0 mt-1.5 max-w-[380px] text-[12.5px] leading-[1.55] text-fg-muted">
            Create a key to call the REST API, SDKs and CI from your own scripts.
          </p>
          {canCreate ? (
            <Button
              onClick={() => setCreateOpen(true)}
              size="sm"
              startIcon={<Plus aria-hidden size={14} weight="bold" />}
              sx={{ marginTop: "16px" }}
              type="button"
            >
              Create your first key
            </Button>
          ) : null}
        </div>
      )}
      {message ? <span className={feedbackClass}>{message}</span> : null}
      {canCreate ? (
        <ApiKeyCreateModal
          issueKey={issueKey}
          onClose={() => setCreateOpen(false)}
          onIssued={() => router.refresh()}
          open={createOpen}
          projectId={projectId}
        />
      ) : null}
      {rollTarget && regenerateKey && projectId ? (
        <ApiKeyRollModal
          apiKey={rollTarget}
          onClose={() => setRollTarget(null)}
          onRolled={() => router.refresh()}
          projectId={projectId}
          regenerateKey={regenerateKey}
        />
      ) : null}
      {revokeKey ? (
        <ConfirmModal
          busy={isPending}
          kind="revokeKey"
          onClose={() => setRevokeTarget(null)}
          onConfirm={() => {
            if (revokeTarget) onRevoke(revokeTarget.id);
          }}
          open={Boolean(revokeTarget)}
        />
      ) : null}
    </SettingsSection>
  );
}
