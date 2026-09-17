"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { KeyIcon as Key } from "@phosphor-icons/react/dist/csr/Key";
import { useTranslations } from "next-intl";
import { type IssuedApiKey, storedPrefix } from "./api-key-model";

export type ApiKeyRevealContentProps = {
  issuedKey: IssuedApiKey;
  showProjectGuidance?: boolean;
};

type ApiKeySecretRevealCopy = {
  copyKey: (name: string) => string;
  guidance?: { accessSummary: string; storeSecret: string };
  key: string;
  revealStorage: string;
  revealWarning: string;
  revealedOnce: string;
  storedPrefix: (prefix: string) => string;
};

type ApiKeySecretRevealProps = ApiKeyRevealContentProps & {
  copy: ApiKeySecretRevealCopy;
};

/** Renders a one-time secret without owning a route's translation namespace. */
export function ApiKeySecretReveal({
  copy,
  issuedKey,
  showProjectGuidance = false,
}: Readonly<ApiKeySecretRevealProps>) {
  return (
    <div className="space-y-4">
      <div className="rounded-card border border-yellow bg-yellow/10 px-3.5 py-3">
        <div className="flex items-start gap-2.5">
          <Key
            aria-hidden
            className="mt-0.5 flex-none text-yellow-text"
            size={17}
            weight="regular"
          />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-fg">{copy.revealWarning}</div>
            <p className="m-0 mt-1 text-[12px] leading-[1.5] text-fg-muted">{copy.revealStorage}</p>
          </div>
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2">
          <div className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            {copy.key}
          </div>
          <span className="rounded-control border border-border px-2 py-1 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            {copy.revealedOnce}
          </span>
        </div>
        <div className="mt-[7px] flex items-center gap-2 rounded-control border border-border bg-transparent px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate">{issuedKey.raw}</span>
          <CopyButton label={copy.copyKey(issuedKey.name)} size="md" text={issuedKey.raw} />
        </div>
        <span className="mt-2">{copy.storedPrefix(storedPrefix(issuedKey.maskedValue))}</span>
      </div>
      {showProjectGuidance && copy.guidance ? (
        <div className="space-y-1.5 text-[12.5px] text-fg-muted">
          <p className="m-0 font-semibold text-fg">{copy.guidance.accessSummary}</p>
          <p className="m-0">{copy.guidance.storeSecret}</p>
        </div>
      ) : null}
    </div>
  );
}

export function ApiKeyRevealContent({
  issuedKey,
  showProjectGuidance = false,
}: Readonly<ApiKeyRevealContentProps>) {
  const t = useTranslations("projectSettingsDevelopers.apiKeys");
  const expiry =
    issuedKey.expiresInDays === 30
      ? t("expiry.30")
      : issuedKey.expiresInDays === 90
        ? t("expiry.90")
        : issuedKey.expiresInDays === null
          ? t("expiry.never")
          : null;
  const scope =
    issuedKey.scope === "read"
      ? t("scope.read")
      : issuedKey.scope === "write"
        ? t("scope.write")
        : t("scope.admin");
  // The row behind this modal words the same key as "never expires". Say the same thing here
  // rather than echoing the picker caption, so one page does not name one state two ways.
  const expirySummary =
    issuedKey.expiresInDays === null
      ? t("neverExpiresSummary")
      : expiry
        ? t("expiresSummary", { expiry })
        : null;
  return (
    <ApiKeySecretReveal
      copy={{
        copyKey: (name) => t("copyKey", { name }),
        guidance:
          issuedKey.scope && expirySummary
            ? {
                accessSummary: t("accessSummary", { expiry: expirySummary, scope }),
                storeSecret: t("storeSecret"),
              }
            : undefined,
        key: t("key"),
        revealStorage: t("revealStorage"),
        revealWarning: t("revealWarning"),
        revealedOnce: t("revealedOnce"),
        storedPrefix: (prefix) => t("storedPrefix", { prefix }),
      }}
      issuedKey={issuedKey}
      showProjectGuidance={showProjectGuidance}
    />
  );
}
