import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ConnectedGoogleAccountFooter } from "./ConnectedGoogleAccountFooter";

type ConnectDrawerOauthActionsProps = {
  accountEmail?: string;
  disconnectDisabled: boolean;
  href?: string;
  isConnected: boolean;
  loadStoredProperties?: () => void;
  needsReauth: boolean;
  onDisconnect: () => void;
  pending: boolean;
  ready: boolean;
  setupActive: boolean;
};

const oauthButtonStyle = {
  gap: "9px",
  minHeight: 40,
  "--control-hover-border-color": "var(--accent)",
  "--control-focus-border-color": "var(--accent)",
} as const;

function DisabledButton({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ProjectReadOnlyTooltip className="block">
      <Button disabled fullWidth style={oauthButtonStyle} type="button" variant="secondary">
        {children}
      </Button>
    </ProjectReadOnlyTooltip>
  );
}

export function ConnectDrawerOauthActions({
  accountEmail,
  disconnectDisabled,
  href,
  isConnected,
  loadStoredProperties,
  needsReauth,
  onDisconnect,
  pending,
  ready,
  setupActive,
}: Readonly<ConnectDrawerOauthActionsProps>) {
  const t = useTranslations("projectIntegrations.oauth");
  if (!isConnected || setupActive) {
    return ready && href ? (
      <Button
        fullWidth
        href={href}
        style={oauthButtonStyle}
        variant={setupActive ? "ghost" : "secondary"}
      >
        {setupActive
          ? t("useDifferentAccount")
          : needsReauth
            ? t("reconnectAccount")
            : t("connectAccount")}
      </Button>
    ) : (
      <DisabledButton>{needsReauth ? t("reconnectAccount") : t("connectAccount")}</DisabledButton>
    );
  }
  if (!ready || !href) return <DisabledButton>{t("changeProperty")}</DisabledButton>;
  return (
    <>
      {loadStoredProperties ? (
        <Button
          fullWidth
          loading={pending}
          loadingLabel={t("loadingProperties")}
          onClick={loadStoredProperties}
          style={oauthButtonStyle}
          type="button"
          variant="secondary"
        >
          {t("changeProperty")}
        </Button>
      ) : null}
      <ConnectedGoogleAccountFooter
        accountEmail={accountEmail}
        disconnectDisabled={disconnectDisabled}
        onDisconnect={onDisconnect}
        switchAccountHref={href}
      />
    </>
  );
}
