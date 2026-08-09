import { ENABLED_SOCIAL_PROVIDERS } from "@/lib/auth/runtime-config";
import type { ConnectedAccount } from "@/lib/queries/account";
import {
  GithubLogoIcon as GithubLogo,
  GoogleLogoIcon as GoogleLogo,
} from "@phosphor-icons/react/dist/ssr";
import { AccountSection } from "./AccountSection";
import { rowListClass } from "./account-ui";
import { ConnectAccountButton } from "./ConnectAccountButton";

export type ConnectedAccountsProps = {
  accounts: readonly ConnectedAccount[];
};

const providerMeta = {
  github: { Icon: GithubLogo, label: "GitHub" },
  google: { Icon: GoogleLogo, label: "Google" },
} as const;

export function ConnectedAccounts({ accounts }: Readonly<ConnectedAccountsProps>) {
  return (
    <AccountSection
      contentClassName="overflow-hidden p-0"
      description="Link a provider for one-click sign-in. Sign-in is by email code today; OAuth is optional."
      title="Connected accounts"
    >
      <div className={rowListClass}>
        {accounts.map(({ connected, detail, provider }) => {
          const { Icon, label } = providerMeta[provider];
          return (
            <div className="flex items-center gap-[13px] px-[18px] py-[14px]" key={provider}>
              <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-bg-sunken text-fg">
                <Icon size={19} weight="fill" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-fg">{label}</span>
                <span className="block truncate text-[11.5px] text-fg-muted">{detail}</span>
              </span>
              <ConnectAccountButton
                configured={ENABLED_SOCIAL_PROVIDERS[provider]}
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
