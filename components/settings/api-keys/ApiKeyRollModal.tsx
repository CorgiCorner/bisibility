"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { useDeveloperActionError } from "@/components/settings/developers/useDeveloperActionError";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatDisplayDateTime } from "@/lib/dates/format";
import { type RegenerateApiKeyInput, regenerateApiKeySchema } from "@/lib/schemas/apiKey";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { useTranslations } from "next-intl";
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
  const dateDisplay = useDateDisplay();
  const presentActionError = useDeveloperActionError();
  const t = useTranslations("projectSettingsDevelopers.apiKeys");
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
      setError(presentActionError.apiKey(caught, t("errors.roll")));
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
            startIcon={<CheckCircle aria-hidden size={15} weight="regular" />}
            type="button"
          >
            {t("done")}
          </Button>
        ) : (
          <>
            <Button disabled={busy} onClick={onClose} size="sm" type="button" variant="ghost">
              {t("cancel")}
            </Button>
            <Button
              loading={busy}
              loadingLabel={t("rolling")}
              onClick={rollKey}
              startIcon={<ArrowsClockwise aria-hidden size={15} weight="regular" />}
              type="button"
            >
              {t("roll")}
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
      title={issuedKey ? t("newTitle") : t("rollTitle")}
    >
      {issuedKey ? (
        <div className="space-y-4">
          <div className="rounded-card border border-red bg-red/10 px-3.5 py-3 text-[12.5px] font-semibold text-fg">
            {t("oldRevoked")}
          </div>
          <ApiKeyRevealContent issuedKey={issuedKey} showProjectGuidance />
        </div>
      ) : (
        <div>
          <dl className="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[12.5px]">
            <dt className="text-fg-muted">{t("name")}</dt>
            <dd className="m-0 font-semibold">{apiKey.name}</dd>
            <dt className="text-fg-muted">{t("maskedValue")}</dt>
            <dd className="m-0">
              <span>{apiKey.maskedValue}</span>
            </dd>
            <dt className="text-fg-muted">{t("createdLabel")}</dt>
            <dd className="m-0">
              {t("created", {
                date: formatDisplayDateTime(new Date(apiKey.createdAt), dateDisplay),
              })}
            </dd>
            <dt className="text-fg-muted">{t("lastUsedLabel")}</dt>
            <dd className="m-0">
              {apiKey.lastUsedAt
                ? t("lastUsed", {
                    date: formatDisplayDateTime(new Date(apiKey.lastUsedAt), dateDisplay),
                  })
                : t("lastUsedNever")}
            </dd>
            <dt className="text-fg-muted">{t("expiryLabel")}</dt>
            <dd className="m-0">
              {!apiKey.expiresAt
                ? t("neverExpires")
                : apiKey.isExpired
                  ? t("expired", {
                      date: formatDisplayDateTime(new Date(apiKey.expiresAt), dateDisplay),
                    })
                  : t("expires", {
                      date: formatDisplayDateTime(new Date(apiKey.expiresAt), dateDisplay),
                    })}
            </dd>
          </dl>
          <div className="mt-6 rounded-card border border-red bg-red/10 px-3.5 py-3">
            <p className="m-0 text-[13px] font-semibold text-fg">{t("rollWarningTitle")}</p>
            <p className="m-0 mt-1 text-[12px] leading-[1.5] text-fg-muted">
              {t("rollWarningDescription")}
            </p>
          </div>
          {error ? <div className="mt-4 text-[12px] font-medium text-red-text">{error}</div> : null}
        </div>
      )}
    </Modal>
  );
}
