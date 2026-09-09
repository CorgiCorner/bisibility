import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { Button } from "@/components/ui/Button";
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
  if (!isConnected || setupActive) {
    return ready && href ? (
      <Button
        fullWidth
        href={href}
        style={oauthButtonStyle}
        variant={setupActive ? "ghost" : "secondary"}
      >
        {setupActive
          ? "Use a different Google account"
          : needsReauth
            ? "Reconnect Google account"
            : "Connect Google account"}
      </Button>
    ) : (
      <DisabledButton>
        {needsReauth ? "Reconnect Google account" : "Connect Google account"}
      </DisabledButton>
    );
  }
  if (!ready || !href) return <DisabledButton>Change property</DisabledButton>;
  return (
    <>
      {loadStoredProperties ? (
        <Button
          fullWidth
          loading={pending}
          loadingLabel="Loading properties…"
          onClick={loadStoredProperties}
          style={oauthButtonStyle}
          type="button"
          variant="secondary"
        >
          Change property
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
