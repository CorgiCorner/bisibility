"use client";

import type { ConnectedAccount } from "@/lib/queries/account";
import { GithubLogoIcon as GithubLogo } from "@phosphor-icons/react/dist/ssr/GithubLogo";
import { GoogleLogoIcon as GoogleLogo } from "@phosphor-icons/react/dist/ssr/GoogleLogo";
import { useTranslations } from "next-intl";
import { AccountSection } from "./AccountSection";
import { rowListClass } from "./account-ui";
import { ConnectAccountButton } from "./ConnectAccountButton";

export type ConnectedAccountsProps = {
  accounts: readonly ConnectedAccount[];
  configuredProviders: Readonly<Record<keyof typeof providerMeta, boolean>>;
};

const providerMeta = {
  github: { Icon: GithubLogo, label: "GitHub" },
  google: { Icon: GoogleLogo, label: "Google" },
} as const;

export function ConnectedAccounts({
  accounts,
  configuredProviders,
}: Readonly<ConnectedAccountsProps>) {
  const t = useTranslations("account.connected");

  return (
    <AccountSection
      contentClassName="overflow-hidden p-0"
      description={t("description")}
      title={t("title")}
    >
      <div className={rowListClass}>
        {accounts.map(({ connected, provider }) => {
          const { Icon, label } = providerMeta[provider];
          const detail = connected
            ? t("connectedDetail", { provider: label })
            : t("notConnectedDetail");
          return (
            <div className="flex items-center gap-[13px] px-4.5 py-3.5" key={provider}>
              <span className="grid h-8.5 w-[34px] flex-none place-items-center rounded-control bg-bg-sunken text-fg">
                <Icon size={19} weight="regular" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-fg">{label}</span>
                <span className="block truncate text-[11.5px] text-fg-muted">{detail}</span>
              </span>
              <ConnectAccountButton
                configured={configuredProviders[provider]}
                connected={connected}
                label={label}
                provider={provider}
              />
            </div>
          );
        })}
      </div>
    </AccountSection>
  );
}
