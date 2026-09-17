"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { useTranslations } from "next-intl";
import type { IssuedMigrationToken } from "./cloud-token";
import { minutesUntilExpiry } from "./cloud-token";
import { LocalizedCloudDestinationReachabilityHint } from "./LocalizedCloudDestinationReachabilityHint";

function CopyRow({
  copyLabel,
  label,
  value,
}: Readonly<{ copyLabel: string; label: string; value: string }>) {
  return (
    <div className="flex items-center gap-2 border-border border-b px-3.5 py-3 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          {label}
        </span>
        <span className="mt-1 block truncate font-sans tabular-nums text-[13px] font-semibold text-fg">
          {value}
        </span>
      </span>
      <CopyButton label={copyLabel} size="md" text={value} />
    </div>
  );
}

function DetailRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        {label}
      </dt>
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
  const t = useTranslations("cloudImport.token");
  const expires = t("expiryDetails", {
    kind: token.singleUse ? t("singleUseDetails") : t("reusableDetails"),
    remaining: t("remaining", { count: minutesUntilExpiry(token.expiresAt) }),
  });

  return (
    <div>
      <div className="text-[14.5px] font-semibold">{t("createdTitle")}</div>
      <p className="mt-1.5 text-[13px] leading-[1.55] text-fg-muted">{t("valueHidden")}</p>
      <div className="mt-4 overflow-hidden rounded-card border border-border bg-bg-sunken">
        {destinationUrl ? (
          <CopyRow
            copyLabel={t("copy", { label: t("destinationUrl") })}
            label={t("destinationUrl")}
            value={destinationUrl}
          />
        ) : null}
        <CopyRow
          copyLabel={t("copy", { label: t("header") })}
          label={t("header")}
          value={token.token}
        />
      </div>
      {destinationUrl ? (
        <div className="mt-3">
          <LocalizedCloudDestinationReachabilityHint
            surface="destination"
            targetOrigin={destinationUrl}
          />
        </div>
      ) : null}
      <dl className="m-0 mt-4 border-border border-t pt-2">
        <DetailRow label={t("targetProject")} value={workspaceName} />
        <DetailRow
          label={t("scopeLabel")}
          value={token.scope === "full" ? t("scopeFull") : t("scopeKeywords")}
        />
        <DetailRow label={t("expires")} value={expires} />
      </dl>
    </div>
  );
}
