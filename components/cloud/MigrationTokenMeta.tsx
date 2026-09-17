"use client";

import { useTranslations } from "next-intl";
import type { ActiveMigrationToken, IssuedMigrationToken } from "./cloud-token";
import { minutesUntilExpiry } from "./cloud-token";

function metaFor(
  token: ActiveMigrationToken | IssuedMigrationToken,
  workspaceName: string,
  copy: {
    createdBy: (values: { email: string }) => string;
    expiresIn: (values: { count: number }) => string;
    reusable: () => string;
    scope: (values: { scope: string }) => string;
    singleUse: () => string;
  },
): string[] {
  const createdBy = "createdBy" in token ? token.createdBy.email : "you";

  return [
    copy.expiresIn({ count: minutesUntilExpiry(token.expiresAt) }),
    token.singleUse ? copy.singleUse() : copy.reusable(),
    copy.scope({ scope: token.scope }),
    workspaceName,
    copy.createdBy({ email: createdBy }),
  ];
}

export function TokenMeta({
  token,
  workspaceName,
}: Readonly<{
  token: ActiveMigrationToken | IssuedMigrationToken;
  workspaceName: string;
}>) {
  const t = useTranslations("cloudImport.token");
  const items = metaFor(token, workspaceName, {
    createdBy: (values) => t("createdBy", values),
    expiresIn: (values) => t("expiresIn", values),
    reusable: () => t("reusable"),
    scope: (values) => t("scope", values),
    singleUse: () => t("singleUse"),
  });

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-[11px] gap-y-2 font-sans tabular-nums text-[11px] text-fg-muted">
      {items.map((item, index) => (
        <span className="inline-flex items-center gap-x-[11px]" key={item}>
          {index > 0 ? <span className="h-2.5 w-px bg-border" /> : null}
          {item}
        </span>
      ))}
    </div>
  );
}
