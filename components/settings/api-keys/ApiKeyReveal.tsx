"use client";

import { CopyButton, MonoText } from "@/components/ui";
import { KeyIcon as Key } from "@phosphor-icons/react";
import {
  apiKeyExpiryChoiceLabel,
  apiKeyScopeLabel,
  type IssuedApiKey,
  storedPrefix,
} from "./api-key-model";

export type ApiKeyRevealContentProps = {
  issuedKey: IssuedApiKey;
  showProjectGuidance?: boolean;
};

export function ApiKeyRevealContent({
  issuedKey,
  showProjectGuidance = false,
}: Readonly<ApiKeyRevealContentProps>) {
  const expiry = apiKeyExpiryChoiceLabel(issuedKey.expiresInDays);
  // The row behind this modal words the same key as "never expires". Say the same thing here
  // rather than echoing the picker caption, so one page does not name one state two ways.
  const expirySummary = issuedKey.expiresInDays === null ? "never expires" : `Expires: ${expiry}`;
  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-yellow bg-yellow/10 px-3.5 py-3">
        <div className="flex items-start gap-2.5">
          <Key aria-hidden className="mt-0.5 flex-none text-yellow" size={17} weight="fill" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-fg">
              Copy your key now - it will not be shown again.
            </div>
            <p className="m-0 mt-1 text-[12px] leading-[1.5] text-fg-muted">
              Bisibility stores only a hash and display prefix after this window closes.
            </p>
          </div>
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
            API key
          </div>
          <span className="rounded-[7px] border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
            Revealed once
          </span>
        </div>
        <div className="mt-[7px] flex items-center gap-2 rounded-[10px] border border-border-strong bg-bg-sunken px-3 py-2.5">
          <MonoText className="min-w-0 flex-1 truncate" size="lg">
            {issuedKey.raw}
          </MonoText>
          <CopyButton label={`Copy ${issuedKey.name} key`} size="md" text={issuedKey.raw} />
        </div>
        <MonoText className="mt-2" muted>
          Stored prefix: {storedPrefix(issuedKey.maskedValue)}
        </MonoText>
      </div>
      {showProjectGuidance && issuedKey.scope && expiry ? (
        <div className="space-y-1.5 text-[12.5px] text-fg-muted">
          <p className="m-0 font-semibold text-fg">
            Access: {apiKeyScopeLabel(issuedKey.scope)} · {expirySummary}
          </p>
          <p className="m-0">Store this secret in a secret manager before closing this window.</p>
        </div>
      ) : null}
    </div>
  );
}
