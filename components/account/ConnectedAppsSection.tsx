"use client";

import { Button } from "@/components/ui/Button";
import { useBrowserTimeZone } from "@/components/ui/ZonedTime";
import { createUserDateTimeFormatter, type DateFormatPreference } from "@/lib/format/user-datetime";
import type { ConnectedApp, RevokeConnectedAppOptions } from "@/lib/schemas/connected-app";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { AccountSection } from "./AccountSection";
import { ConnectedAppRevokeDialog } from "./ConnectedAppRevokeDialog";

export type ConnectedAppsSectionProps = {
  apps: readonly ConnectedApp[];
  dateFormat: DateFormatPreference;
  revokeApp: (clientId: string, options: RevokeConnectedAppOptions) => Promise<unknown>;
};

export function ConnectedAppsSection({
  apps,
  dateFormat,
  revokeApp,
}: Readonly<ConnectedAppsSectionProps>) {
  const t = useTranslations("account.security.connectedApps");
  const scopeCopy = useTranslations("account.security.connectedApps.scopes");
  const locale = useLocale();
  const timezone = useBrowserTimeZone();
  const dates = createUserDateTimeFormatter({ dateFormat, locale, timezone: timezone ?? "UTC" });
  const [target, setTarget] = useState<ConnectedApp | null>(null);
  function scopeLabel(scope: string) {
    switch (scope) {
      case "openid":
        return scopeCopy("identity");
      case "profile":
        return scopeCopy("profile");
      case "email":
        return scopeCopy("email");
      case "offline_access":
        return scopeCopy("renew");
      case "read":
      case "api:read":
        return scopeCopy("read");
      case "write":
      case "api:write":
        return scopeCopy("write");
      case "admin":
        return scopeCopy("admin");
      case "tokens:write":
        return scopeCopy("tokens");
      default:
        return scopeCopy("other", { scope });
    }
  }
  return (
    <div id="connected-apps" className="scroll-mt-6">
      <AccountSection title={t("title")} description={t("description")} contentClassName="p-0!">
        {apps.length ? (
          <div className="divide-y divide-border">
            {apps.map((app) => (
              <div key={app.clientId} className="flex flex-wrap items-start gap-3 px-4.5 py-3.5">
                <div className="min-w-0 flex-1 space-y-1 break-words">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold">{app.name}</span>
                    {app.dynamic ? (
                      <span className="rounded-full bg-bg-sunken px-2 py-0.5 text-[10px] text-fg-muted">
                        {t("dynamic")}
                      </span>
                    ) : null}
                  </div>
                  <p className="m-0 text-[12px] text-fg-muted">
                    {app.scopes.length
                      ? [...new Set(app.scopes.map(scopeLabel))].join(t("scopeSeparator"))
                      : t("noScopes")}
                  </p>
                  <p className="m-0 text-[11px] text-fg-muted" suppressHydrationWarning>
                    {t("connected", { date: dates.formatDate(new Date(app.connectedAt)) })}
                    {" · "}
                    {app.lastUsedAt
                      ? t("lastUsed", { date: dates.formatDate(new Date(app.lastUsedAt)) })
                      : t("neverUsed")}
                  </p>
                  {app.createdTokens.length ? (
                    <div className="text-[11px] text-fg-muted">
                      {t("createdTokens", { count: app.createdTokens.length })}
                      <ul className="m-0 pl-4">
                        {app.createdTokens.map((token) => (
                          <li key={token.id}>{token.name}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t("revokeApp", { name: app.name })}
                  onClick={() => setTarget(app)}
                >
                  {t("revoke")}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="m-0 px-4.5 py-6 text-[12.5px] text-fg-muted">{t("empty")}</p>
        )}
        <p className="m-0 border-t border-border px-4.5 py-3 text-[11.5px] text-fg-muted">
          {t("unlinkedTokens")}{" "}
          <a className="text-accent-text underline" href="#personal-tokens">
            {t("manageTokens")}
          </a>
        </p>
      </AccountSection>
      {target ? (
        <ConnectedAppRevokeDialog
          key={target.clientId}
          app={target}
          onClose={() => setTarget(null)}
          revokeApp={revokeApp}
        />
      ) : null}
    </div>
  );
}
