"use client";

import { ProviderAccessActionsSlot } from "@/components/settings/AccountDataSourceSlot";
import type { ProviderAccessSurface } from "@/lib/providers/access-scope";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useProviderAccessScope } from "./ProviderAccessScopeProvider";

export function ProviderAccessActions({
  children,
  href,
  providers,
  reconnect = false,
  surface = "rank",
}: Readonly<{
  children: ReactNode;
  href: string;
  providers?: readonly string[];
  reconnect?: boolean;
  surface?: ProviderAccessSurface;
}>) {
  const scope = useProviderAccessScope();
  const t = useTranslations("shared.providerAccess");
  if (scope?.readOnly) return null;
  if (scope && !scope.canManageProviders)
    return <p className="m-0 text-xs text-fg-muted">{t("askAdmin")}</p>;
  return (
    <ProviderAccessActionsSlot
      href={href}
      providers={providers}
      reconnect={reconnect}
      surface={surface}
    >
      {children}
    </ProviderAccessActionsSlot>
  );
}
