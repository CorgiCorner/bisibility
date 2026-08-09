"use client";

import { Button, Modal, MonoText } from "@/components/ui";
import { type RegenerateApiKeyInput, regenerateApiKeySchema } from "@/lib/schemas/apiKey";
import { actionErrorMessage } from "@/lib/ui/action-error";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  CheckCircleIcon as CheckCircle,
} from "@phosphor-icons/react";
import { useState } from "react";
import { ApiKeyRevealContent } from "./ApiKeyReveal";
import type { ApiKeyData, IssuedApiKey } from "./api-key-model";

export type ApiKeyRollModalProps = {
  apiKey: ApiKeyData;
  onClose: () => void;
  onRolled: () => void;
  projectId: string;
  regenerateKey: (input: RegenerateApiKeyInput) => Promise<IssuedApiKey>;
};

export function ApiKeyRollModal({
  apiKey,
  onClose,
  onRolled,
  projectId,
  regenerateKey,
}: Readonly<ApiKeyRollModalProps>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedKey, setIssuedKey] = useState<IssuedApiKey | null>(null);

  async function rollKey() {
    setBusy(true);
    setError(null);
    try {
      const input = regenerateApiKeySchema.parse({ apiKeyId: apiKey.id, projectId });
      const replacement = await regenerateKey(input);
      setIssuedKey(replacement);
      onRolled();
    } catch (caught) {
      setError(actionErrorMessage(caught, "API key could not be rolled."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      footer={
        issuedKey ? (
          <Button
            onClick={onClose}
            size="sm"
            startIcon={<CheckCircle aria-hidden size={15} />}
            type="button"
          >
            Done
          </Button>
        ) : (
          <>
            <Button disabled={busy} onClick={onClose} size="sm" type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              loading={busy}
              loadingLabel="Rolling"
              onClick={rollKey}
              startIcon={<ArrowsClockwise aria-hidden size={15} />}
              type="button"
            >
              Roll key
            </Button>
          </>
        )
      }
      headerDivider
      onClose={() => {
        if (!busy) onClose();
      }}
      open
      size="md"
      title={issuedKey ? "New API key" : "Roll API key"}
    >
      {issuedKey ? (
        <div className="space-y-4">
          <div className="rounded-[12px] border border-red bg-red/10 px-3.5 py-3 text-[12.5px] font-semibold text-fg">
            The old key was revoked and now returns 401.
          </div>
          <ApiKeyRevealContent issuedKey={issuedKey} showProjectGuidance />
        </div>
      ) : (
        <div>
          <dl className="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[12.5px]">
            <dt className="text-fg-muted">Name</dt>
            <dd className="m-0 font-semibold">{apiKey.name}</dd>
            <dt className="text-fg-muted">Masked value</dt>
            <dd className="m-0">
              <MonoText>{apiKey.maskedValue}</MonoText>
            </dd>
            <dt className="text-fg-muted">Created</dt>
            <dd className="m-0">{apiKey.createdLabel}</dd>
            <dt className="text-fg-muted">Last used</dt>
            <dd className="m-0">{apiKey.lastUsedLabel}</dd>
            <dt className="text-fg-muted">Expiry</dt>
            <dd className="m-0">{apiKey.expiresLabel}</dd>
          </dl>
          <div className="mt-6 rounded-[12px] border border-red bg-red/10 px-3.5 py-3">
            <p className="m-0 text-[13px] font-semibold text-fg">
              The old key stops working immediately and returns 401.
            </p>
            <p className="m-0 mt-1 text-[12px] leading-[1.5] text-fg-muted">
              Integrations using it will fail until you replace the secret with the new key.
            </p>
          </div>
          {error ? <div className="mt-4 text-[12px] font-medium text-red-text">{error}</div> : null}
        </div>
      )}
    </Modal>
  );
}
