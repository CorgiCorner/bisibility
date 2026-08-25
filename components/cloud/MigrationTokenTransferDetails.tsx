"use client";

import { MigrationReachabilityHint } from "@/components/settings/migration/MigrationReachabilityHint";
import { CopyButton } from "@/components/ui";
import type { IssuedMigrationToken } from "./cloud-token";
import { remainingMinutesLabel } from "./cloud-token";

function scopeLabel(scope: IssuedMigrationToken["scope"]) {
  return scope === "full" ? "Full project" : "Keywords";
}

function CopyRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center gap-2 border-border-soft border-b px-3.5 py-3 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          {label}
        </span>
        <span className="mt-1 block truncate font-mono text-[13px] font-semibold text-fg">
          {value}
        </span>
      </span>
      <CopyButton label={`Copy ${label}`} size="md" text={value} />
    </div>
  );
}

function DetailRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">{label}</dt>
      <dd className="m-0 min-w-0 text-right text-[13px] text-fg">{value}</dd>
    </div>
  );
}

export function MigrationTokenTransferDetails({
  destinationUrl,
  token,
  workspaceName,
}: Readonly<{
  destinationUrl?: string;
  token: IssuedMigrationToken;
  workspaceName: string;
}>) {
  const expires = `${remainingMinutesLabel(token.expiresAt)} · ${
    token.singleUse ? "single use" : "reusable"
  }`;

  return (
    <div>
      <div className="text-[14.5px] font-semibold">Token created</div>
      <p className="mt-1.5 text-[13px] leading-[1.55] text-fg-muted">
        Copy this token now. For security, it cannot be shown again after you refresh or leave this
        page.
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-bg-sunken">
        {destinationUrl ? <CopyRow label="Destination URL" value={destinationUrl} /> : null}
        <CopyRow label="Migration token" value={token.token} />
      </div>
      {destinationUrl ? (
        <div className="mt-3">
          <MigrationReachabilityHint surface="destination" targetOrigin={destinationUrl} />
        </div>
      ) : null}
      <dl className="m-0 mt-4 border-border-soft border-t pt-2">
        <DetailRow label="Target project" value={workspaceName} />
        <DetailRow label="Scope" value={scopeLabel(token.scope)} />
        <DetailRow label="Expires" value={expires} />
      </dl>
    </div>
  );
}
